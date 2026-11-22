import {
    BasicSoundBank,
    Generator,
    type GeneratorType,
    SoundBankLoader
} from "../../src";

// Writes a DLS from a bank whose preset zone holds a reserved generator (42, "Reserved1").
// Airfont 340 has one, and flattening the preset used to crash on the missing default
// Testcase: Airfont_340.sf2

let failed = false;
const check = (what: string, ok: boolean) => {
    console.info(`${ok ? "PASS" : "FAIL"}: ${what}`);
    if (!ok) failed = true;
};

const RESERVED_1 = 42 as GeneratorType;

const bank = SoundBankLoader.fromArrayBuffer(
    BasicSoundBank.getSampleSoundBankFile()
);
bank.presets[0].zones[0].addGenerators(new Generator(RESERVED_1, 0));

let dls: ArrayBuffer | undefined;
try {
    dls = bank.writeDLS();
} catch (error) {
    console.error(error);
}
check("writeDLS does not throw", dls !== undefined);

if (dls) {
    const back = SoundBankLoader.fromArrayBuffer(dls);
    check(
        "the DLS reads back with every preset",
        back.presets.length === bank.presets.length
    );
}

if (failed) process.exit(1);
console.info("reserved_generator_dls_test: all checks passed!");
