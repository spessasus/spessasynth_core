// The SF2 conversion rules with compressed samples (SF3), encoded by ffmpeg through a pipe
// Also an SFe file with compressed samples
// Needs ffmpeg with libvorbis, skips without it
import { spawn, spawnSync } from "node:child_process";
import {
    BasicInstrument,
    BasicPreset,
    BasicSoundBank,
    type GeneratorType,
    GeneratorTypes,
    type MIDIController,
    MIDIControllers,
    Modulator,
    ModulatorControllerSources,
    ModulatorCurveTypes,
    ModulatorSource,
    SoundBankLoader,
    SpessaLog
} from "../../../src";
import { check, finish, noiseSample, sineSample } from "./sfe_test_utils";

SpessaLog.infoEnabled = false;

// The built-in vorbis encoder of ffmpeg only takes stereo, and SF3 samples are mono
const encoders = spawnSync("ffmpeg", ["-hide_banner", "-encoders"], {
    encoding: "utf8"
});
if (encoders.error || encoders.status !== 0) {
    console.info("sf3_conversion_test: ffmpeg was not found, skipping.");
    process.exit(0);
}
if (!/\blibvorbis\b/.test(encoders.stdout)) {
    console.info(
        "sf3_conversion_test: ffmpeg has no libvorbis encoder, skipping. The built-in one only encodes stereo."
    );
    process.exit(0);
}

/**
 * Encodes mono float PCM to Ogg Vorbis with ffmpeg, through stdin and stdout.
 */
const encodeVorbis = (audioData: Float32Array, sampleRate: number) =>
    new Promise<Uint8Array>((resolve, reject) => {
        const ffmpeg = spawn("ffmpeg", [
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "f32le",
            "-ar",
            sampleRate.toString(),
            "-ac",
            "1",
            "-i",
            "pipe:0",
            "-c:a",
            "libvorbis",
            "-f",
            "ogg",
            "pipe:1"
        ]);
        const chunks = new Array<Buffer>();
        let errors = "";
        ffmpeg.stdout.on("data", (chunk: Buffer) => {
            chunks.push(chunk);
        });
        ffmpeg.stderr.on(
            "data",
            (chunk: Buffer) => (errors += chunk.toString())
        );
        ffmpeg.on("error", reject);
        ffmpeg.on("close", (code) => {
            if (code === 0) resolve(new Uint8Array(Buffer.concat(chunks)));
            else
                reject(new Error(`ffmpeg exited with code ${code}: ${errors}`));
        });
        ffmpeg.stdin.end(
            Buffer.from(
                audioData.buffer,
                audioData.byteOffset,
                audioData.byteLength
            )
        );
    });

const cc = (controller: MIDIController) =>
    new ModulatorSource(controller, ModulatorCurveTypes.linear, true);

const send = (
    amount: number,
    controller: MIDIController,
    destination: GeneratorType
) => new Modulator(cc(controller), new ModulatorSource(), destination, amount);

const range = () =>
    new ModulatorSource(
        ModulatorControllerSources.modulationDepthRange,
        ModulatorCurveTypes.linear,
        false
    );

// Two samples so that the smpl chunk holds more than one stream, one of them looped
const buildBank = () => {
    const bank = new BasicSoundBank();
    const sine = sineSample();
    const noise = noiseSample();
    bank.addSamples(sine, noise);
    const inst = new BasicInstrument();
    inst.name = "test";
    const zone = inst.createZone(sine);
    zone.setGenerator(GeneratorTypes.sampleModes, 1);
    zone.setGenerator(GeneratorTypes.initialAttenuation, 120);
    zone.addModulators(
        send(
            1000,
            MIDIControllers.reverbDepth,
            GeneratorTypes.reverbEffectsSend
        ),
        send(
            503,
            MIDIControllers.chorusDepth,
            GeneratorTypes.chorusEffectsSend
        ),
        // The mod wheel vibrato in the SFe form, SF2 stores it as 50 with no amount source
        new Modulator(
            cc(MIDIControllers.modulationWheel),
            range(),
            GeneratorTypes.vibLfoToPitch,
            1600
        ),
        // SF2 has no vibLfoToVolume, so this one is lost
        new Modulator(
            cc(MIDIControllers.modulationWheel),
            new ModulatorSource(),
            GeneratorTypes.vibLfoToVolume,
            100
        )
    );
    inst.createZone(noise);
    bank.addInstruments(inst);
    const preset = new BasicPreset(bank);
    preset.name = "test";
    const presetZone = preset.createZone(inst);
    presetZone.setGenerator(GeneratorTypes.initialAttenuation, 60);
    bank.addPresets(preset);
    bank.flush();
    return bank;
};

