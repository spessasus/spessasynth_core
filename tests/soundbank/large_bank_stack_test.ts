import { BasicPreset, BasicSoundBank, SoundBankLoader } from "../../src";

let failed = false;
const check = (what: string, ok: boolean) => {
    console.info(`${ok ? "PASS" : "FAIL"}: ${what}`);
    if (!ok) failed = true;
};

// More than V8 takes as call arguments with its default stack
const PRESET_COUNT = 400_000;

const bank = SoundBankLoader.fromArrayBuffer(
    BasicSoundBank.getSampleSoundBankFile()
);
const [instrument] = bank.instruments;
const presets = new Array<BasicPreset>();
for (let i = 0; i < PRESET_COUNT; i++) {
    const preset = new BasicPreset(bank);
    preset.name = `Preset ${i}`;
    preset.program = i % 128;
    preset.bankMSB = Math.floor(i / 128) % 128;
    preset.bankLSB = Math.floor(i / 16_384);
    preset.createZone(instrument);
    presets.push(preset);
}

try {
    const added = new BasicSoundBank();
    added.addCompletePresets(presets);
    check(
        "addCompletePresets takes them all",
        added.presets.length === PRESET_COUNT
    );
} catch (error) {
    check(`addCompletePresets takes them all (${String(error)})`, false);
}

for (const preset of presets) {
    bank.presets.push(preset);
}
try {
    const file = bank.writeSFE();
    const loaded = SoundBankLoader.fromArrayBuffer(file);
    check(
        "the written bank loads with every preset",
        loaded.presets.length === bank.presets.length
    );
} catch (error) {
    check(`the written bank loads with every preset (${String(error)})`, false);
}

if (failed) {
    console.error("Some checks failed.");
    process.exit(1);
}
console.info("All checks passed.");
