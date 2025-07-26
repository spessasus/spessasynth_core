import { MIDIMessage } from "../midi_message";
import { messageTypes } from "../enums";
import { IndexedByteArray } from "../../utils/indexed_array";

export function getGsOn(ticks: number): MIDIMessage {
    return new MIDIMessage(
        ticks,
        messageTypes.systemExclusive,
        new IndexedByteArray([
            0x41, // Roland
            0x10, // Device ID (defaults to 16 on roland)
            0x42, // GS
            0x12, // Command ID (DT1) (whatever that means...)
            0x40, // System parameter - Address
            0x00, // Global parameter -  Address
            0x7f, // GS Change - Address
            0x00, // turn on - Data
            0x41, // checksum
            0xf7 // end of exclusive
        ])
    );
}