const describeModulator = (m: Modulator) =>
    `${m.primarySource.toString()} | ${m.secondarySource.toString()} | ${m.destination} | ${m.transformAmount} | ${m.transformType}`;

// Everything the conversion rules touch, as one comparable object
const describe = (bank: BasicSoundBank) => {
    const zone = bank.instruments[0].zones[0];
    const presetZone = bank.presets[0].zones[0];
    const generator = (
        z: typeof zone | typeof presetZone,
        type: GeneratorType
    ) => z.generators.find((g) => g.type === type)?.value;
    const modulator = (destination: GeneratorType) =>
        zone.modulators.find((m) => m.destination === destination);
    const vibrato = modulator(GeneratorTypes.vibLfoToPitch);
    const defaultVibrato = bank.defaultModulators.find(
        (m) =>
            m.primarySource.isController(MIDIControllers.modulationWheel) &&
            m.destination === GeneratorTypes.vibLfoToPitch
    );
    return {
        instrumentAttenuation: generator(
            zone,
            GeneratorTypes.initialAttenuation
        ),
        presetAttenuation: generator(
            presetZone,
            GeneratorTypes.initialAttenuation
        ),
        reverb: modulator(GeneratorTypes.reverbEffectsSend)?.transformAmount,
        chorus: modulator(GeneratorTypes.chorusEffectsSend)?.transformAmount,
        vibrato: vibrato?.transformAmount,
        vibratoSource: vibrato?.secondarySource.index,
        vibLfoToVolume: modulator(GeneratorTypes.vibLfoToVolume)
            ?.transformAmount,
        defaultVibrato: defaultVibrato?.transformAmount,
        defaultVibratoSource: defaultVibrato?.secondarySource.index,
        defaultModulators: bank.defaultModulators.map((m) =>
            describeModulator(m)
        ),
        zoneModulators: zone.modulators.map((m) => describeModulator(m)),
        loops: bank.samples.map((s) => [s.loopStart, s.loopEnd, s.sampleRate])
    };
};

const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);

// The modulator lists are long, so only their size goes into the message
const show = (value: unknown) =>
    Array.isArray(value) && value.length > 2
        ? `${value.length} entries`
        : JSON.stringify(value);

const find4 = (data: Uint8Array, fourCC: string) => {
    for (let i = 0; i < data.length - 4; i++)
        if (
            String.fromCharCode(
                data[i],
                data[i + 1],
                data[i + 2],
                data[i + 3]
            ) === fourCC
        )
            return i;
    return -1;
};

// The ifil sub-chunk of the file itself, not what the reader reports
const fileVersion = (data: Uint8Array) => {
    const position = find4(data, "ifil");
    if (position < 0) return "none";
    const view = new DataView(data.buffer, data.byteOffset + position + 8, 4);
    return `${view.getUint16(0, true)}.${view.getUint16(2, true)}`;
};

await BasicSoundBank.ready;

const bank = buildBank();
const lengths = bank.samples.map((s) => s.sampleLength);
const lossesBefore = bank.getSF2Losses();
const sf2File = new Uint8Array(bank.writeSF2());
const sf2Back = SoundBankLoader.fromArrayBuffer(sf2File.buffer);
const sfePlainBack = SoundBankLoader.fromArrayBuffer(bank.writeSFe());

console.info("Compressing with ffmpeg:");
await bank.setSampleFormat({
    format: "compressed",
    compressionFunction: encodeVorbis,
    rejectOnFailure: true
});
check(
    bank.samples.every((s) => s.isCompressed),
    "every sample is compressed"
);
check(
    lossesBefore.modulators === 1 && lossesBefore.sendAmounts === 1,
    `the loss report counts the vibLfoToVolume modulator and the send of 503 (${JSON.stringify(lossesBefore)})`
);
check(
    same(bank.getSF2Losses(), lossesBefore),
    "compressing does not change the loss report"
);

console.info("SF3 file:");
const sf3File = new Uint8Array(bank.writeSF2());
check(
    fileVersion(sf2File) === "2.4",
    `the uncompressed file says ifil 2.4 (${fileVersion(sf2File)})`
);
check(
    fileVersion(sf3File) === "3.0",
    `the compressed file says ifil 3.0 (${fileVersion(sf3File)})`
);
const smpl = find4(sf3File, "smpl");
check(
    smpl >= 0 &&
        String.fromCharCode(...sf3File.subarray(smpl + 8, smpl + 12)) ===
            "OggS",
    "the sample data starts with OggS"
);
check(
    sf3File.length < sf2File.length,
    `the compressed file is smaller (${sf3File.length} against ${sf2File.length} bytes)`
);

