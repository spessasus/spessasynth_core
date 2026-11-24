import type { MIDIMessage } from "../../midi_message";
import type { MIDISystem } from "../../../soundbank/types";
import type { GlobalMIDIParameter } from "../../../synthesizer/audio_engine/parameters/midi";
import * as MIDIUtils from "../midi_utils";
import type { UserDrumSetParameter } from "../../types";
import type {
    AnalyzedSysExMessage,
    GSInsertionParameterMessage,
    UserDrumSetupMessage
} from "../analyzed_message";
import { GSEqualizerAddressMap, GSInsertionAddressMap } from "../sysex_data";
import type { ClearableParameter, ModifyMIDIOptions } from "./types";
import type {
    GSChorusParameter,
    GSDelayParameter,
    GSReverbParameter
} from "../../../synthesizer/audio_engine/effects/gs/types";

/**
 * The GS reverb parameters in the order the setup writes them.
 * A record, so adding or removing a parameter in {@link GSReverbParameter} fails the build until it is listed here.
 */
const GS_REVERB_SETUP = {
    level: true,
    preLowpass: true,
    character: true,
    time: true,
    delayFeedback: true,
    preDelayTime: true
} satisfies Record<keyof GSReverbParameter, true>;

/**
 * The GS chorus parameters in the order the setup writes them.
 * A record, so adding or removing a parameter in {@link GSChorusParameter} fails the build until it is listed here.
 */
const GS_CHORUS_SETUP = {
    level: true,
    preLowpass: true,
    feedback: true,
    delay: true,
    rate: true,
    depth: true,
    sendLevelToReverb: true,
    sendLevelToDelay: true
} satisfies Record<keyof GSChorusParameter, true>;

/**
 * The GS delay parameters in the order the setup writes them.
 * A record, so adding or removing a parameter in {@link GSDelayParameter} fails the build until it is listed here.
 */
