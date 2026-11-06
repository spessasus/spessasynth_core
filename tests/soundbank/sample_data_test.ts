import {
    BasicSample,
    BasicSoundBank,
    SampleTypes,
    SoundBankLoader,
    SpessaLog
} from "../../src";
import fs from "node:fs/promises";

// Checks loading without sample data, loading with views, sample lengths and stored data
// Usage: tsx sample_data_test.ts <bank paths...> (SF2, SF3, SFE or DLS)

SpessaLog.setLogLevel(false, false, false);
await BasicSoundBank.ready;

let failures = 0;
const check = (ok: boolean, message: string) => {
    if (!ok) {
        failures++;
        console.error("FAIL:", message);
    }
};

const sameArray = (a: ArrayLike<number>, b: ArrayLike<number>) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
};

const throws = (f: () => unknown) => {
    try {
        f();
        return false;
    } catch {
        return true;
    }
};

const describe = (s: BasicSample) =>
    [
        s.name,
        s.sampleRate,
        s.originalKey,
        s.pitchCorrection,
        s.loopStart,
        s.loopEnd,
        s.sampleType,
        s.linkedSample?.name,
        s.isCompressed
    ].join("|");

const write = (b: BasicSoundBank) =>
    new Uint8Array(b.writeSF2({ writeExtendedLimits: true }));

for (const path of process.argv.slice(2)) {
    const file = await fs.readFile(path);
    const buffer = file.buffer.slice(
        file.byteOffset,
        file.byteOffset + file.byteLength
    );
    const start = performance.now();
    const full = SoundBankLoader.fromArrayBuffer(buffer);
    const fullTime = performance.now() - start;
    const views = SoundBankLoader.fromArrayBuffer(buffer, {
        copySampleData: false
    });
    const viewTime = performance.now() - start - fullTime;
    const empty = SoundBankLoader.fromArrayBuffer(buffer, {
        sampleData: false
    });
    const emptyTime = performance.now() - start - fullTime - viewTime;

    // Same structure and order
    check(
        full.samples.length === empty.samples.length &&
            full.samples.length === views.samples.length,
        `${path}: sample counts differ`
    );
    check(
        full.presets.map((p) => p.name).join(",") ===
            empty.presets.map((p) => p.name).join(",") &&
            full.instruments.map((i) => i.name).join(",") ===
                empty.instruments.map((i) => i.name).join(","),
        `${path}: preset or instrument order differs`
    );

    let lengthMismatches = 0;
    // Vorbis streams with granule gaps cannot be measured without decoding, so they are only counted
    let vorbisMismatches = 0;
    let vorbisCount = 0;
    for (const [i, f] of full.samples.entries()) {
        const v = views.samples[i];
        const e = empty.samples[i];
        check(
            describe(f) === describe(e) && describe(f) === describe(v),
            `${path}: sample ${i} metadata differs: ${describe(f)} / ${describe(e)} / ${describe(v)}`
        );

        // Lengths known before decoding must match the decoded length
        const lengthBefore = f.sampleLength;
        const emptyLength = e.sampleLength;
        const decoded = f.getAudioData();
        if (f.isCompressed) vorbisCount++;
        check(
            lengthBefore === emptyLength,
            `${path}: ${f.name} no data length differs`
        );
        check(
            f.sampleLength === decoded.length,
            `${path}: ${f.name} length after decoding is not the decoded one`
        );
        if (f.isCompressed && lengthBefore !== decoded.length) {
            vorbisMismatches++;
        } else if (lengthBefore !== decoded.length) {
            lengthMismatches++;
            if (lengthMismatches < 5)
                console.error(
                    `${path}: ${f.name} length ${lengthBefore} (no data ${emptyLength}), decoded ${decoded.length}`
                );
        }

        // Views decode the same
        check(
            sameArray(v.getAudioData(), decoded),
            `${path}: view data differs for ${f.name}`
        );

        // No data
        check(!e.hasData && f.hasData, `${path}: hasData wrong for ${f.name}`);
        check(
            throws(() => e.getAudioData()) && throws(() => e.getRawData(true)),
            `${path}: reading a sample without data did not throw`
        );

        // Stored data moves without changes
        const stored = f.getStoredData();
        e.setStoredData(stored);
        check(
            sameArray(e.getRawData(true), f.getRawData(true)),
            `${path}: stored data round trip differs for ${f.name}`
        );
        check(
            !f.isCompressed || stored.form === "vorbis",
            `${path}: compressed sample not stored as vorbis`
        );
    }
    check(
        lengthMismatches === 0,
        `${path}: ${lengthMismatches} length mismatches`
    );

    // Writing the copied, viewed and restored banks gives the same file
    const fullOut = write(full);
    check(
        sameArray(fullOut, write(views)),
        `${path}: view bank writes differently`
    );
    check(
        sameArray(fullOut, write(empty)),
        `${path}: restored bank writes differently`
    );

    // Release keeps the length
    const s = full.samples[0];
    const length = s.sampleLength;
    s.releaseData();
    check(
        !s.hasData && s.sampleLength === length,
        `${path}: releaseData lost the length`
    );

    if (vorbisCount > 0)
        console.info(
            `${path}: ${vorbisMismatches} of ${vorbisCount} vorbis lengths differ from the decoded length`
        );
    console.info(
        `${path}: ${full.samples.length} samples, load ${fullTime.toFixed(0)} ms, views ${viewTime.toFixed(0)} ms, no data ${emptyTime.toFixed(0)} ms`
    );
}

// S16le data at an odd byte offset decodes right
{
    const values = [0, 1000, -1000, 32_767, -32_768, 12_345];
    const bytes = new Uint8Array(values.length * 2 + 1);
    bytes.set(new Uint8Array(Int16Array.from(values).buffer), 1);
    const s = new BasicSample(
        "odd",
        44_100,
        60,
        0,
        SampleTypes.monoSample,
        0,
        1
    );
    s.setStoredData({ form: "s16le", data: bytes.subarray(1) });
    const decoded = s.getAudioData();
    check(
        sameArray(
            decoded,
            values.map((v) => v / 32_768)
        ),
        "odd offset s16le decode"
    );
    check(s.sampleLength === values.length, "odd offset length");
}

// SetSampleFormat reports resampled samples and skips nothing else
{
    const bank = new BasicSoundBank();
    const low = new BasicSample(
        "low",
        4000,
        60,
        0,
        SampleTypes.monoSample,
        10,
        100
    );
    low.setAudioData(new Float32Array(400).fill(0.25), 4000);
    const normal = new BasicSample(
        "normal",
        44_100,
        60,
        0,
        SampleTypes.monoSample,
        10,
        100
    );
    normal.setAudioData(new Float32Array(400).fill(0.25), 44_100);
    bank.addSamples(low, normal);
    const changed = await bank.setSampleFormat({
        format: "compressed",
        compressionFunction: () => Promise.resolve(new Uint8Array(4))
    });
    check(
        changed.length === 1 && changed[0] === low,
        `setSampleFormat changed list: ${changed.map((c) => c.name).join(",")}`
    );
}

if (failures > 0) {
    console.error(`${failures} checks failed`);
    process.exit(1);
}
console.info("All sample data checks passed.");
