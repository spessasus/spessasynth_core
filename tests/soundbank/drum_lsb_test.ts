import type { MIDIPatchFull } from "../../src";
import {
    BasicPreset,
    BasicSoundBank,
    MIDIPatchTools,
    SpessaSynthProcessor
} from "../../src";

// GS drum kits of one program, told apart by the bank LSB (the SC map)
const kit = (bankLSB: number, name: string): MIDIPatchFull => ({
    program: 0,
    bankMSB: 0,
    bankLSB,
    isGMGSDrum: true,
    isDrum: true,
    name
});
const patches = [kit(0, "SC-55"), kit(2, "SC-88"), kit(3, "SC-88Pro")];

let failed = false;
const check = (name: string, ok: boolean) => {
    console.info(`  ${ok ? "ok  " : "FAIL"} ${name}`);
    if (!ok) failed = true;
};

for (const lsb of [0, 2, 3]) {
    const p = MIDIPatchTools.selectPatch(
        patches,
        { program: 0, bankMSB: 0, bankLSB: lsb, isGMGSDrum: true },
        "gs"
    );
    check(`LSB ${lsb} selects its own kit`, p.bankLSB === lsb);
}
// Unknown LSB falls back to a kit of the same program
const fallback = MIDIPatchTools.selectPatch(
    patches,
    { program: 0, bankMSB: 0, bankLSB: 9, isGMGSDrum: true },
    "gs"
);
check("unknown LSB still finds a kit", fallback.program === 0);
// The MSB is still ignored for drums
const msb = MIDIPatchTools.selectPatch(
    patches,
    { program: 0, bankMSB: 5, bankLSB: 2, isGMGSDrum: true },
    "gs"
);
check("MSB is ignored", msb.bankLSB === 2);

// The synthesizer's preset list must keep every kit,
// Not only the first per program!
const bank = new BasicSoundBank();
for (const lsb of [0, 2, 3]) {
    const preset = new BasicPreset(bank);
    preset.name = `Kit ${lsb}`;
    preset.program = 0;
    preset.bankMSB = 0;
    preset.bankLSB = lsb;
    preset.isGMGSDrum = true;
    bank.addPresets(preset);
}
const synth = new SpessaSynthProcessor(44_100);
synth.soundBankManager.addSoundBank(bank, "test");
const kits = synth.soundBankManager.presetList.filter(
    (p) => p.isGMGSDrum && p.program === 0
);
check(
    "preset list keeps all LSB kits",
    kits.map((k) => k.bankLSB).join(",") === "0,2,3"
);

// MIDI string check, plus the older format without an LSB
const str = MIDIPatchTools.toMIDIString(patches[1]);
const parsed = MIDIPatchTools.fromMIDIString(str);
check(
    "MIDI string keeps the LSB",
    str === "DRUM:2:0" && parsed.bankLSB === 2 && parsed.isGMGSDrum
);
const old = MIDIPatchTools.fromMIDIString("DRUM:5");
check(
    "older DRUM:program string still parses",
    old.program === 5 && old.bankLSB === 0
);

if (failed) {
    console.error("drum_lsb_test: FAILED");
    process.exit(1);
}
console.info("drum_lsb_test: all checks passed!");