const GS_DELAY_SETUP = {
    level: true,
    preLowpass: true,
    timeCenter: true,
    timeRatioLeft: true,
    timeRatioRight: true,
    levelCenter: true,
    levelLeft: true,
    levelRight: true,
    feedback: true,
    sendLevelToReverb: true
} satisfies Record<keyof GSDelayParameter, true>;

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
    // Note: the encoder throws for values that do not fit their message.
    // Snapshot values come from the synth's effect processors, which clamp every parameter, so they always fit,
    // And a hand-made out of range value is an error on purpose.
    // The effects and User Drum Sets are always written as GS or XG,
    // Only the global MIDI parameters follow the system (Universal for GM)
    const add = (
        message: AnalyzedSysExMessage,
        messageSystem: MIDISystem = "gs"
    ) => {
        output.push(
            ...MIDIUtils.fromAnalyzedMessage(message, {
                ticks: targetTicks,
                preferredSystem: messageSystem
            })
        );
    };

    // Add MIDI parameters
    const midiParamKeys = Object.keys(
        options.midiParams ?? {}
    ) as (keyof GlobalMIDIParameter)[];
    for (const param of midiParamKeys) {
        if (param === "system") continue;
        const value = options.midiParams?.[param];
        if (value === undefined || value === "clear") continue;
        add(
            {
                type: "Global MIDI Param",
                parameter: param,
                value
            },
            system
        );
    }

    // Add effects
    if (system === "xg") {
        if (options.xgReverbParams && options.xgReverbParams !== "clear") {
            const p = options.xgReverbParams;
            add({ type: "XG Reverb Param", parameter: "type", value: p.type });
            add({
                type: "XG Reverb Param",
                parameter: "return",
                value: p.return
            });
            add({ type: "XG Reverb Param", parameter: "pan", value: p.pan });
            for (let param = 0; param < p.params.length; param++) {
                add({
                    type: "XG Reverb Param",
                    parameter: param,
                    value: p.params[param]
                });
            }
        }
        if (options.xgChorusParams && options.xgChorusParams !== "clear") {
            const p = options.xgChorusParams;
            add({ type: "XG Chorus Param", parameter: "type", value: p.type });
            add({
                type: "XG Chorus Param",
                parameter: "return",
                value: p.return
            });
            add({ type: "XG Chorus Param", parameter: "pan", value: p.pan });
            add({
                type: "XG Chorus Param",
                parameter: "sendToReverb",
                value: p.sendToReverb
            });
            for (let param = 0; param < p.params.length; param++) {
                add({
                    type: "XG Chorus Param",
                    parameter: param,
                    value: p.params[param]
                });
            }
        }
        if (
            options.xgVariationParams &&
            options.xgVariationParams !== "clear"
        ) {
            const p = options.xgVariationParams;
            add({
                type: "XG Variation Param",
                parameter: "type",
                value: p.type
            });
            add({
                type: "XG Variation Param",
                parameter: "return",
                value: p.return
            });
            add({ type: "XG Variation Param", parameter: "pan", value: p.pan });
            add({
                type: "XG Variation Param",
                parameter: "sendToReverb",
                value: p.sendToReverb
            });
            add({
                type: "XG Variation Param",
                parameter: "sendToChorus",
                value: p.sendToChorus
            });
            add({
                type: "XG Variation Param",
                parameter: "connection",
                value: p.insertionMode ? "insertion" : "system"
            });
            add({
                type: "XG Variation Param",
                parameter: "partNumber",
                value: p.partNumber
            });
            for (let param = 0; param < p.params.length; param++) {
                add({
                    type: "XG Variation Param",
                    parameter: param,
                    value: p.params[param]
                });
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
                add({
                    type: "XG Insertion Param",
                    insertionNumber,
                    parameter: "type",
                    value: snapshot.type
                });
                add({
                    type: "XG Insertion Param",
                    insertionNumber,
                    parameter: "partNumber",
                    value: snapshot.partNumber
                });
                for (let param = 0; param < snapshot.params.length; param++) {
                    add({
                        type: "XG Insertion Param",
                        insertionNumber,
                        parameter: param,
                        value: snapshot.params[param]
                    });
                }
            }
        }
    } else {
        if (options.gsReverbParams && options.gsReverbParams !== "clear") {
            const p = options.gsReverbParams;
            for (const parameter of Object.keys(
                GS_REVERB_SETUP
            ) as (keyof GSReverbParameter)[]) {
                add({
                    type: "GS Reverb Param",
                    parameter,
                    value: p[parameter]
                });
            }
        }
        if (options.gsChorusParams && options.gsChorusParams !== "clear") {
            const p = options.gsChorusParams;
            for (const parameter of Object.keys(
                GS_CHORUS_SETUP
            ) as (keyof GSChorusParameter)[]) {
                add({
                    type: "GS Chorus Param",
                    parameter,
                    value: p[parameter]
                });
            }
        }
        if (options.gsDelayParams && options.gsDelayParams !== "clear") {
            const p = options.gsDelayParams;
            for (const parameter of Object.keys(
                GS_DELAY_SETUP
            ) as (keyof GSDelayParameter)[]) {
                add({
                    type: "GS Delay Param",
                    parameter,
                    value: p[parameter]
                });
            }
        }
        if (
            options.gsEqualizerParams &&
            options.gsEqualizerParams !== "clear"
        ) {
            const p = options.gsEqualizerParams;
            for (const parameter of Object.keys(
                GSEqualizerAddressMap
            ) as (keyof typeof GSEqualizerAddressMap)[]) {
                add({
                    type: "GS Equalizer Param",
                    parameter,
                    value: p[parameter]
                });
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
            add({
                type: "GS Insertion Param",
                parameter: "type",
                value: p.type
            });
            for (let param = 0; param < p.params.length; param++) {
                const value = p.params[param];
                if (value === 255) continue;
                add({ type: "GS Insertion Param", parameter: param, value });
            }
            for (const parameter of Object.keys(
                GSInsertionAddressMap
            ) as (keyof typeof GSInsertionAddressMap)[]) {
                add({
                    type: "GS Insertion Param",
                    parameter,
                    value: p[parameter]
                } as GSInsertionParameterMessage);
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

                    for (const [parameter, value] of Object.entries(
                        noteParams
                    ) as {
                        [K in keyof UserDrumSetParameter]: [
                            K,
                            ClearableParameter<UserDrumSetParameter[K]>
                        ];
                    }[keyof UserDrumSetParameter][]) {
                        // Parameter cleared, or not a thing in GS
                        if (
                            value === "clear" ||
                            value === undefined ||
                            parameter === "pitchFine"
                        )
                            continue;
                        add({
                            type: "User Drum Setup",
                            drumSet,
                            midiNote,
                            parameter,
                            value
                        } as UserDrumSetupMessage);
                    }
                }
            }
        }

    return output;
}
