// Assertion tests for MIDIMessage.toBytes.
// Usage: npx tsx tests/midi/midi_message_to_bytes_test.ts
import {
    MIDIControllers,
    MIDIMessage,
    MIDIMessageTypes,
    MIDIUtils,
    SpessaSynthProcessor
} from "../../src";

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
        console.info(`ok   ${name}`);
    } else {
        failed++;
        console.error(`FAIL ${name}: got ${a}, expected ${e}`);
    }
}

const bytes = (m: MIDIMessage) => Array.from(m.toBytes());

check(
    "controller change: status byte with the channel, then the data",
    bytes(MIDIMessage.controllerChange(0, 3, MIDIControllers.mainVolume, 100)),
    [0xb3, 7, 100]
);
check("program change", bytes(MIDIMessage.programChange(0, 9, 25)), [0xc9, 25]);
check(
    "System Exclusive: 0xF0, then the data up to the closing 0xF7",
    bytes(MIDIUtils.reset(0, "gm")),
    [0xf0, 0x7e, 0x7f, 0x09, 0x01, 0xf7]
);
check(
    "System Exclusive escape: the data as it is",
    bytes(
        new MIDIMessage(
            0,
            MIDIMessageTypes.systemExclusiveEscape,
            new Uint8Array([0xf3, 0x01])
        )
    ),
    [0xf3, 0x01]
);

const message = MIDIMessage.programChange(0, 0, 5);
const copy = message.toBytes();
copy[1] = 99;
check("the returned array is a copy", message.data[0], 5);

let error = "";
try {
    new MIDIMessage(
        0,
        MIDIMessageTypes.setTempo,
        new Uint8Array([0x07, 0xa1, 0x20])
    ).toBytes();
} catch (error_) {
    error = String(error_);
}
check("a Meta Event throws", error.includes("Meta Event"), true);

// The synth ignored Meta Events before toBytes() existed, so it still has to
let synthError = "";
try {
    new SpessaSynthProcessor(44_100).processMessage(
        new MIDIMessage(
            0,
            MIDIMessageTypes.setTempo,
            new Uint8Array([0x07, 0xa1, 0x20])
        )
    );
} catch (error_) {
    synthError = String(error_);
}
check("processMessage ignores a Meta Event", synthError, "");

if (failed > 0) {
    console.error(`${failed} failed.`);
    process.exitCode = 1;
} else {
    console.info("All passed.");
}
