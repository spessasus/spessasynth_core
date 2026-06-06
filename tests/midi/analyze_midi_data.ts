import {
    BasicMIDI,
    type MIDIController,
    MIDIControllers,
    MIDIMessageTypes,
    MIDIUtils,
    SpessaLog
} from "../../src";
import fs from "node:fs/promises";
import { ParameterTracker } from "../../src/midi/midi_tools/parameter_tracker";
import { arrayToHexString } from "../../src/utils/other";

// A test for analyzing MIDI file NRPN and system exclusive data

const args = process.argv.slice(2);
if (args.length !== 1) {
    console.info("Usage: tsx index.ts <midi path>");
    process.exit();
}

const midPath: string = args[0];
SpessaLog.setLogLevel(true, true, true);
console.time("Parsed MIDI file in");
const midFile = await fs.readFile(midPath);
const mid = BasicMIDI.fromArrayBuffer(midFile.buffer);
console.timeEnd("Parsed MIDI file in");

console.group("\n\n\n--- MIDI File Analysis ---");

// Set up channel trackers
const channelsAmount = 16 + Math.max(...mid.portChannelOffsetMap);
const channels = Array.from({ length: channelsAmount }, (_, i) => ({
    tracker: new ParameterTracker(i),
    firstNoteOn: false
}));

const ports = mid.tracks.map((t) => t.port);

const offsetMap = mid.portChannelOffsetMap;
const { timeline, tracks } = mid;
for (const t of timeline) {
    const trackNum = t.tr;
    const event = t.ev;
    const e = tracks[trackNum].events[event];
    if (
        e.statusByte === MIDIMessageTypes.midiPort &&
        mid.tracks[trackNum].channels.size > 0
    ) {
        let port = e.data[0];
        if (offsetMap[port] === undefined) {
            SpessaLog.warn(
                `Invalid port ${port} on track ${trackNum}. (No offset found in the MIDI map.`
            );
            port = 0;
        }
        ports[trackNum] = port;
        continue;
    }
    const status = e.statusByte & 0xf0;
    if (
        status !== MIDIMessageTypes.noteOn &&
        status !== MIDIMessageTypes.controllerChange &&
        status !== MIDIMessageTypes.systemExclusive
    ) {
        continue;
    }

    const channelOffset = offsetMap[ports[trackNum]] || 0;
    switch (status) {
        case MIDIMessageTypes.noteOn: {
            const channel = (e.statusByte & 0x0f) + channelOffset;
            const velocity = e.data[1];
            if (velocity > 0 && !channels[channel].firstNoteOn) {
                console.info(
                    `[CH ${channel.toString().padStart(2, " ")}] First Note On at tick ${e.ticks}. Track ${trackNum}`
                );
                channels[channel].firstNoteOn = true;
            }
            break;
        }

        case MIDIMessageTypes.controllerChange: {
            const channel = (e.statusByte & 0xf) + channelOffset;
            const ch = channels[channel];

            const cc = e.data[0] as MIDIController;
            const value = e.data[1];
            switch (cc) {
                // Registered param tracking
                case MIDIControllers.registeredParameterMSB:
                case MIDIControllers.registeredParameterLSB:
                case MIDIControllers.nonRegisteredParameterLSB:
                case MIDIControllers.nonRegisteredParameterMSB: {
                    ch.tracker.controllerChange(cc, value, trackNum, event);
                    break;
                }

                case MIDIControllers.dataEntryMSB:
                case MIDIControllers.dataEntryLSB: {
                    const analyzed = ch.tracker.controllerChange(
                        cc,
                        value,
                        trackNum,
                        event
                    );
                    if (analyzed) {
                        switch (analyzed.type) {
                            case "Channel MIDI Param": {
                                console.info(
                                    `[CH ${analyzed.channel.toString().padStart(2, " ")}] N/RPN Param change: ${
                                        analyzed.parameter
                                    } = ${
                                        typeof analyzed.value === "number"
                                            ? Math.round(analyzed.value)
                                            : analyzed.value
                                    }`
                                );
                                break;
                            }

                            case "Other": {
                                console.info(
                                    `[UNREC] N/RPN: param ${(ch.tracker.paramMSB.v << 7).toString(16)} ${ch.tracker.paramLSB.v.toString(16)}`
                                );
                                break;
                            }

                            case "Controller Change": {
                                console.info(
                                    `[CH ${analyzed.channel.toString().padStart(2, " ")}] N/RPN Controller change: ${Object.keys(
                                        MIDIControllers
                                    ).find(
                                        (k) =>
                                            MIDIControllers[
                                                k as keyof typeof MIDIControllers
                                            ] === analyzed.controller
                                    )} = ${analyzed.value}`
                                );
                                break;
                            }
                        }
                    }
                    break;
                }

                case MIDIControllers.resetAllControllers: {
                    ch.tracker.reset();
                    break;
                }
            }
            break;
        }

        case MIDIMessageTypes.systemExclusive: {
            const analyzed = MIDIUtils.analyzeSysEx(e.data);
            if (analyzed) {
                switch (analyzed.type) {
                    default: {
                        // Log without type
                        const { type, ...values } = analyzed;
                        if (Object.keys(values).length === 0) {
                            console.info(
                                `[OTHER] ${analyzed.type} System Exclusive.`
                            );
                            break;
                        }
                        console.info(
                            `${analyzed.type} System Exclusive:`,
                            values
                        );
                        void type;
                        break;
                    }

                    case "Other": {
                        console.info(
                            "[UNREC] SysEx:",
                            arrayToHexString(e.data)
                        );
                        break;
                    }

                    case "Global MIDI Param": {
                        console.info(
                            `[GLOBL] MIDI Param change: ${
                                analyzed.parameter
                            } = ${
                                typeof analyzed.value === "number"
                                    ? Math.round(analyzed.value * 100) / 100
                                    : analyzed.value
                            }`
                        );
                        break;
                    }

                    case "Channel MIDI Param": {
                        console.info(
                            `[CH ${analyzed.channel.toString().padStart(2, " ")}] SysEx MIDI Param change: ${
                                analyzed.parameter
                            } = ${
                                typeof analyzed.value === "number"
                                    ? Math.round(analyzed.value * 100) / 100
                                    : analyzed.value
                            }`
                        );
                        break;
                    }

                    case "Controller Change": {
                        console.info(
                            `[CH ${analyzed.channel.toString().padStart(2, " ")}] SysEx Controller change: ${Object.keys(
                                MIDIControllers
                            ).find(
                                (k) =>
                                    MIDIControllers[
                                        k as keyof typeof MIDIControllers
                                    ] === analyzed.controller
                            )} = ${analyzed.value}`
                        );
                        break;
                    }
                }
            }
        }
    }
}

console.info("END OF ANALYSIS");
console.groupEnd();
console.info("---");
