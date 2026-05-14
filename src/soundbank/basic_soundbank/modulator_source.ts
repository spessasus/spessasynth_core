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
    getModulatorCurveValue,
    MOD_CURVE_TYPES_AMOUNT,
    MOD_SOURCE_TRANSFORM_POSSIBILITIES,
    MODULATOR_RESOLUTION
} from "./modulator_curves";
import type { Voice } from "../../synthesizer/audio_engine/voice/voice";
import { MIDIControllers } from "../../midi/enums";

export class ModulatorSource {
    /**
     * If this field is set to false, the controller should be mapped with a minimum value of 0 and a maximum value of 1. This is also
     * called Unipolar. Thus, it behaves similar to the Modulation Wheel controller of the MIDI specification.
     *
     * If this field is set to true, the controller sound be mapped with a minimum value of -1 and a maximum value of 1. This is also
     * called Bipolar. Thus, it behaves similar to the Pitch Wheel controller of the MIDI specification.
     */
    public isBipolar;
    /**
     * If this field is set true, the direction of the controller should be from the maximum value to the minimum value. So, for
     * example, if the controller source is Key Number, then a Key Number value of 0 corresponds to the maximum possible
     * controller output, and the Key Number value of 127 corresponds to the minimum possible controller input.
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
     * This field specifies how the minimum value approaches the maximum value.
     */
    public curveType: ModulatorCurveType;

    /**
     * @internal
     * @param index
     * @param curveType
     * @param isCC
     * @param isBipolar
     * @param isNegative
     */
    public constructor(
        index: ModulatorSourceIndex = ModulatorControllerSources.noController,
        curveType: ModulatorCurveType = ModulatorCurveTypes.linear,
        isCC = false,
        isBipolar = false,
        isNegative = false
    ) {
        this.isBipolar = isBipolar;
        this.isNegative = isNegative;
        this.index = index;
        this.isCC = isCC;
        this.curveType = curveType;
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

    private get curveTypeName() {
        return (
            Object.keys(ModulatorCurveTypes).find(
                (k) =>
                    ModulatorCurveTypes[
                        k as keyof typeof ModulatorCurveTypes
                    ] === this.curveType
            ) ?? this.curveType.toString()
        );
    }

    public static fromSourceEnum(sourceEnum: number) {
        const isBipolar = bitMaskToBool(sourceEnum, 9);
        const isNegative = bitMaskToBool(sourceEnum, 8);
        const isCC = bitMaskToBool(sourceEnum, 7);
        const index = (sourceEnum & 127) as ModulatorSourceIndex;
        const curveType = ((sourceEnum >> 10) & 0x3) as ModulatorCurveType;
        return new ModulatorSource(
            index,
            curveType,
            isCC,
            isBipolar,
            isNegative
        );
    }

    /**
     * Copies the modulator source.
     * @param source The source to copy from.
     * @returns the copied source.
     */
    public static copyFrom(source: ModulatorSource) {
        return new ModulatorSource(
            source.index,
            source.curveType,
            source.isCC,
            source.isBipolar,
            source.isNegative
        );
    }

    public toString() {
        return `${this.sourceName} ${this.curveTypeName} ${this.isBipolar ? "bipolar" : "unipolar"} ${this.isNegative ? "negative" : "positive"}`;
    }

    public toSourceEnum() {
        return (
            (this.curveType << 10) |
            (toNumericBool(this.isBipolar) << 9) |
            (toNumericBool(this.isNegative) << 8) |
            (toNumericBool(this.isCC) << 7) |
            this.index
        );
    }

    public isIdentical(source: ModulatorSource) {
        return (
            this.index === source.index &&
            this.isNegative === source.isNegative &&
            this.isCC === source.isCC &&
            this.isBipolar === source.isBipolar &&
            this.curveType === source.curveType
        );
    }

    /**
     * Gets the current value from this source.
     * @param channel the MIDI channel to compute for.
     * @param pitchWheel the pitch wheel value, as channel determines if it's a per-note or a global value.
     * @param voice The voice to get the data for.
     */
    public getValue(channel: SF2Channel, pitchWheel: number, voice: Voice) {
        // The raw 14-bit value (0 - 16,383)
        let rawValue;
        if (this.isCC) {
            rawValue = channel.midiControllers[this.index];
        } else {
            switch (this.index) {
                default:
                case ModulatorControllerSources.noController: {
                    rawValue = 16_383; // Equals to 1
                    break;
                }

                case ModulatorControllerSources.noteOnVelocity: {
                    rawValue = voice.velocity << 7;
                    break;
                }

                case ModulatorControllerSources.noteOnKeyNum: {
                    rawValue = voice.targetKey << 7;
                    break;
                }

                case ModulatorControllerSources.polyPressure: {
                    rawValue = voice.pressure << 7;
                    break;
                }

                case ModulatorControllerSources.channelPressure: {
                    rawValue = channel.midiParameters.pressure << 7;
                    break;
                }

                case ModulatorControllerSources.pitchWheel: {
                    rawValue = pitchWheel;
                    break;
                }

                case ModulatorControllerSources.pitchWheelRange: {
                    // Pitch wheel range may be a floating point number!
                    // Therefore, something like "0.5 << 7" won't work,
                    // So we multiply it by 128 which is essentially the same here
                    // But it allows for fractional pitch wheel range!
                    rawValue = Math.floor(
                        channel.midiParameters.pitchWheelRange * 128
                    );
                }
            }
        }

        // Transform the value
        // 2-bit number as in 0bPD
        const transformType =
            (this.isBipolar ? 0b10 : 0b00) | (this.isNegative ? 1 : 0);

        return MODULATOR_TRANSFORMS[
            MODULATOR_RESOLUTION *
                (this.curveType * MOD_CURVE_TYPES_AMOUNT + transformType) +
                rawValue
        ];
    }
}

/**
 * To get the value, you do
 * MODULATOR_RESOLUTION * (MOD_CURVE_TYPES_AMOUNT * curveType + transformType) + your raw value as 14-bit number (0 - 16,383)
 */
const MODULATOR_TRANSFORMS = new Float32Array(
    MODULATOR_RESOLUTION *
        MOD_SOURCE_TRANSFORM_POSSIBILITIES *
        MOD_CURVE_TYPES_AMOUNT
);

for (let curveType = 0; curveType < MOD_CURVE_TYPES_AMOUNT; curveType++) {
    for (
        let transformType = 0;
        transformType < MOD_SOURCE_TRANSFORM_POSSIBILITIES;
        transformType++
    ) {
        const tableIndex =
            MODULATOR_RESOLUTION *
            (curveType * MOD_CURVE_TYPES_AMOUNT + transformType);
        for (let value = 0; value < MODULATOR_RESOLUTION; value++) {
            MODULATOR_TRANSFORMS[tableIndex + value] = getModulatorCurveValue(
                transformType,
                curveType as ModulatorCurveType,
                value / MODULATOR_RESOLUTION
            );
        }
    }
}
