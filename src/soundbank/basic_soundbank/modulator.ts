import { type GeneratorType, generatorTypes, MAX_GENERATOR } from "./generator_types";
import type { ModulatorSourceIndex } from "../types";
import { type ModulatorCurveType, modulatorCurveTypes, modulatorSources, type ModulatorTransformType } from "../enums";
import { midiControllers } from "../../midi/enums";
import { writeWord } from "../../utils/byte_functions/little_endian";
import type { IndexedByteArray } from "../../utils/indexed_array";
import { ModulatorSource } from "./modulator_source";

/**
 * Modulators.ts
 * purpose: parses soundfont modulators and the source enums, also includes the default modulators list
 **/

export const MOD_BYTE_SIZE = 10;

export function getModSourceEnum(
    curveType: ModulatorCurveType,
    isBipolar: boolean,
    isNegative: boolean,
    isCC: boolean,
    index: ModulatorSourceIndex
): number {
    return new ModulatorSource(
        index,
        curveType,
        isCC,
        isBipolar,
        isNegative
    ).toSourceEnum();
}

const defaultResonantModSource = getModSourceEnum(
    modulatorCurveTypes.linear,
    true,
    false,
    true,
    midiControllers.filterResonance
); // Linear forwards bipolar cc 74

export class Modulator {
    /**
     * The current computed value of this modulator. Only used in the synthesis engine for local voices.
     */
    public currentValue = 0;

    /**
     * The generator destination of this modulator.
     */
    public destination: GeneratorType = generatorTypes.initialAttenuation;

    /**
     * The transform amount for this modulator.
     */
    public transformAmount = 0;

    /**
     * The transform type for this modulator.
     */
    public transformType: ModulatorTransformType = 0;

    /**
     * Indicates if the given modulator is chorus or reverb effects modulator.
     * This is done to simulate BASSMIDI effects behavior:
     * - defaults to 1000 transform amount rather than 200
     * - values can be changed, but anything above 200 is 1000
     * (except for values above 1000, they are copied directly)
     * - all values below are multiplied by 5 (200 * 5 = 1000)
     * - still can be disabled if the soundfont has its own modulator curve
     * - this fixes the very low amount of reverb by default and doesn't break soundfonts
     */
    public readonly isEffectModulator: boolean = false;

    /**
     * The default resonant modulator does not affect the filter gain.
     * Neither XG nor GS responded to cc #74 in that way.
     */
    public readonly isDefaultResonantModulator: boolean = false;

    /**
     * The primary source of this modulator.
     */
    public readonly primarySource: ModulatorSource;

    /**
     * The secondary source of this modulator.
     */
    public readonly secondarySource: ModulatorSource;

    /**
     * Creates a new SF2 Modulator
     */
    public constructor(
        primarySource = new ModulatorSource(),
        secondarySource = new ModulatorSource(),
        destination: GeneratorType = generatorTypes.INVALID,
        amount = 0,
        transformType: ModulatorTransformType = 0,
        isEffectModulator = false,
        isDefaultResonantModulator = false
    ) {
        this.primarySource = primarySource;
        this.secondarySource = secondarySource;

        this.destination = destination;
        this.transformAmount = amount;
        this.transformType = transformType;
        this.isEffectModulator = isEffectModulator;
        this.isDefaultResonantModulator = isDefaultResonantModulator;
    }

    private get destinationName() {
        return Object.keys(generatorTypes).find(
            (k) =>
                generatorTypes[k as keyof typeof generatorTypes] ===
                this.destination
        );
    }

    /**
     * Checks if the pair of modulators is identical (in SF2 terms)
     * @param mod1 modulator 1
     * @param mod2 modulator 2
     * @param checkAmount if the amount should be checked too (SF2 specification says to not check it)
     * @returns if they are identical
     */
    public static isIdentical(
        mod1: Modulator,
        mod2: Modulator,
        checkAmount = false
    ): boolean {
        return (
            mod1.primarySource.isIdentical(mod2.primarySource) &&
            mod1.secondarySource.isIdentical(mod2.secondarySource) &&
            mod1.destination === mod2.destination &&
            mod1.transformType === mod2.transformType &&
            (!checkAmount || mod1.transformAmount === mod2.transformAmount)
        );
    }

    public toString() {
        return (
            `Source: ${this.primarySource.toString()}\n` +
            `Secondary source: ${this.secondarySource.toString()}\n` +
            `to: ${this.destinationName}\n` +
            `amount: ${this.transformAmount}` +
            (this.transformType === 2 ? "absolute value" : "")
        );
    }

    /**
     * Copies a modulator.
     * @returns the copied modulator.
     */
    public copy(): Modulator {
        return new Modulator(
            this.primarySource.copy(),
            this.secondarySource.copy(),
            this.destination,
            this.transformAmount,
            this.transformType,
            this.isEffectModulator,
            this.isDefaultResonantModulator
        );
    }

    public write(array: IndexedByteArray) {
        writeWord(array, this.primarySource.toSourceEnum());
        writeWord(array, this.destination);
        writeWord(array, this.transformAmount);
        writeWord(array, this.secondarySource.toSourceEnum());
        writeWord(array, this.transformType);
    }

    /**
     * Sums transform and create a NEW modulator
     * @param modulator the modulator to sum with
     * @returns the new modulator
     */
    public sumTransform(modulator: Modulator): Modulator {
        const m = this.copy();
        m.transformAmount += modulator.transformAmount;
        return m;
    }
}

