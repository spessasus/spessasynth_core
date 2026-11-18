// A send modulator of the default form is written to SF2 as a fifth, rounded, in zones and in DMOD
// An SF2 round trip is not exact, but the second one is stable
import { readFileSync } from "node:fs";
import {
    GeneratorTypes,
    MIDIControllers,
    Modulator,
    ModulatorCurveTypes,
    ModulatorSource,
    SoundBankLoader
} from "../../../src";
import { check, finish } from "./sfe_test_utils";

type SendDestination =
    | typeof GeneratorTypes.reverbEffectsSend
    | typeof GeneratorTypes.chorusEffectsSend;

const send = (
    amount: number,
    destination: SendDestination = GeneratorTypes.reverbEffectsSend
) =>
    new Modulator(
        new ModulatorSource(
            destination === GeneratorTypes.reverbEffectsSend
                ? MIDIControllers.reverbDepth
                : MIDIControllers.chorusDepth,
            ModulatorCurveTypes.linear,
            true,
            false,
            false
        ),
        new ModulatorSource(),
        destination,
        amount,
        0
    );

const load = () =>
    SoundBankLoader.fromArrayBuffer(
        readFileSync("tests/files/sound_bank/gm.sf2").buffer
    );

const sendOf = (
    bank: ReturnType<typeof load>,
    destination: SendDestination = GeneratorTypes.reverbEffectsSend
) =>
    bank.instruments[0].zones[0].modulators.find(
        (x) => x.destination === destination
    );

// The amount of the first zone's send in the written SF2 file, and in the bank read back
function throughSF2(amount: number, destination?: SendDestination) {
    const bank = load();
    bank.instruments[0].zones[0].setModulators([send(amount, destination)]);
    const back = SoundBankLoader.fromArrayBuffer(bank.writeSF2());
    // Read it again, the file stores a fifth and the reader multiplies by 5
    const again = SoundBankLoader.fromArrayBuffer(back.writeSF2());
    return {
        first: sendOf(back, destination)?.transformAmount,
        second: sendOf(again, destination)?.transformAmount
    };
}

for (const [amount, expected] of [
    [1000, 1000],
    [800, 800],
    [150, 150],
    [503, 505],
    [0, 0],
    // Above a full send: the file gets a fifth, and that reads as a full send
    [1200, 1000],
    [-500, -500]
]) {
    const r = throughSF2(amount);
    check(
        r.first === expected && r.second === expected,
        `a zone send of ${amount} reads back as ${expected}, and the second round trip is stable (${r.first}, ${r.second})`
    );
}
const chorus = throughSF2(1000, GeneratorTypes.chorusEffectsSend);
check(
    chorus.first === 1000 && chorus.second === 1000,
    "the chorus send follows the same rule"
);

// The file amount: a zone with 1000 now stores 200, like DMOD
const bank = load();
bank.instruments[0].zones[0].setModulators([send(1000)]);
const file = new Uint8Array(bank.writeSF2());
// The reverb modulator is the only one in the first zone: source 0x00DB, destination 16, amount 200
let found = false;
for (let i = 0; i < file.length - 10; i++) {
    if (
        file[i] === 0xdb &&
        file[i + 1] === 0 &&
        file[i + 2] === GeneratorTypes.reverbEffectsSend &&
        file[i + 3] === 0 &&
        file[i + 4] === 200 &&
        file[i + 5] === 0
    ) {
        found = true;
        break;
    }
}
check(found, "a zone send of 1000 is written as 200");

// Every amount is scaled, an SF2 file can not hold more than a full send
const high = throughSF2(6000);
check(
    high.first === 1000 && high.second === 1000,
    "an amount above 5000 comes back as a full send"
);

// A file read, written and read again: the second time nothing changes
const first = SoundBankLoader.fromArrayBuffer(load().writeSF2());
const second = SoundBankLoader.fromArrayBuffer(first.writeSF2());
const sends = (b: ReturnType<typeof load>) =>
    [...b.instruments, ...b.presets].flatMap((e) =>
        [e.globalZone, ...e.zones].flatMap((z) =>
            z.modulators.map(
                (m) => `${m.destination}:${m.transformAmount}:${m.toString()}`
            )
        )
    );
check(
    sends(first).join("|") === sends(second).join("|"),
    "all modulators of gm.sf2 are stable after one round trip"
);
check(
    new Modulator().destination === GeneratorTypes.invalid &&
        !("sf2Amount" in new Modulator()),
    "Modulator keeps no SF2 amount"
);

finish("sf2_amount_test");
