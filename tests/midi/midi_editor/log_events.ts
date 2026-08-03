import {
    MIDIControllers,
    MIDIMessage,
    MIDIMessageTypes,
    MIDIUtils
} from "../../../src";
import { arrayToHexString } from "../../../src/utils/other";

export function logEventsTest(events: MIDIMessage[]) {
    for (const event of events) {
        switch (event.statusByte) {
            case MIDIMessageTypes.controllerChange: {
                console.info(
                    "Controller change",
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
                    ).find((k) => MIDIMessageTypes[k] === event.statusByte),
                    arrayToHexString(event.data)
                );
            }
        }
    }
}
