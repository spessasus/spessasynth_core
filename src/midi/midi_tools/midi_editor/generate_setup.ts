import type { MIDIMessage } from "../../midi_message";
import type { MIDISystem } from "../../../soundbank/types";
import type { GlobalMIDIParameter } from "../../../synthesizer/audio_engine/parameters/midi";
import * as MIDIUtils from "../midi_utils";
import type { UserDrumSetParameter } from "../../types";
import { GSEqualizerAddressMap, GSInsertionAddressMap } from "../sysex_data";
import type { ClearableParameter, ModifyMIDIOptions } from "./types";

/**
 * Generates a full setup after a reset is encountered.
 * @param options The global options (MIDI parameters, effects, User Drum Sets).
 * @param targetTicks The tick of the reset the setup goes after.
 * @param system The system the setup is written for.
 * @returns The setup messages.
 */
export function generateSetup(
    options: Omit<ModifyMIDIOptions, "channels">,
    targetTicks: number,
    system: MIDISystem
) {
    /*
    ---
    MIDI RESET
    Here is the code that inserts all parameters after a reset
    ---
     */
    const output = new Array<MIDIMessage>();

    // Add MIDI parameters
    const midiParamKeys = Object.keys(
        options.midiParams ?? {}
    ) as (keyof GlobalMIDIParameter)[];
    for (const param of midiParamKeys) {
        if (param === "system") continue;
        const value = options.midiParams?.[param];
        if (value === undefined || value === "clear") continue;
        output.push(
            ...MIDIUtils.setGlobalMIDIParameter(
                targetTicks,
                system,
                param,
                value
            )
        );
    }

    // Add effects
    if (system === "xg") {
        if (options.xgReverbParams && options.xgReverbParams !== "clear") {
            const p = options.xgReverbParams;
            output.push(
                MIDIUtils.setXGReverbParameter(targetTicks, "type", p.type),
                MIDIUtils.setXGReverbParameter(targetTicks, "return", p.return),
                MIDIUtils.setXGReverbParameter(targetTicks, "pan", p.pan)
            );
            for (let param = 0; param < p.params.length; param++) {
                output.push(
                    MIDIUtils.setXGReverbParameter(
                        targetTicks,
                        param,
                        p.params[param]
                    )
                );
            }
        }
        if (options.xgChorusParams && options.xgChorusParams !== "clear") {
            const p = options.xgChorusParams;
            output.push(
                MIDIUtils.setXGChorusParameter(targetTicks, "type", p.type),
                MIDIUtils.setXGChorusParameter(targetTicks, "return", p.return),
                MIDIUtils.setXGChorusParameter(targetTicks, "pan", p.pan),
                MIDIUtils.setXGChorusParameter(
                    targetTicks,
                    "sendToReverb",
                    p.sendToReverb
                )
            );
            for (let param = 0; param < p.params.length; param++) {
                output.push(
                    MIDIUtils.setXGChorusParameter(
                        targetTicks,
                        param,
                        p.params[param]
                    )
                );
            }
        }
        if (
            options.xgVariationParams &&
            options.xgVariationParams !== "clear"
        ) {
            const p = options.xgVariationParams;
            output.push(
                MIDIUtils.setXGVariationParameter(targetTicks, "type", p.type),
                MIDIUtils.setXGVariationParameter(
                    targetTicks,
                    "return",
                    p.return
                ),
                MIDIUtils.setXGVariationParameter(targetTicks, "pan", p.pan),
                MIDIUtils.setXGVariationParameter(
                    targetTicks,
                    "sendToReverb",
                    p.sendToReverb
                ),
                MIDIUtils.setXGVariationParameter(
                    targetTicks,
                    "sendToChorus",
                    p.sendToChorus
                ),
                MIDIUtils.setXGVariationParameter(
                    targetTicks,
                    "connection",
                    p.insertionMode ? "insertion" : "system"
                ),
                MIDIUtils.setXGVariationParameter(
                    targetTicks,
                    "partNumber",
                    p.partNumber
                )
            );
            for (let param = 0; param < p.params.length; param++) {
                output.push(
                    MIDIUtils.setXGVariationParameter(
                        targetTicks,
                        param,
                        p.params[param]
                    )
                );
            }
        }
        if (options.xgInsertionParams) {
            for (const [
                insertionNumber,
                snapshot
            ] of options.xgInsertionParams) {
                if (snapshot === "clear") {
                    continue;
                }
                output.push(
                    MIDIUtils.setXGInsertionParameter(
                        targetTicks,
                        insertionNumber,
                        "type",
                        snapshot.type
                    ),
                    MIDIUtils.setXGInsertionParameter(
                        targetTicks,
                        insertionNumber,
                        "partNumber",
                        snapshot.partNumber
                    )
                );
                for (let param = 0; param < snapshot.params.length; param++) {
                    output.push(
                        MIDIUtils.setXGInsertionParameter(
                            targetTicks,
                            insertionNumber,
                            param,
                            snapshot.params[param]
                        )
                    );
                }
            }
        }
    } else {
        if (options.gsReverbParams && options.gsReverbParams !== "clear") {
            const p = options.gsReverbParams;
            output.push(
                MIDIUtils.setGSReverbParameter(targetTicks, "level", p.level),
                MIDIUtils.setGSReverbParameter(
                    targetTicks,
                    "preLowpass",
                    p.preLowpass
                ),
                MIDIUtils.setGSReverbParameter(
                    targetTicks,
                    "character",
                    p.character
                ),
                MIDIUtils.setGSReverbParameter(targetTicks, "time", p.time),
                MIDIUtils.setGSReverbParameter(
                    targetTicks,
                    "delayFeedback",
                    p.delayFeedback
                ),
                MIDIUtils.setGSReverbParameter(
                    targetTicks,
                    "preDelayTime",
                    p.preDelayTime
                )
            );
        }
        if (options.gsChorusParams && options.gsChorusParams !== "clear") {
            const p = options.gsChorusParams;
            output.push(
                MIDIUtils.setGSChorusParameter(targetTicks, "level", p.level),
                MIDIUtils.setGSChorusParameter(
                    targetTicks,
                    "preLowpass",
                    p.preLowpass
                ),
                MIDIUtils.setGSChorusParameter(
                    targetTicks,
                    "feedback",
                    p.feedback
                ),
                MIDIUtils.setGSChorusParameter(targetTicks, "delay", p.delay),
                MIDIUtils.setGSChorusParameter(targetTicks, "rate", p.rate),
                MIDIUtils.setGSChorusParameter(targetTicks, "depth", p.depth),
                MIDIUtils.setGSChorusParameter(
                    targetTicks,
                    "sendLevelToReverb",
                    p.sendLevelToReverb
                ),
                MIDIUtils.setGSChorusParameter(
                    targetTicks,
                    "sendLevelToDelay",
                    p.sendLevelToDelay
                )
            );
        }
        if (options.gsDelayParams && options.gsDelayParams !== "clear") {
            const p = options.gsDelayParams;
            output.push(
                MIDIUtils.setGSDelayParameter(targetTicks, "level", p.level),
                MIDIUtils.setGSDelayParameter(
                    targetTicks,
                    "preLowpass",
                    p.preLowpass
                ),
                MIDIUtils.setGSDelayParameter(
                    targetTicks,
                    "timeCenter",
                    p.timeCenter
                ),
                MIDIUtils.setGSDelayParameter(
                    targetTicks,
                    "timeRatioLeft",
                    p.timeRatioLeft
                ),
                MIDIUtils.setGSDelayParameter(
                    targetTicks,
                    "timeRatioRight",
                    p.timeRatioRight
                ),
                MIDIUtils.setGSDelayParameter(
                    targetTicks,
                    "levelCenter",
                    p.levelCenter
                ),
                MIDIUtils.setGSDelayParameter(
                    targetTicks,
                    "levelLeft",
                    p.levelLeft
                ),
                MIDIUtils.setGSDelayParameter(
                    targetTicks,
                    "levelRight",
                    p.levelRight
                ),
                MIDIUtils.setGSDelayParameter(
                    targetTicks,
                    "feedback",
                    p.feedback
                ),
                MIDIUtils.setGSDelayParameter(
                    targetTicks,
                    "sendLevelToReverb",
                    p.sendLevelToReverb
                )
            );
        }
        if (
            options.gsEqualizerParams &&
            options.gsEqualizerParams !== "clear"
        ) {
            const p = options.gsEqualizerParams;
            for (const name of Object.keys(
                GSEqualizerAddressMap
            ) as (keyof typeof GSEqualizerAddressMap)[]) {
                output.push(
                    MIDIUtils.setGSEqualizerParameter(
                        targetTicks,
                        name,
                        p[name]
                    )
                );
            }
        }
        if (
            options.gsInsertionParams &&
            options.gsInsertionParams !== "clear"
        ) {
            const p = options.gsInsertionParams;
            // This adds them in order
            // The order is:
            // Type (resets the params and sends)
            // Changed params (255 is the type default)
            // Sends and EFX control
            output.push(
                MIDIUtils.setGSInsertionParameter(targetTicks, "type", p.type)
            );
            for (let param = 0; param < p.params.length; param++) {
                const value = p.params[param];
                if (value === 255) continue;
                output.push(
                    MIDIUtils.setGSInsertionParameter(targetTicks, param, value)
                );
            }
            for (const name of Object.keys(
                GSInsertionAddressMap
            ) as (keyof typeof GSInsertionAddressMap)[]) {
                output.push(
                    MIDIUtils.setGSInsertionParameter(
                        targetTicks,
                        name,
                        p[name]
                    )
                );
            }
        }
    }

    // User Drum parameters
    if (options.userDrumParams)
        for (const [drumSet, params] of options.userDrumParams) {
            if (params !== "clear") {
                for (const [midiNote, noteParams] of params) {
                    // Note cleared
                    if (noteParams === "clear") continue;

                    for (const [param, value] of Object.entries(noteParams) as {
                        [K in keyof UserDrumSetParameter]: [
                            K,
                            ClearableParameter<UserDrumSetParameter[K]>
                        ];
                    }[keyof UserDrumSetParameter][]) {
                        // Parameter cleared, or not a thing in GS
                        if (
                            value === "clear" ||
                            value === undefined ||
                            param === "pitchFine"
                        )
                            continue;
                        output.push(
                            MIDIUtils.setUserDrumParameter(
                                targetTicks,
                                drumSet,
                                midiNote,
                                param,
                                value
                            )
                        );
                    }
                }
            }
        }

    return output;
}
