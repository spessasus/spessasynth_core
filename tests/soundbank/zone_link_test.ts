import {
    BasicInstrument,
    BasicPreset,
    BasicSoundBank,
    SoundBankLoader
} from "../../src";

// Checks preset and instrument delete() / restore() and zones created without linking

let failed = false;
const check = (what: string, ok: boolean) => {
    console.info(`${ok ? "PASS" : "FAIL"}: ${what}`);
    if (!ok) failed = true;
};

const bank = SoundBankLoader.fromArrayBuffer(
    BasicSoundBank.getSampleSoundBankFile()
);
const preset = bank.presets[0];
const inst = bank.instruments[0];
const sample = bank.samples[0];

check("loaded bank links the instrument", inst.useCount === 1);
check("loaded bank links the sample twice", sample.useCount === 2);

// Delete and restore a preset, like an undo would
bank.deletePreset(preset);
check("deleting the preset unlinks the instrument", inst.useCount === 0);
check(
    "zone use counts drop",
    inst.zones.every((z) => z.useCount === 0)
);
bank.addPresets(preset);
preset.restore();
check(
    "restore relinks the same preset",
    inst.useCount === 1 && inst.linkedTo[0] === preset
);
check(
    "zone use counts come back",
    inst.zones.every((z) => z.useCount === 1)
);

// Delete and restore an instrument (its preset goes first)
bank.deletePreset(preset);
bank.deleteInstrument(inst);
check("deleting the instrument unlinks the sample", sample.useCount === 0);
bank.addInstruments(inst);
inst.restore();
bank.addPresets(preset);
preset.restore();
check(
    "restore relinks the sample to the same instrument",
    sample.useCount === 2 && sample.linkedTo.every((i) => i === inst)
);
check("instrument is linked again", inst.useCount === 1);

// Unlinked zones (preview wrappers)
const wrapperInst = new BasicInstrument();
wrapperInst.name = "Preview";
const iz = wrapperInst.createZone(sample, false);
check("unlinked instrument zone keeps the sample count", sample.useCount === 2);
const wrapperPreset = new BasicPreset(bank);
wrapperPreset.name = "Preview";
const pz = wrapperPreset.createZone(inst, false);
check("unlinked preset zone keeps the instrument count", inst.useCount === 1);

// Swapping the child of an unlinked zone must not link either
iz.sample = bank.samples[0];
pz.instrument = inst;
check(
    "swapping children of unlinked zones links nothing",
    sample.useCount === 2 && inst.useCount === 1
);

// Deleting the wrappers must not unlink anything real
wrapperPreset.delete();
wrapperInst.delete();
check(
    "deleting the wrappers keeps the real links",
    sample.useCount === 2 && inst.useCount === 1
);

// A linked zone swap still moves the link
const other = new BasicInstrument();
other.name = "Other";
other.createZone(sample);
check("a normal zone links the sample", sample.useCount === 3);
preset.zones[0].instrument = other;
check(
    "a normal swap moves the link",
    inst.useCount === 0 && other.useCount === 1
);

if (failed) {
    console.error("Some checks failed.");
    process.exit(1);
}
console.info("All checks passed.");
