// The SF2 amount of a send modulator given through the constructor is what an SF2 file gets
import { readFileSync } from "node:fs";
import {
    GeneratorTypes,
    MIDIControllers,
    Modulator,
    ModulatorCurveTypes,
    ModulatorSource,
    SoundBankLoader
} from "../../../src";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
    console.log(ok ? "PASS" : "FAIL", name, detail);
    if (!ok) failed++;
};

const send = (amount: number, sf2Amount?: number) =>
    new Modulator(
        new ModulatorSource(
            MIDIControllers.reverbDepth,
            ModulatorCurveTypes.linear,
            true,
            false,
            false
        ),
        new ModulatorSource(),
        GeneratorTypes.reverbEffectsSend,
        amount,
        0,
        sf2Amount
    );

// The amount the first zone's reverb send has in the written SF2 file
const written = (m: Modulator) => {
    const bin = readFileSync("tests/files/sound_bank/gm.sf2");
    const bank = SoundBankLoader.fromArrayBuffer(bin.buffer);
    const zone = bank.instruments[0].zones[0];
    zone.setModulators([m]);
    const back = SoundBankLoader.fromArrayBuffer(bank.writeSF2());
    const read = back.instruments[0].zones[0].modulators.find(
        (x) => x.destination === GeneratorTypes.reverbEffectsSend
    );
    return read;
};

const kept = written(send(1000, 200));
check(
    "a zone send of 1000 read from 200 is written as 200",
    kept?.sf2Amount === 200 && kept.transformAmount === 1000,
    `file ${kept?.sf2Amount}, bank ${kept?.transformAmount}`
);
const fresh = written(send(1000));
check(
    "a new zone send of 1000 is written as 1000",
    fresh?.sf2Amount === 1000 && fresh.transformAmount === 1000,
    `file ${fresh?.sf2Amount}`
);
const stale = written(send(500, 200));
check(
    "a stale SF2 amount is ignored",
    stale?.sf2Amount === 100 && stale.transformAmount === 500,
    `file ${stale?.sf2Amount}`
);
const copy = Modulator.copyFrom(send(1000, 200));
check("copyFrom carries the SF2 amount", copy.sf2Amount === 200);
check("a plain modulator has none", new Modulator().sf2Amount === undefined);

if (failed > 0) {
    console.log(failed, "failed");
    process.exit(1);
}
console.log("all passed");
