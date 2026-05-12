import { SpessaLog } from "../../utils/loggin";
import { ConsoleColors } from "../../utils/other";
import { DEFAULT_PERCUSSION } from "../../synthesizer/audio_engine/synth_constants";
import { MIDIUtils } from "./midi_utils";
import type { BasicMIDI } from "../basic_midi";
import type { BasicSoundBank } from "../../soundbank/basic_soundbank/basic_soundbank";
import type { BasicPreset } from "../../soundbank/basic_soundbank/basic_preset";
import {
    type MIDIController,
    MIDIControllers,
    MIDIMessageTypes
} from "../enums";
import type { SoundBankManager } from "../../synthesizer/audio_engine/sound_bank_manager";
import { BankSelectHacks } from "../../utils/midi_hacks";
import type { MIDISystem } from "../../soundbank/types";
import { ParameterTracker } from "./parameter_tracker";

interface InternalChannelType {
    preset?: BasicPreset;
    bankMSB: number;
    bankLSB: number;
    param: ParameterTracker;
    isDrum: boolean;
    keyShift: number;
}

/**
 * Gets the used programs and keys for this MIDI file with a given sound bank.
 * @param mid
 * @param soundBank  the sound bank.
 * @returns  Map<patch, Set<key-velocity>>.
 */
