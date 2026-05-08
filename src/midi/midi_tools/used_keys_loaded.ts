import { SpessaSynthLog } from "../../utils/loggin";
import { ConsoleColors } from "../../utils/other";
import { DEFAULT_PERCUSSION } from "../../synthesizer/audio_engine/synth_constants";
import { SysEx } from "../../utils/sysex";
import type { BasicMIDI } from "../basic_midi";
import type { BasicSoundBank } from "../../soundbank/basic_soundbank/basic_soundbank";
import type { BasicPreset } from "../../soundbank/basic_soundbank/basic_preset";
import type { MIDISystem } from "../../synthesizer/types";
import {
    type MIDIController,
    MIDIControllers,
    MIDIMessageTypes
} from "../enums";
import type { SoundBankManager } from "../../synthesizer/audio_engine/sound_bank_manager";
import { BankSelectHacks } from "../../utils/midi_hacks";
import { RegisteredParameterTypes } from "../../synthesizer/audio_engine/channel/data_entry/data_entry_coarse";

interface InternalChannelType {
    preset?: BasicPreset;
    bankMSB: number;
    bankLSB: number;
    rpn: number;
    isRPN: boolean;
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
    SpessaSynthLog.groupCollapsed(
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
            ch.isRPN = false;
            ch.rpn = RegisteredParameterTypes.resetParameters;
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
            rpn: RegisteredParameterTypes.resetParameters,
            isRPN: false,
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
        const e = tracks[trackNum].events[t.ev];

        // Do not assign ports to empty tracks
        // Testcase Cueshe - Bakit 1.mid
        if (
            e.statusByte === MIDIMessageTypes.midiPort &&
            mid.tracks[trackNum].channels.size > 0
        ) {
            let port = e.data[0];
            if (offsetMap[port] === undefined) {
                SpessaSynthLog.warn(
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

        switch (status) {
            case MIDIMessageTypes.programChange: {
                const channel =
                    (e.statusByte & 0xf) + offsetMap[ports[trackNum]] || 0;
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
                const channel =
                    (e.statusByte & 0xf) + offsetMap[ports[trackNum]] || 0;
                const ch = channels[channel];

                const value = e.data[1];
                switch (e.data[0] as MIDIController) {
                    // Registered param tracking
                    case MIDIControllers.registeredParameterMSB: {
                        ch.rpn = (value << 7) | (ch.rpn & 0x7f);
                        ch.isRPN = true;
                        break;
                    }

                    case MIDIControllers.registeredParameterLSB: {
                        ch.rpn = (ch.rpn & ~0x7f) | value;
                        ch.isRPN = true;
                        break;
                    }

                    case MIDIControllers.nonRegisteredParameterLSB:
                    case MIDIControllers.nonRegisteredParameterMSB: {
                        ch.isRPN = false;
                        break;
                    }

                    case MIDIControllers.dataEntryMSB: {
                        // RPN#02 Coarse Tune is key-shift according to GM2 section 3.4.3
                        if (
                            ch.isRPN &&
                            ch.rpn === RegisteredParameterTypes.coarseTuning
                        )
                            ch.keyShift = value - 64;
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
                const channel =
                    (e.statusByte & 0xf) + offsetMap[ports[trackNum]] || 0;
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
                    const syx = SysEx.analyze(e.data);
                    switch (syx.type) {
                        default: {
                            break;
                        }

                        // Check for XG
                        case "XG Reset": {
                            reset("xg");
                            SpessaSynthLog.info(
                                "%cXG on detected!",
                                ConsoleColors.recognized
                            );
                            break;
                        }

                        case "GM2 On": {
                            reset("gm2");
                            SpessaSynthLog.info(
                                "%cGM2 on detected!",
                                ConsoleColors.recognized
                            );
                            break;
                        }

                        case "GM On": {
                            reset("gm");
                            SpessaSynthLog.info(
                                "%cGM on detected!",
                                ConsoleColors.recognized
                            );
                            break;
                        }

                        case "GM Off":
                        case "GS Reset": {
                            reset("gs");
                            SpessaSynthLog.info(
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
                            const sysexChannel =
                                syx.channel + offsetMap[ports[trackNum]];
                            channels[sysexChannel].isDrum = syx.isDrum;
                            break;
                        }

                        case "Program Change": {
                            const sysexChannel =
                                syx.channel + offsetMap[ports[trackNum]];
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
                            const sysexChannel =
                                syx.channel + offsetMap[ports[trackNum]];
                            if (
                                syx.controller === MIDIControllers.bankSelectLSB
                            )
                                channels[sysexChannel].bankLSB = syx.value;
                            else if (
                                syx.controller === MIDIControllers.bankSelect
                            )
                                channels[sysexChannel].bankLSB = syx.value;
                        }
                    }
                }
            }
        }
    }

    for (const [preset, combos] of usedProgramsAndKeys.entries()) {
        if (combos.size === 0) {
            SpessaSynthLog.info(
                `%cDetected change but no keys for %c${preset.name}`,
                ConsoleColors.info,
                ConsoleColors.value
            );
            usedProgramsAndKeys.delete(preset);
        }
    }

    SpessaSynthLog.groupEnd();
    return usedProgramsAndKeys;
}
