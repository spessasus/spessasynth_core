import { generatorTypes, MAX_GENERATOR } from "./generator_types";
import type { ModulatorNumericBool, ModulatorSourceIndex } from "../types";
import { modulatorCurveTypes, modulatorSources, type modulatorTransformTypes } from "../enums";
import { midiControllers } from "../../midi/enums";

/**
 * modulators.js
 * purpose: parses soundfont modulators and the source enums, also includes the default modulators list
 **/

export const MOD_BYTE_SIZE = 10;

export function getModSourceEnum(
    curveType: modulatorCurveTypes,
    polarity: ModulatorNumericBool,
    direction: ModulatorNumericBool,
    isCC: ModulatorNumericBool,
    index: ModulatorSourceIndex
): number {
    return (
        (curveType << 10) |
        (polarity << 9) |
        (direction << 8) |
        (isCC << 7) |
        index
    );
}

const defaultResonantModSource = getModSourceEnum(
    modulatorCurveTypes.linear,
    1,
    0,
    1,
    midiControllers.filterResonance
); // linear forwards bipolar cc 74

export class Modulator {
    /**
     * The current computed value of this modulator. Only used in the synthesis engine for local voices.
     */
    currentValue: number = 0;

    /**
     * The generator destination of this modulator.
     */
    destination: generatorTypes;

    /**
     * The transform amount for this modulator.
     */
    transformAmount: number;

    /**
     * The transform type for this modulator.
     */
    transformType: modulatorTransformTypes;

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
    readonly isEffectModulator: boolean = false;

    /**
     * The default resonant modulator does not affect the filter gain.
     * Neither XG nor GS responded to cc #74 in that way.
     */
    readonly isDefaultResonantModulator: boolean = false;

    /**
     * 1 if the source is bipolar (min is -1, max is 1)
     * otherwise min is 0 and max is 1
     */
    sourcePolarity: ModulatorNumericBool;

    /**
     * 1 if the source is negative (from 1 to 0)
     */
    sourceDirection: ModulatorNumericBool;

    /**
     * 1 if the source uses a MIDI CC
     */
    sourceUsesCC: ModulatorNumericBool;

    /**
     * source index/CC number.
     */
    sourceIndex: ModulatorSourceIndex;

    /**
     * source curve type
     */
    sourceCurveType: modulatorCurveTypes;

    /**
     * 1 if the secondary source is bipolar (min is -1, max is 1)
     * otherwise min is 0 and max is 1
     */
    secSrcPolarity: ModulatorNumericBool;

    /**
     * 1 if the secondary source is negative (from 1 to 0)
     */
    secSrcDirection: ModulatorNumericBool;

    /**
     * 1 if the secondary source uses a MIDI CC
     */
    secSrcUsesCC: ModulatorNumericBool;

    /**
     * secondary source index/CC number
     */
    secSrcIndex: ModulatorSourceIndex;

    /**
     * secondary source curve type
     */
    secSrcCurveType: modulatorCurveTypes;

    /**
     * Creates a new SF2 Modulator
     */
    constructor(
        sourceIndex: ModulatorSourceIndex,
        sourceCurveType: modulatorCurveTypes,
        sourceUsesCC: ModulatorNumericBool,
        sourcePolarity: ModulatorNumericBool,
        sourceDirection: ModulatorNumericBool,
        secSrcIndex: ModulatorSourceIndex,
        secSrcCurveType: modulatorCurveTypes,
        secSrcUsesCC: ModulatorNumericBool,
        secSrcPolarity: ModulatorNumericBool,
        secSrcDirection: ModulatorNumericBool,
        destination: generatorTypes,
        amount: number,
        transformType: modulatorTransformTypes,
        isEffectModulator: boolean = false,
        isDefaultResonantModulator: boolean = false
    ) {
        this.sourcePolarity = sourcePolarity;
        this.sourceDirection = sourceDirection;
        this.sourceUsesCC = sourceUsesCC;
        this.sourceIndex = sourceIndex;
        this.sourceCurveType = sourceCurveType;

        this.secSrcPolarity = secSrcPolarity;
        this.secSrcDirection = secSrcDirection;
        this.secSrcUsesCC = secSrcUsesCC;
        this.secSrcIndex = secSrcIndex;
        this.secSrcCurveType = secSrcCurveType;

        this.destination = destination;
        this.transformAmount = amount;
        this.transformType = transformType;
        this.isEffectModulator = isEffectModulator;
        this.isDefaultResonantModulator = isDefaultResonantModulator;

        if (this.destination > MAX_GENERATOR) {
            this.destination = generatorTypes.INVALID; // flag as invalid (for linked ones)
        }
    }

