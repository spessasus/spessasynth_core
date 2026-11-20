import type { ModulatorSourceIndex, SF2Channel } from "../types";
import {
    ModulatorControllerSources,
    type ModulatorCurveType,
    ModulatorCurveTypes
} from "../enums";
import {
    bitMaskToBool,
    toNumericBool
} from "../../utils/byte_functions/bit_mask";
import {
    ModulatorCurve,
    SOURCE_VALUE_14_BIT,
    SOURCE_VALUE_7_BIT
} from "./modulator_curve";
import { CustomCurve, type CustomCurveUser } from "./custom_curve";
import type { Voice } from "../../synthesizer/audio_engine/voice/voice";
import { type MIDIController, MIDIControllers } from "../../midi/enums";

/**
 * Represents a single {@link Modulator} source.
 *
 * @group Sound Banks.Modulators
 */
export class ModulatorSource {
    /**
     * If this field is set to false, the controller should be mapped with a minimum value of 0 and a maximum value of 1. This is also
     * called Unipolar. Thus, it behaves similar to the Modulation Wheel controller of the MIDI specification.
     *
     * If this field is set to true, the controller should be mapped with a minimum value of -1 and a maximum value of 1. This is also
     * called Bipolar. Thus, it behaves similar to the Pitch Wheel controller of the MIDI specification.
     */
    public isBipolar;
    /**
     * If this field is set true, the direction of the controller should be from the maximum value to the minimum value. So, for
     * example, if the controller source is Key Number, then a Key Number value of 0 corresponds to the maximum possible
     * controller output, and the Key Number value of 127 corresponds to the minimum possible controller output.
     */
    public isNegative;

    /**
     * The index of the source.
     * It can point to one of the MIDI controllers or one of the predefined sources, depending on the 'isCC' flag.
     */
    public index: ModulatorSourceIndex;

    /**
     * If this field is set to true, the MIDI Controller Palette is selected. The ‘index’ field value corresponds to one of the 128
     * MIDI Continuous Controller messages as defined in the MIDI specification.
     */
    public isCC;

    /**
     * The element whose modulator uses this source, while the modulator is in a zone or in the default modulators.
     * Setting a {@link CustomCurve} then links it to that element.
     * @internal
     */
    public user?: CustomCurveUser;

    private storedCurve: ModulatorCurve;

    /**
     * Creates a new modulator source.
     * @param index The controller or MIDI CC number, see `isCC`.
     * @param curve How the minimum value approaches the maximum value: a curve type or a curve, such as a {@link CustomCurve}.
     * @param isCC If the index is a MIDI CC instead of a general controller.
     * @param isBipolar If the source is bipolar (-1 to 1) instead of unipolar (0 to 1).
     * @param isNegative If the direction of the source is flipped.
     */
    public constructor(
        index: ModulatorSourceIndex = ModulatorControllerSources.noController,
        curve: ModulatorCurveType | ModulatorCurve = ModulatorCurveTypes.linear,
        isCC = false,
        isBipolar = false,
        isNegative = false
    ) {
        this.isBipolar = isBipolar;
        this.isNegative = isNegative;
        this.index = index;
        this.isCC = isCC;
        this.storedCurve =
            typeof curve === "number" ? ModulatorCurve.fromType(curve) : curve;
    }

    /**
     * The curve, which specifies how the minimum value approaches the maximum value.
     * A {@link CustomCurve} is SFe only. The direction reverses the source value (16384 - x) before the curve.
     *
     * > **Note**
     * >
     * > When the modulator belongs to a zone or the default modulators, setting a {@link CustomCurve} links it
     * > to that element, like a zone's sample. The curve should be in the sound bank's
     * > {@link BasicSoundBank.customCurves}.
     */
    public get curve() {
        return this.storedCurve;
    }

    public set curve(curve: ModulatorCurve) {
        const user = this.user;
        if (user) {
            if (this.storedCurve instanceof CustomCurve)
                this.storedCurve.unlinkFrom(user);
            if (curve instanceof CustomCurve) curve.linkTo(user);
        }
        this.storedCurve = curve;
    }

    /**
     * The curve type. Setting it selects that built-in curve.
     * A custom type without a {@link CustomCurve} outputs 0.
     */
    public get curveType() {
        return this.curve.type;
    }

    public set curveType(type: ModulatorCurveType) {
        this.curve = ModulatorCurve.fromType(type);
    }

    private get sourceName() {
        return this.isCC
            ? (Object.keys(MIDIControllers).find(
                  (k) =>
                      MIDIControllers[k as keyof typeof MIDIControllers] ===
                      this.index
              ) ?? this.index.toString())
            : (Object.keys(ModulatorControllerSources).find(
                  (k) =>
                      ModulatorControllerSources[
                          k as keyof typeof ModulatorControllerSources
                      ] === this.index
              ) ?? this.index.toString());
    }

    /**
     * @internal
     * @param sourceEnum
     */
    public static fromSourceEnum(sourceEnum: number) {
        const isBipolar = bitMaskToBool(sourceEnum, 9);
        const isNegative = bitMaskToBool(sourceEnum, 8);
        const isCC = bitMaskToBool(sourceEnum, 7);
        const index = (sourceEnum & 127) as ModulatorSourceIndex;
        // 6 bits, SF2 curve types are 0 to 3, SFe adds 4 (custom)
        const curveType = ((sourceEnum >> 10) & 0x3f) as ModulatorCurveType;
        return new ModulatorSource(
            index,
            curveType,
            isCC,
            isBipolar,
            isNegative
        );
    }