export class DecodedModulator extends Modulator {
    /**
     * Reads an SF2 modulator
     * @param sourceEnum SF2 source enum
     * @param secondarySourceEnum SF2 secondary source enum
     * @param destination destination
     * @param amount amount
     * @param transformType transform type
     */
    public constructor(
        sourceEnum: number,
        secondarySourceEnum: number,
        destination: GeneratorType,
        amount: number,
        transformType: number
    ) {
        const isEffectModulator =
            (sourceEnum === 0x00db || sourceEnum === 0x00dd) &&
            secondarySourceEnum === 0x0 &&
            (destination === generatorTypes.reverbEffectsSend ||
                destination === generatorTypes.chorusEffectsSend);

        const isDefaultResonantModulator =
            sourceEnum === defaultResonantModSource &&
            secondarySourceEnum === 0x0 &&
            destination === generatorTypes.initialFilterQ;

        super(
            ModulatorSource.fromSourceEnum(sourceEnum),
            ModulatorSource.fromSourceEnum(secondarySourceEnum),
            destination,
            amount,
            transformType as ModulatorTransformType,
            isEffectModulator,
            isDefaultResonantModulator
        );

        if (this.destination > MAX_GENERATOR) {
            this.destination = generatorTypes.INVALID; // Flag as invalid (for linked ones)
        }
    }
}

export const DEFAULT_ATTENUATION_MOD_AMOUNT = 960;
export const DEFAULT_ATTENUATION_MOD_CURVE_TYPE = modulatorCurveTypes.concave;

const defaultSoundFont2Modulators = [
    // Vel to attenuation
    new DecodedModulator(
        getModSourceEnum(
            DEFAULT_ATTENUATION_MOD_CURVE_TYPE,
            false,
            true,
            false,
            modulatorSources.noteOnVelocity
        ),
        0x0,
        generatorTypes.initialAttenuation,
        DEFAULT_ATTENUATION_MOD_AMOUNT,
        0
    ),

    // Mod wheel to vibrato
    new DecodedModulator(0x0081, 0x0, generatorTypes.vibLfoToPitch, 50, 0),

    // Vol to attenuation
    new DecodedModulator(
        getModSourceEnum(
            DEFAULT_ATTENUATION_MOD_CURVE_TYPE,
            false,
            true,
            true,
            midiControllers.mainVolume
        ),
        0x0,
        generatorTypes.initialAttenuation,
        DEFAULT_ATTENUATION_MOD_AMOUNT,
        0
    ),

    // Channel pressure to vibrato
    new DecodedModulator(0x000d, 0x0, generatorTypes.vibLfoToPitch, 50, 0),

    // Pitch wheel to tuning
    new DecodedModulator(0x020e, 0x0010, generatorTypes.fineTune, 12700, 0),

    // Pan to uhh, pan
    // Amount is 500 instead of 1000, see #59
    new DecodedModulator(0x028a, 0x0, generatorTypes.pan, 500, 0),

    // Expression to attenuation
    new DecodedModulator(
        getModSourceEnum(
            DEFAULT_ATTENUATION_MOD_CURVE_TYPE,
            false,
            true,
            true,
            midiControllers.expressionController
        ),
        0x0,
        generatorTypes.initialAttenuation,
        DEFAULT_ATTENUATION_MOD_AMOUNT,
        0
    ),

    // Reverb effects to send
    new DecodedModulator(0x00db, 0x0, generatorTypes.reverbEffectsSend, 200, 0),

    // Chorus effects to send
    new DecodedModulator(0x00dd, 0x0, generatorTypes.chorusEffectsSend, 200, 0)
];

const defaultSpessaSynthModulators = [
    // Custom modulators heck yeah
    // Poly pressure to vibrato
    new DecodedModulator(
        getModSourceEnum(
            modulatorCurveTypes.linear,
            false,
            false,
            false,
            modulatorSources.polyPressure
        ),
        0x0,
        generatorTypes.vibLfoToPitch,
        50,
        0
    ),

    // Cc 92 (tremolo) to modLFO volume
    new DecodedModulator(
        getModSourceEnum(
            modulatorCurveTypes.linear,
            false,
            false,
            true,
            midiControllers.tremoloDepth
        ) /*Linear forward unipolar cc 92 */,
        0x0, // No controller
        generatorTypes.modLfoToVolume,
        24,
        0
    ),

    // Cc 73 (attack time) to volEnv attack
    new DecodedModulator(
        getModSourceEnum(
            modulatorCurveTypes.convex,
            true,
            false,
            true,
            midiControllers.attackTime
        ), // Linear forward bipolar cc 72
        0x0, // No controller
        generatorTypes.attackVolEnv,
        6000,
        0
    ),

    // Cc 72 (release time) to volEnv release
    new DecodedModulator(
        getModSourceEnum(
            modulatorCurveTypes.linear,
            true,
            false,
            true,
            midiControllers.releaseTime
        ), // Linear forward bipolar cc 72
        0x0, // No controller
        generatorTypes.releaseVolEnv,
        3600,
        0
    ),

    // Cc 74 (brightness) to filterFc
    new DecodedModulator(
        getModSourceEnum(
            modulatorCurveTypes.linear,
            true,
            false,
            true,
            midiControllers.brightness
        ), // Linear forwards bipolar cc 74
        0x0, // No controller
        generatorTypes.initialFilterFc,
        6000,
        0
    ),

    // Cc 71 (filter Q) to filter Q (default resonant modulator)
    new DecodedModulator(
        defaultResonantModSource,
        0x0, // No controller
        generatorTypes.initialFilterQ,
        250,
        0
    )
];

export const SPESSASYNTH_DEFAULT_MODULATORS: Modulator[] =
    defaultSoundFont2Modulators.concat(defaultSpessaSynthModulators);
