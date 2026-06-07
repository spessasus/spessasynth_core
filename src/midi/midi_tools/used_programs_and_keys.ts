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
import type {
    MIDISystem,
    PresetsWithKeyCombinations
} from "../../soundbank/types";
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
 * @param soundBank the sound bank.
 * @returns  Map<patch, Map<midiNote, Set<velocity>>>
 */
export function getUsedProgramsAndKeys(
    mid: BasicMIDI,
    soundBank: BasicSoundBank | SoundBankManager
): PresetsWithKeyCombinations {
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
     * bank:program each has a map of midiNote -> set of velocities.
     */
    const usedProgramsAndKeys = new Map<
        BasicPreset,
        Map<number, Set<number>>
    >();

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
                        if (
                            analyzed?.type === "Channel MIDI Param" &&
                            analyzed.parameter === "keyShift"
                        )
                            // Drum channels ignore key shift
                            // Testcase: th07_19_user_gm.mid
                            ch.keyShift = ch.isDrum ? 0 : analyzed.value;
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

                // Add the preset to the used list if it does not exist
                let keysForPreset = usedProgramsAndKeys.get(ch.preset);
                if (!keysForPreset) {
                    keysForPreset = new Map<number, Set<number>>();
                    usedProgramsAndKeys.set(ch.preset, keysForPreset);
                }

                const midiNote =
                    e.data[0] + (ch.isDrum ? 0 : masterKeyShift) + ch.keyShift;
                let velocities = keysForPreset.get(midiNote);
                // Add the key with an empty list of velocities to the preset
                if (!velocities) {
                    velocities = new Set<number>();
                    keysForPreset.set(midiNote, velocities);
                }
                velocities.add(e.data[1]);
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

                        case "Global MIDI Param": {
                            if (syx.parameter === "keyShift") {
                                masterKeyShift = syx.value;
                            } else if (syx.parameter === "system") {
                                reset(syx.value);
                                SpessaLog.info(
                                    `%c${syx.value.toUpperCase()} on detected!`,
                                    ConsoleColors.recognized
                                );
                            }
                            break;
                        }

                        case "Channel MIDI Param": {
                            if (syx.parameter === "keyShift") {
                                const ch = channels[syx.channel];
                                // Channel may be above 15
                                if (!ch) break;
                                // Drum channels ignore key shift
                                // Testcase: th07_19_user_gm.mid
                                ch.keyShift = ch.isDrum ? 0 : syx.value;
                            }
                            break;
                        }

                        case "Drums On": {
                            const sysexChannel = syx.channel + channelOffset;
                            // Channel may be above 15
                            if (!channels[sysexChannel]) break;
                            channels[sysexChannel].isDrum = syx.isDrum;
                            break;
                        }

                        case "Program Change": {
                            const sysexChannel = syx.channel + channelOffset;
                            const ch = channels[sysexChannel];
                            // Channel may be above 15
                            if (!ch) break;
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
                            const ch = channels[sysexChannel];
                            // Channel may be above 15
                            if (!ch) break;
                            if (
                                syx.controller === MIDIControllers.bankSelectLSB
                            )
                                ch.bankLSB = syx.value;
                            else if (
                                syx.controller === MIDIControllers.bankSelect
                            )
                                ch.bankMSB = syx.value;
                        }
                    }
                }
            }
        }
    }

    for (const [preset, keysForPreset] of usedProgramsAndKeys.entries()) {
        if (keysForPreset.size === 0) {
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