export function getUsedProgramsAndKeys(
    mid: BasicMIDI,
    soundBank: BasicSoundBank | SoundBankManager
) {
    SpessaLog.groupCollapsed(
        "%cSearching for all used programs and keys...",
        ConsoleColors.info
    );
    // Find every used preset and every key:velocity for each.
    // Make sure to care about ports and drums.
    const channelsAmount = 16 + Math.max(...mid.portChannelOffsetMap);

    // Track channels and systems
    const channels: InternalChannelType[] = [];
    let system: MIDISystem = "gs";
    let masterKeyShift = 0;
    const reset = (sys: MIDISystem) => {
        system = sys;
        masterKeyShift = 0;
        for (let i = 0; i < channelsAmount; i++) {
            const ch = channels[i];
            ch.isDrum = i % 16 === DEFAULT_PERCUSSION;
            ch.bankMSB = BankSelectHacks.getDefaultBank(sys);
            ch.bankLSB = 0;
            ch.keyShift = 0;
            ch.param.reset();
        }
    };

    for (let i = 0; i < channelsAmount; i++) {
        const isDrum = i % 16 === DEFAULT_PERCUSSION;
        channels.push({
            preset: soundBank.getPreset(
                {
                    bankLSB: 0,
                    bankMSB: 0,
                    isGMGSDrum: isDrum,
                    program: 0
                },
                system
            ),
            bankMSB: 0,
            bankLSB: 0,
            param: new ParameterTracker(i),
            isDrum,
            keyShift: 0
        });
    }

    /**
     * Find all programs used and key-velocity combos in them
     * bank:program each has a set of midiNote-velocity
     */
    const usedProgramsAndKeys = new Map<BasicPreset, Set<string>>();

    const ports = mid.tracks.map((t) => t.port);

    const offsetMap = mid.portChannelOffsetMap;
    const { timeline, tracks } = mid;
    for (const t of timeline) {
        const trackNum = t.tr;
        const event = t.ev;
        const e = tracks[trackNum].events[event];

        // Do not assign ports to empty tracks
        // Testcase Cueshe - Bakit 1.mid
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
            status !== MIDIMessageTypes.programChange &&
            status !== MIDIMessageTypes.systemExclusive
        ) {
            continue;
        }

        const channelOffset = offsetMap[ports[trackNum]] || 0;
        switch (status) {
            case MIDIMessageTypes.programChange: {
                const channel = (e.statusByte & 0xf) + channelOffset;
                const ch = channels[channel];
                ch.preset = soundBank.getPreset(
                    {
                        bankMSB: ch.bankMSB,
                        bankLSB: ch.bankLSB,
                        program: e.data[0],
                        isGMGSDrum: ch.isDrum
                    },
                    system
                );
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
                        ch.param.controllerChange(cc, value, trackNum, event);
                        break;
                    }

                    case MIDIControllers.dataEntryMSB:
                    case MIDIControllers.dataEntryLSB: {
                        const analyzed = ch.param.controllerChange(
                            cc,
                            value,
                            trackNum,
                            event
                        );
                        // RPN#02 Coarse Tune is key-shift according to GM2 section 3.4.3
                        if (analyzed?.type === "Key Shift")
                            ch.keyShift = analyzed.value;
                        break;
                    }

                    case MIDIControllers.resetAllControllers: {
                        ch.param.reset();
                        break;
                    }

                    case MIDIControllers.bankSelect: {
                        ch.bankMSB = value;
                        break;
                    }

                    case MIDIControllers.bankSelectLSB: {
                        ch.bankLSB = value;
                        break;
                    }
                }
                break;
            }

            case MIDIMessageTypes.noteOn: {
                const channel = (e.statusByte & 0xf) + channelOffset;
                const ch = channels[channel];
                // That's a note off
                if (e.data[1] === 0) continue;

                // If there's no preset, ignore
                if (!ch.preset) continue;

                let combos = usedProgramsAndKeys.get(ch.preset);
                if (!combos) {
                    combos = new Set<string>();
                    usedProgramsAndKeys.set(ch.preset, combos);
                }

                const midiNote = e.data[0] + masterKeyShift + ch.keyShift;

                combos.add(`${midiNote}-${e.data[1]}`);
                break;
            }

            case MIDIMessageTypes.systemExclusive: {
                // Check for drum sysex
                {
                    const syx = MIDIUtils.analyzeSysEx(e.data);
                    switch (syx.type) {
                        default: {
                            break;
                        }

                        // Check for XG
                        case "XG Reset": {
                            reset("xg");
                            SpessaLog.info(
                                "%cXG on detected!",
                                ConsoleColors.recognized
                            );
                            break;
                        }

                        case "GM2 On": {
                            reset("gm2");
                            SpessaLog.info(
                                "%cGM2 on detected!",
                                ConsoleColors.recognized
                            );
                            break;
                        }

                        case "GM On": {
                            reset("gm");
                            SpessaLog.info(
                                "%cGM on detected!",
                                ConsoleColors.recognized
                            );
                            break;
                        }

                        case "GM Off":
                        case "GS Reset": {
                            reset("gs");
                            SpessaLog.info(
                                "%cGS on detected!",
                                ConsoleColors.recognized
                            );
                            break;
                        }

                        case "Master Key Shift": {
                            masterKeyShift = syx.value;
                            break;
                        }

                        case "Key Shift": {
                            channels[syx.channel].keyShift = syx.value;
                            break;
                        }

                        case "Drums On": {
                            const sysexChannel = syx.channel + channelOffset;
                            channels[sysexChannel].isDrum = syx.isDrum;
                            break;
                        }

                        case "Program Change": {
                            const sysexChannel = syx.channel + channelOffset;
                            const ch = channels[sysexChannel];
                            ch.preset = soundBank.getPreset(
                                {
                                    bankMSB: ch.bankMSB,
                                    bankLSB: ch.bankLSB,
                                    program: syx.value,
                                    isGMGSDrum: ch.isDrum
                                },
                                system
                            );
                            break;
                        }

                        case "Controller Change": {
                            const sysexChannel = syx.channel + channelOffset;
                            if (
                                syx.controller === MIDIControllers.bankSelectLSB
                            )
                                channels[sysexChannel].bankLSB = syx.value;
                            else if (
                                syx.controller === MIDIControllers.bankSelect
                            )
                                channels[sysexChannel].bankMSB = syx.value;
                        }
                    }
                }
            }
        }
    }

    for (const [preset, combos] of usedProgramsAndKeys.entries()) {
        if (combos.size === 0) {
            SpessaLog.info(
                `%cDetected change but no keys for %c${preset.name}`,
                ConsoleColors.info,
                ConsoleColors.value
            );
            usedProgramsAndKeys.delete(preset);
        }
    }

    SpessaLog.groupEnd();
    return usedProgramsAndKeys;
}