    /**
     * Copies a modulator source, with the same curve.
     * A source belongs to one modulator, so use a copy to build another modulator from an existing one's source.
     *
     * > **Note**
     * >
     * > The custom curves of {@link SPESSASYNTH_DEFAULT_MODULATORS} are shared by every bank and can't be linked,
     * > so a copy of such a source gets a new copy of the curve. Add it to the sound bank's
     * > {@link BasicSoundBank.customCurves} like any other curve.
     *
     * @param source The source to copy from.
     * @returns the copied source.
     */
    public static copyFrom(source: ModulatorSource) {
        const curve = source.curve;
        return new ModulatorSource(
            source.index,
            curve instanceof CustomCurve && Object.isFrozen(curve)
                ? new CustomCurve(curve.points, curve.name)
                : curve,
            source.isCC,
            source.isBipolar,
            source.isNegative
        );
    }

    public toString() {
        return `${this.sourceName} ${this.curve.toString()} ${this.isBipolar ? "bipolar" : "unipolar"} ${this.isNegative ? "negative" : "positive"}`;
    }

    /**
     * @internal
     */
    public toSourceEnum() {
        return (
            (this.curveType << 10) |
            (toNumericBool(this.isBipolar) << 9) |
            (toNumericBool(this.isNegative) << 8) |
            (toNumericBool(this.isCC) << 7) |
            this.index
        );
    }

    /**
     * Checks if the source is identical to another source, per SF2 definition.
     * @param source The source to compare against.
     */
    public isIdentical(source: ModulatorSource) {
        return (
            this.index === source.index &&
            this.isNegative === source.isNegative &&
            this.isCC === source.isCC &&
            this.isBipolar === source.isBipolar &&
            // Custom curves are the same only if their points are
            this.curve.isIdentical(source.curve)
        );
    }

    /**
     * Checks if the source is a given MIDI Controller.
     * @param controller The controller to check.
     */
    public isController(controller: MIDIController) {
        return this.isCC && this.index === controller;
    }

    /**
     * Gets the current value from this source.
     * @param channel the MIDI channel to compute for.
     * @param pitchWheel the pitch wheel value, as channel determines if it's a per-note or a global value.
     * @param voice The voice to get the data for.
     * @internal
     */
    public getValue(channel: SF2Channel, pitchWheel: number, voice: Voice) {
        // The source value x, 0 to 16,384 (SFe 4.0, section 7.2): 7-bit and 14-bit values are mapped center-max,
        // So the center and the maximum are exact
        let x;
        if (this.isCC) {
            // A controller is its 7-bit value alone, the LSB controllers are sources of their own
            x = SOURCE_VALUE_7_BIT[channel.midiControllers[this.index] >> 7];
        } else {
            switch (this.index) {
                // No Controller is the end of the range.
                // An unknown source makes the modulator ignored when it is read, this is only a fallback
                default: {
                    x = 16_384;
                    break;
                }

                case ModulatorControllerSources.noteOnVelocity: {
                    x = SOURCE_VALUE_7_BIT[voice.velocity];
                    break;
                }

                case ModulatorControllerSources.noteOnKeyNum: {
                    x = SOURCE_VALUE_7_BIT[voice.targetKey];
                    break;
                }

                case ModulatorControllerSources.polyPressure: {
                    // Use MIDI Note here as key shift is internal
                    x =
                        SOURCE_VALUE_7_BIT[
                            channel.polyPressures[voice.midiNote]
                        ];
                    break;
                }

                case ModulatorControllerSources.channelPressure: {
                    x = SOURCE_VALUE_7_BIT[channel.midiParameters.pressure];
                    break;
                }

                case ModulatorControllerSources.pitchWheel: {
                    x = SOURCE_VALUE_14_BIT[pitchWheel];
                    break;
                }

                case ModulatorControllerSources.pitchWheelRange: {
                    // The range in 1/128 semitones, it may be fractional.
                    // Ranges of 128 semitones and more would read past the table
                    x =
                        SOURCE_VALUE_14_BIT[
                            Math.min(
                                16_383,
                                Math.floor(
                                    channel.midiParameters.pitchWheelRange * 128
                                )
                            )
                        ];
                    break;
                }

                case ModulatorControllerSources.modulationDepthRange: {
                    // The parameter is in cents, RPN 5 value is cents * 1.28 (100/128 cents per step)
                    // The source is full at 16 semitones, so it is 8 times that value
                    x =
                        SOURCE_VALUE_14_BIT[
                            Math.min(
                                16_383,
                                Math.round(
                                    channel.midiParameters.modulationDepth *
                                        1.28
                                ) * 8
                            )
                        ];
                }
            }
        }

        const curve = this.storedCurve;
        if (curve instanceof CustomCurve) {
            return curve.getValue(x, this.isBipolar, this.isNegative);
        }
        // 2-bit transform as in 0bPD
        return curve.tables[
            (this.isBipolar ? 0b10 : 0b00) | (this.isNegative ? 1 : 0)
        ][x];
    }
}