    /**
     * Copies a modulator
     * @param modulator the modulator to copy
     * @returns the copied modulator
     */
    static copy(modulator: Modulator): Modulator {
        return new Modulator(
            modulator.sourceIndex,
            modulator.sourceCurveType,
            modulator.sourceUsesCC,
            modulator.sourcePolarity,
            modulator.sourceDirection,
            modulator.secSrcIndex,
            modulator.secSrcCurveType,
            modulator.secSrcUsesCC,
            modulator.secSrcPolarity,
            modulator.secSrcDirection,
            modulator.destination,
            modulator.transformAmount,
            modulator.transformType,
            modulator.isEffectModulator,
            modulator.isDefaultResonantModulator
        );
    }

    /**
     * Checks if the pair of modulators is identical (in SF2 terms)
     * @param mod1 modulator 1
     * @param mod2 modulator 2
     * @param checkAmount if the amount should be checked too (SF2 specification says to not check it)
     * @returns if they are identical
     */
    static isIdentical(
        mod1: Modulator,
        mod2: Modulator,
        checkAmount: boolean = false
    ): boolean {
        return (
            mod1.sourceIndex === mod2.sourceIndex &&
            mod1.sourceUsesCC === mod2.sourceUsesCC &&
            mod1.sourcePolarity === mod2.sourcePolarity &&
            mod1.sourceDirection === mod2.sourceDirection &&
            mod1.sourceCurveType === mod2.sourceCurveType &&
            mod1.secSrcIndex === mod2.secSrcIndex &&
            mod1.secSrcUsesCC === mod2.secSrcUsesCC &&
            mod1.secSrcPolarity === mod2.secSrcPolarity &&
            mod1.secSrcDirection === mod2.secSrcDirection &&
            mod1.secSrcCurveType === mod2.secSrcCurveType &&
            mod1.destination === mod2.destination &&
            mod1.transformType === mod2.transformType &&
            (!checkAmount || mod1.transformAmount === mod2.transformAmount)
        );
    }

    // gets the modulator source enum
    getSourceEnum() {
        return getModSourceEnum(
            this.sourceCurveType,
            this.sourcePolarity,
            this.sourceDirection,
            this.sourceUsesCC,
            this.sourceIndex
        );
    }

    // gets the modulator secondary source enum
    getSecSrcEnum() {
        return getModSourceEnum(
            this.secSrcCurveType,
            this.secSrcPolarity,
            this.secSrcDirection,
            this.secSrcUsesCC,
            this.secSrcIndex
        );
    }

    /**
     * Sums transform and create a NEW modulator
     * @param modulator the modulator to sum with
     * @returns the new modulator
     */
    sumTransform(modulator: Modulator): Modulator {
        return new Modulator(
            this.sourceIndex,
            this.sourceCurveType,
            this.sourceUsesCC,
            this.sourcePolarity,
            this.sourceDirection,
            this.secSrcIndex,
            this.secSrcCurveType,
            this.secSrcUsesCC,
            this.secSrcPolarity,
            this.secSrcDirection,
            this.destination,
            this.transformAmount + modulator.transformAmount,
            this.transformType,
            this.isEffectModulator,
            this.isDefaultResonantModulator
        );
    }
}

export class DecodedModulator extends Modulator {
    /**
     * reads an SF2 modulator
     * @param sourceEnum SF2 source enum
     * @param secondarySourceEnum SF2 secondary source enum
     * @param destination destination
     * @param amount amount
     * @param transformType transform type
     */
    constructor(
        sourceEnum: number,
        secondarySourceEnum: number,
        destination: generatorTypes,
        amount: number,
        transformType: number
    ) {
        // decode the source
        const sourcePolarity = ((sourceEnum >> 9) & 1) as ModulatorNumericBool;
        const sourceDirection = ((sourceEnum >> 8) & 1) as ModulatorNumericBool;
        const sourceUsesCC = ((sourceEnum >> 7) & 1) as ModulatorNumericBool;
        const sourceIndex = (sourceEnum & 127) as ModulatorSourceIndex;
        const sourceCurveType = ((sourceEnum >> 10) & 3) as modulatorCurveTypes;

        // decode the secondary source
        const secSrcPolarity = ((secondarySourceEnum >> 9) &
            1) as ModulatorNumericBool;
        const secSrcDirection = ((secondarySourceEnum >> 8) &
            1) as ModulatorNumericBool;
        const secSrcUsesCC = ((secondarySourceEnum >> 7) &
            1) as ModulatorNumericBool;
        const secSrcIndex = (secondarySourceEnum & 127) as ModulatorSourceIndex;
        const secSrcCurveType = ((secondarySourceEnum >> 10) &
            3) as modulatorCurveTypes;

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
            sourceIndex,
            sourceCurveType,
            sourceUsesCC,
            sourcePolarity,
            sourceDirection,
            secSrcIndex,
            secSrcCurveType,
            secSrcUsesCC,
            secSrcPolarity,
            secSrcDirection,
            destination,
            amount,
            transformType as modulatorTransformTypes,
            isEffectModulator,
            isDefaultResonantModulator
        );
    }
}