const sf3Back = SoundBankLoader.fromArrayBuffer(sf3File.buffer);
check(
    sf3Back.soundBankInfo.version.major === 3 && sf3Back.type === "sf2",
    `the reader sees a version 3 SoundFont 2 file (${sf3Back.soundBankInfo.version.major}.${sf3Back.soundBankInfo.version.minor}, ${sf3Back.type})`
);
check(
    sf3Back.samples.every(
        (s) =>
            s.isCompressed &&
            String.fromCharCode(...s.getRawData(true).subarray(0, 4)) === "OggS"
    ),
    "every sample reads back compressed, each stream starts with OggS"
);

const expected = describe(sf2Back);
const actual = describe(sf3Back);
for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
    check(
        same(actual[key], expected[key]),
        `${key} reads back as from an uncompressed SF2 file (${show(actual[key])})`
    );
}
// The values themselves, so that both files being wrong in the same way is caught too
check(
    expected.instrumentAttenuation === 120 && expected.presetAttenuation === 60,
    `the attenuations are 120 and 60 (${expected.instrumentAttenuation}, ${expected.presetAttenuation})`
);
check(
    expected.reverb === 1000 && expected.chorus === 505,
    `the sends read back as 1000 and 505 (${expected.reverb}, ${expected.chorus})`
);
check(
    expected.vibrato === 1600 &&
        expected.vibratoSource ===
            ModulatorControllerSources.modulationDepthRange &&
        expected.defaultVibrato === 1600 &&
        expected.defaultVibratoSource ===
            ModulatorControllerSources.modulationDepthRange,
    `the zone and the default vibrato read back as 1600 from the Modulation Depth Range (${expected.vibrato}, ${expected.defaultVibrato})`
);
check(
    expected.vibLfoToVolume === undefined,
    "the vibLfoToVolume modulator is dropped"
);
check(
    same(sf3Back.getSF2Losses(), sf2Back.getSF2Losses()),
    `the loss report of the SF3 bank is that of the SF2 bank (${JSON.stringify(sf3Back.getSF2Losses())})`
);

console.info("Decoding:");
try {
    const decoded = sf3Back.samples.map((s) => s.getAudioData());
    for (const [i, data] of decoded.entries()) {
        let peak = 0;
        for (const x of data) peak = Math.max(peak, Math.abs(x));
        check(
            Math.abs(data.length - lengths[i]) <= lengths[i] * 0.01 &&
                peak > 0.1,
            `sample ${i} decodes to ${data.length} points (written ${lengths[i]}), peak ${peak.toFixed(3)}`
        );
    }
} catch (error) {
    console.info(
        `  Vorbis decoding is not available here, not checked: ${String(error)}`
    );
}

console.info("SFe file with compressed samples:");
const sfeFile = new Uint8Array(bank.writeSFe());
check(
    fileVersion(sfeFile) === "4.0",
    `the SFe file says ifil 4.0 (${fileVersion(sfeFile)})`
);
const sfeBack = SoundBankLoader.fromArrayBuffer(sfeFile.buffer);
check(
    sfeBack.type === "sfe" && sfeBack.samples.every((s) => s.isCompressed),
    "it reads back as SFe with compressed samples"
);
const sfeExpected = describe(sfePlainBack);
const sfeActual = describe(sfeBack);
for (const key of Object.keys(sfeExpected) as (keyof typeof sfeExpected)[]) {
    check(
        same(sfeActual[key], sfeExpected[key]),
        `${key} keeps its SFe value (${show(sfeActual[key])})`
    );
}
check(
    sfeExpected.chorus === 503 &&
        sfeExpected.vibLfoToVolume === 100 &&
        sfeExpected.instrumentAttenuation === 120,
    `the SFe values are exact (chorus ${sfeExpected.chorus}, vibLfoToVolume ${sfeExpected.vibLfoToVolume})`
);
check(
    same(sfeBack.getSF2Losses(), lossesBefore),
    "the loss report is that of the bank before compressing"
);
try {
    const decoded = sfeBack.samples.map((s) => s.getAudioData().length);
    check(
        decoded.every(
            (length, i) => Math.abs(length - lengths[i]) <= lengths[i] * 0.01
        ),
        `the SFe samples decode (${decoded.join(", ")} points)`
    );
} catch (error) {
    console.info(
        `  Vorbis decoding is not available here, not checked: ${String(error)}`
    );
}

finish("sf3_conversion_test");
