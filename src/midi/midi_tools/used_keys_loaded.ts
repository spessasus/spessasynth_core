import {
    SpessaSynthGroupCollapsed,
    SpessaSynthGroupEnd,
    SpessaSynthInfo,
    SpessaSynthWarn
} from "../../utils/loggin";
import { consoleColors } from "../../utils/other";
import { DEFAULT_PERCUSSION } from "../../synthesizer/audio_engine/engine_components/synth_constants";
import { SysEx } from "../../utils/sysex";
import type { BasicMIDI } from "../basic_midi";
import type { BasicSoundBank } from "../../soundbank/basic_soundbank/basic_soundbank";
import type { BasicPreset } from "../../soundbank/basic_soundbank/basic_preset";
import type { SynthSystem } from "../../synthesizer/types";
import { midiControllers, midiMessageTypes } from "../enums";
import type { SoundBankManager } from "../../synthesizer/audio_engine/engine_components/sound_bank_manager";

interface InternalChannelType {
    preset?: BasicPreset;
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
) {
    SpessaSynthGroupCollapsed(
        "%cSearching for all used programs and keys...",
        consoleColors.info
    );
    // Find every used preset and every key:velocity for each.
    // Make sure to care about ports and drums.
    const channelsAmount = 16 + Math.max(...mid.portChannelOffsetMap);
    const channels: InternalChannelType[] = [];

    // Check for xg
    let system: SynthSystem = "gs";

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
            isDrum
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
            e.statusByte === midiMessageTypes.midiPort &&
            mid.tracks[trackNum].channels.size > 0
        ) {
            let port = e.data[0];
            if (offsetMap[port] === undefined) {
                SpessaSynthWarn(
                    `Invalid port ${port} on track ${trackNum}. (No offset found in the MIDI map.`
                );
                port = 0;
            }
            ports[trackNum] = port;
            continue;
        }
        const status = e.statusByte & 0xf0;
        if (
            status !== midiMessageTypes.noteOn &&
            status !== midiMessageTypes.controllerChange &&
            status !== midiMessageTypes.programChange &&
            status !== midiMessageTypes.systemExclusive
        ) {
            continue;
        }

        switch (status) {
            case midiMessageTypes.programChange: {
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

            case midiMessageTypes.controllerChange: {
                const channel =
                    (e.statusByte & 0xf) + offsetMap[ports[trackNum]] || 0;
                const ch = channels[channel];
                if (e.data[0] === midiControllers.bankSelectLSB)
                    ch.bankLSB = e.data[1];
                else if (e.data[0] === midiControllers.bankSelect)
                    ch.bankLSB = e.data[1];
                break;
            }

            case midiMessageTypes.noteOn: {
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

                combos.add(`${e.data[0]}-${e.data[1]}`);
                break;
            }

            case midiMessageTypes.systemExclusive: {
                // Check for drum sysex
                {
                    const syx = SysEx.analyze(e.data);
                    switch (syx.type) {
                        default: {
                            break;
                        }

                        // Check for XG
                        case "XG Reset": {
                            system = "xg";
                            SpessaSynthInfo(
                                "%cXG on detected!",
                                consoleColors.recognized
                            );
                            break;
                        }

                        case "GM2 On": {
                            system = "gm2";
                            SpessaSynthInfo(
                                "%cGM2 on detected!",
                                consoleColors.recognized
                            );
                            break;
                        }

                        case "GM Off":
                        case "GM On": {
                            system = "gm";
                            SpessaSynthInfo(
                                "%cGM on detected!",
                                consoleColors.recognized
                            );
                            break;
                        }

                        case "GS Reset": {
                            system = "gs";
                            SpessaSynthInfo(
                                "%cGS on detected!",
                                consoleColors.recognized
                            );
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
                                syx.controller === midiControllers.bankSelectLSB
                            )
                                channels[sysexChannel].bankLSB = syx.value;
                            else if (
                                syx.controller === midiControllers.bankSelect
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