export const DEFAULT_ATTENUATION_MOD_AMOUNT = 960;
export const DEFAULT_ATTENUATION_MOD_CURVE_TYPE = modulatorCurveTypes.concave;

const soundFontModulators = [
    // vel to attenuation
    new DecodedModulator(
        getModSourceEnum(
            DEFAULT_ATTENUATION_MOD_CURVE_TYPE,
            0,
            1,
            0,
            modulatorSources.noteOnVelocity
        ),
        0x0,
        generatorTypes.initialAttenuation,
        DEFAULT_ATTENUATION_MOD_AMOUNT,
        0
    ),

    // mod wheel to vibrato
    new DecodedModulator(0x0081, 0x0, generatorTypes.vibLfoToPitch, 50, 0),

    // vol to attenuation
    new DecodedModulator(
        getModSourceEnum(
            DEFAULT_ATTENUATION_MOD_CURVE_TYPE,
            0,
            1,
            1,
            midiControllers.mainVolume
        ),
        0x0,
        generatorTypes.initialAttenuation,
        DEFAULT_ATTENUATION_MOD_AMOUNT,
        0
    ),

    // channel pressure to vibrato
    new DecodedModulator(0x000d, 0x0, generatorTypes.vibLfoToPitch, 50, 0),

    // pitch wheel to tuning
    new DecodedModulator(0x020e, 0x0010, generatorTypes.fineTune, 12700, 0),

    // pan to uhh, pan
    // amount is 500 instead of 1000, see #59
    new DecodedModulator(0x028a, 0x0, generatorTypes.pan, 500, 0),

    // expression to attenuation
    new DecodedModulator(
        getModSourceEnum(
            DEFAULT_ATTENUATION_MOD_CURVE_TYPE,
            0,
            1,
            1,
            midiControllers.expressionController
        ),
        0x0,
        generatorTypes.initialAttenuation,
        DEFAULT_ATTENUATION_MOD_AMOUNT,
        0
    ),

    // reverb effects to send
    new DecodedModulator(0x00db, 0x0, generatorTypes.reverbEffectsSend, 200, 0),

    // chorus effects to send
    new DecodedModulator(0x00dd, 0x0, generatorTypes.chorusEffectsSend, 200, 0)
];

const customModulators = [
    // custom modulators heck yeah
    // poly pressure to vibrato
    new DecodedModulator(
        getModSourceEnum(
            modulatorCurveTypes.linear,
            0,
            0,
            0,
            modulatorSources.polyPressure
        ),
        0x0,
        generatorTypes.vibLfoToPitch,
        50,
        0
    ),

    // cc 92 (tremolo) to modLFO volume
    new DecodedModulator(
        getModSourceEnum(
            modulatorCurveTypes.linear,
            0,
            0,
            1,
            midiControllers.tremoloDepth
        ) /*linear forward unipolar cc 92 */,
        0x0, // no controller
        generatorTypes.modLfoToVolume,
        24,
        0
    ),

    // cc 73 (attack time) to volEnv attack
    new DecodedModulator(
        getModSourceEnum(
            modulatorCurveTypes.convex,
            1,
            0,
            1,
            midiControllers.attackTime
        ), // linear forward bipolar cc 72
        0x0, // no controller
        generatorTypes.attackVolEnv,
        6000,
        0
    ),

    // cc 72 (release time) to volEnv release
    new DecodedModulator(
        getModSourceEnum(
            modulatorCurveTypes.linear,
            1,
            0,
            1,
            midiControllers.releaseTime
        ), // linear forward bipolar cc 72
        0x0, // no controller
        generatorTypes.releaseVolEnv,
        3600,
        0
    ),

    // cc 74 (brightness) to filterFc
    new DecodedModulator(
        getModSourceEnum(
            modulatorCurveTypes.linear,
            1,
            0,
            1,
            midiControllers.brightness
        ), // linear forwards bipolar cc 74
        0x0, // no controller
        generatorTypes.initialFilterFc,
        6000,
        0
    ),

    // cc 71 (filter Q) to filter Q (default resonant modulator)
    new DecodedModulator(
        defaultResonantModSource,
        0x0, // no controller
        generatorTypes.initialFilterQ,
        250,
        0
    )
];

export const defaultModulators: Modulator[] =
    soundFontModulators.concat(customModulators);
