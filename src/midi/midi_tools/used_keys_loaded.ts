import {
    SpessaSynthGroupCollapsed,
    SpessaSynthGroupEnd,
    SpessaSynthInfo
} from "../../utils/loggin";
import { consoleColors } from "../../utils/other";
import { DEFAULT_PERCUSSION } from "../../synthesizer/audio_engine/engine_components/synth_constants";
import {
    isGM2On,
    isGMOn,
    isGSDrumsOn,
    isGSOn,
    isXGOn
} from "../../utils/sysex_detector";
import type { BasicMIDI } from "../basic_midi";
import type { BasicSoundBank } from "../../soundbank/basic_soundbank/basic_soundbank";
import type { BasicPreset } from "../../soundbank/basic_soundbank/basic_preset";
import type { SynthSystem } from "../../synthesizer/types";
import {
    type MIDIController,
    midiControllers,
    midiMessageTypes
} from "../enums";
import type { SoundBankManager } from "../../synthesizer/audio_engine/engine_components/sound_bank_manager";

interface InternalChannelType {
    preset: BasicPreset;
    bankMSB: number;
    bankLSB: number;
    isDrum: boolean;
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
): Map<BasicPreset, Set<string>> {
    SpessaSynthGroupCollapsed(
        "%cSearching for all used programs and keys...",
        consoleColors.info
    );
    // Find every used preset and every key:velocity for each.
    // Make sure to care about ports and drums.
    const channelsAmount = 16 + Math.max(...mid.portChannelOffsetMap);
    const channelPresets: InternalChannelType[] = [];

    // Check for xg
    let system: SynthSystem = "gs";

    for (let i = 0; i < channelsAmount; i++) {
        const isDrum = i % 16 === DEFAULT_PERCUSSION;
        channelPresets.push({
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
            isDrum
        });
    }

    /**
     * Find all programs used and key-velocity combos in them
     * bank:program each has a set of midiNote-velocity
     */
    const usedProgramsAndKeys = new Map<BasicPreset, Set<string>>();

    const ports = mid.tracks.map((t) => t.port);

    mid.iterate((event, trackNum) => {
        if (event.statusByte === midiMessageTypes.midiPort) {
            ports[trackNum] = event.data[0];
            return;
        }
        const status = event.statusByte & 0xf0;
        if (
            status !== midiMessageTypes.noteOn &&
            status !== midiMessageTypes.controllerChange &&
            status !== midiMessageTypes.programChange &&
            status !== midiMessageTypes.systemExclusive
        ) {
            return;
        }
        const channel =
            (event.statusByte & 0xf) +
                mid.portChannelOffsetMap[ports[trackNum]] || 0;
        let ch = channelPresets[channel];
        switch (status) {
            case midiMessageTypes.programChange: {
                ch.preset = soundBank.getPreset(
                    {
                        bankMSB: ch.bankMSB,
                        bankLSB: ch.bankLSB,
                        program: event.data[0],
                        isGMGSDrum: ch.isDrum
                    },
                    system
                );
                break;
            }

            case midiMessageTypes.controllerChange: {
                {
                    switch (event.data[0] as MIDIController) {
                        default: {
                            return;
                        }

                        case midiControllers.bankSelectLSB: {
                            ch.bankLSB = event.data[1];
                            break;
                        }

                        case midiControllers.bankSelect: {
                            ch.bankMSB = event.data[1];
                        }
                    }
                }
                break;
            }

            case midiMessageTypes.noteOn: {
                if (event.data[1] === 0) {
                    // That's a note off
                    return;
                }

                let combos = usedProgramsAndKeys.get(ch.preset);
                if (!combos) {
                    combos = new Set<string>();
                    usedProgramsAndKeys.set(ch.preset, combos);
                }

                combos.add(`${event.data[0]}-${event.data[1]}`);
                break;
            }

            case midiMessageTypes.systemExclusive: {
                // Check for drum sysex
                {
                    if (!isGSDrumsOn(event)) {
                        // Check for XG
                        if (isXGOn(event)) {
                            system = "xg";
                            SpessaSynthInfo(
                                "%cXG on detected!",
                                consoleColors.recognized
                            );
                        } else if (isGM2On(event)) {
                            system = "gm2";
                            SpessaSynthInfo(
                                "%cGM2 on detected!",
                                consoleColors.recognized
                            );
                        } else if (isGMOn(event)) {
                            system = "gm";
                            SpessaSynthInfo(
                                "%cGM on detected!",
                                consoleColors.recognized
                            );
                        } else if (isGSOn(event)) {
                            system = "gs";
                            SpessaSynthInfo(
                                "%cGS on detected!",
                                consoleColors.recognized
                            );
                        }
                        return;
                    }
                    const sysexChannel =
                        [9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15][
                            event.data[5] & 0x0f
                        ] + mid.portChannelOffsetMap[ports[trackNum]];
                    const isDrum = !!(event.data[7] > 0 && event.data[5] >> 4);
                    ch = channelPresets[sysexChannel];
                    ch.isDrum = isDrum;
                }
                break;
            }
        }
    });

    for (const [preset, combos] of usedProgramsAndKeys.entries()) {
        if (combos.size === 0) {
            SpessaSynthInfo(
                `%cDetected change but no keys for %c${preset.name}`,
                consoleColors.info,
                consoleColors.value
            );
            usedProgramsAndKeys.delete(preset);
        }
    }

    SpessaSynthGroupEnd();
    return usedProgramsAndKeys;
}
