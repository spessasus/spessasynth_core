import {
    BasicInstrument,
    BasicPreset,
    BasicSample,
    BasicSoundBank,
    SampleTypes,
    SoundBankCloner,
    SoundBankLoader,
    SpessaLog
} from "../../src";
import fs from "node:fs/promises";

// Checks the clone options and SoundBankCloner
// Usage: tsx clone_test.ts [sf2 path for the copyFrom check]

SpessaLog.setLogLevel(false, false, false);
await BasicSoundBank.ready;

let failures = 0;
const check = (ok: boolean, message: string) => {
    console.info(ok ? "PASS:" : "FAIL:", message);
    if (!ok) failures++;
};

const makeSample = (name: string) => {
    const s = new BasicSample(
        name,
        44_100,
        60,
        0,
        SampleTypes.monoSample,
        0,
        10
    );
    s.setAudioData(new Float32Array(20).fill(0.5), 44_100);
    return s;
};

// Source bank: two presets sharing one instrument with a stereo pair
const source = new BasicSoundBank();
const left = makeSample("Pad L");
const right = makeSample("Pad R");
left.setLinkedSample(right, SampleTypes.leftSample);
const mono = makeSample("Mono");
const inst = new BasicInstrument();
inst.name = "Pad";
inst.createZone(left);
inst.createZone(mono);
const p1 = new BasicPreset(source);
p1.name = "Pad 1";
p1.createZone(inst);
const p2 = new BasicPreset(source);
p2.name = "Pad 2";
p2.program = 1;
p2.createZone(inst);
source.addSamples(left, right, mono);
source.addInstruments(inst);
source.addPresets(p1, p2);

// Default: reuse by name
{
    const target = new BasicSoundBank();
    const a = target.clonePreset(p1);
    const b = target.clonePreset(p1);
    check(a === b, "default clone reuses a preset with the same name");
    check(
        target.samples.length === 3 && target.instruments.length === 1,
        "default clone adds the pair, the mono sample and the instrument"
    );
    const l = target.samples.find((s) => s.name === "Pad L");
    check(
        l?.linkedSample?.name === "Pad R" && l.linkedSample !== right,
        "the stereo pair is copied and linked to each other"
    );
    check(right.linkedSample === left, "the original pair stays linked");
}

// Paste into the same bank, like SpessaFont: duplicate the element, reuse its children
{
    const cloner = new SoundBankCloner(source, {
        reuseByName: false,
        addToBank: false
    });
    const pasted = cloner.clonePreset(p1);
    check(
        pasted.name === "Pad 1-1",
        `a duplicate gets a free name (${pasted.name})`
    );
    check(pasted.zones[0].instrument === inst, "children are reused by name");
    check(
        source.presets.length === 2 && !source.presets.includes(pasted),
        "addToBank false does not add the preset"
    );
    check(
        cloner.created.presets.length === 1 &&
            cloner.created.instruments.length === 0,
        "created lists only the new preset"
    );
    // Undo the zone link the paste made
    pasted.delete();
}

// Full duplicate, shared instrument copied once
{
    const cloner = new SoundBankCloner(source, {
        reuseByName: false,
        reuseChildrenByName: false,
        addToBank: false
    });
    const a = cloner.clonePreset(p1);
    const b = cloner.clonePreset(p2);
    check(
        a.zones[0].instrument === b.zones[0].instrument &&
            a.zones[0].instrument !== inst,
        "an instrument shared by two presets is copied once per session"
    );
    check(
        cloner.created.samples.map((s) => s.name).join(",") ===
            "Pad L-1,Pad R-1,Mono-1",
        `samples copied with free names (${cloner.created.samples.map((s) => s.name).join(",")})`
    );
    const l = cloner.created.samples[0];
    check(
        l.linkedSample === cloner.created.samples[1] &&
            l.sampleType === SampleTypes.leftSample,
        "the copied pair links to each other"
    );
    check(
        source.samples.length === 3 && source.instruments.length === 1,
        "nothing is added to the bank"
    );
    a.delete();
    b.delete();
    cloner.created.instruments[0].delete();
}

// Cloning the right half alone brings its partner
{
    const cloner = new SoundBankCloner(source, { reuseByName: false });
    const r = cloner.cloneSample(right);
    check(
        r.linkedSample?.name === "Pad L-1" && source.samples.length === 5,
        "a sample brings its stereo partner"
    );
}

// Samples without data stay without data
{
    const empty = makeSample("Empty");
    empty.releaseData();
    const target = new BasicSoundBank();
    const copy = target.cloneSample(empty);
    check(
        !copy.hasData &&
            copy.sampleLength === 20 &&
            copy.storedForm === "float32",
        "a sample without data is cloned without data"
    );
}

// CopyFrom keeps the bank the same
const path = process.argv[2];
if (path) {
    const file = await fs.readFile(path);
    const bank = SoundBankLoader.fromArrayBuffer(
        file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)
    );
    const copy = BasicSoundBank.copyFrom(bank);
    // Presets with a name that repeats are reused by name, like before the cloner existed
    const uniqueNames = new Set(bank.presets.map((p) => p.name)).size;
    check(
        copy.presets.length === uniqueNames,
        `copyFrom keeps ${copy.presets.length} of ${bank.presets.length} presets (${uniqueNames} unique names)`
    );
    const a = new Uint8Array(bank.writeSF2());
    const b = new Uint8Array(copy.writeSF2());
    console.info("Written sizes:", a.length, b.length);
}

if (failures > 0) {
    console.error(`${failures} checks failed!`);
    process.exit(1);
}
console.info("All clone checks passed!");
