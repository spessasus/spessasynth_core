import {
    BasicMIDI,
    MIDIControllers,
    MIDIMessageTypes,
    MIDIUtils
} from "../../../src";
import { arrayToHexString } from "../../../src/utils/other";

export function logEventsTest(midi: BasicMIDI) {
    console.group(`MIDI: ${midi.getName()}`);
    for (const track of midi.tracks) {
        console.group(`Track ${track.name}, events: ${track.events.length}`);

        for (const event of track.events) {
            const ch = event.statusByte & 0xf;
            const status =
                event.statusByte < 0x80
                    ? event.statusByte
                    : event.statusByte & 0xf0;
            switch (status) {
                case MIDIMessageTypes.controllerChange: {
                    console.info(
                        `Controller change on`,
                        ch,
                        (
                            Object.keys(
                                MIDIControllers
                            ) as (keyof typeof MIDIControllers)[]
                        ).find((k) => MIDIControllers[k] === event.data[0]),
                        event.data[1]
                    );
                    break;
                }

                case MIDIMessageTypes.systemExclusive: {
                    const analyzed = MIDIUtils.analyzeSysEx(event.data);
                    for (const msg of analyzed) {
                        console.info(
                            "System Exclusive",
                            Object.entries(msg)
                                .map(([key, value]) => `${key}: ${value}`)
                                .join(", ")
                        );
                    }
                    break;
                }

                default: {
                    console.info(
                        (
                            Object.keys(
                                MIDIMessageTypes
                            ) as (keyof typeof MIDIMessageTypes)[]
                        ).find((k) => MIDIMessageTypes[k] === status) ??
                            event.statusByte.toString(16),
                        arrayToHexString(event.data)
                    );
                }
            }
        }
        console.groupEnd();
    }

    console.groupEnd();
}
