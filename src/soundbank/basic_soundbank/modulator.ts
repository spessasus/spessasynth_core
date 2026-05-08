import {
    type GeneratorType,
    GeneratorTypes,
    MAX_GENERATOR
} from "./generator_types";
import type { ModulatorSourceIndex } from "../types";
import {
    ModulatorControllerSources,
    type ModulatorCurveType,
    ModulatorCurveTypes,
    type ModulatorTransformType
} from "../enums";
import { MIDIControllers } from "../../midi/enums";
import { writeWord } from "../../utils/byte_functions/little_endian";
import type { IndexedByteArray } from "../../utils/indexed_array";
import { ModulatorSource } from "./modulator_source";
import type { SoundFontWriteIndexes } from "../soundfont/write/types";

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

export const DEFAULT_RESONANT_MOD_SOURCE = getModSourceEnum(
    ModulatorCurveTypes.linear,
    true,
    false,
    true,
    MIDIControllers.filterResonance
); // Linear forwards bipolar cc 74

export class Modulator {
    /**
     * The generator destination of this modulator.
     */
    public destination: GeneratorType = GeneratorTypes.initialAttenuation;

    /**
     * The transform amount for this modulator.
     */
    public transformAmount = 0;

    /**
     * The transform type for this modulator.
     */
    public transformType: ModulatorTransformType = 0;

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
        destination: GeneratorType = GeneratorTypes.invalid,
        amount = 0,
        transformType: ModulatorTransformType = 0
    ) {
        this.primarySource = primarySource;
        this.secondarySource = secondarySource;

        this.destination = destination;
        this.transformAmount = amount;
        this.transformType = transformType;
    }

    private get destinationName() {
        return Object.keys(GeneratorTypes).find(
            (k) =>
                GeneratorTypes[k as keyof typeof GeneratorTypes] ===
                this.destination
        );
    }

    /**
     * Checks if the pair of modulators is identical (in SF2 terms)
     * @param mod1 modulator 1
     * @param mod2 modulator 2
     * @param checkAmount if the amount should be checked too.
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

    /**
     * Copies a modulator.
     * @param mod The modulator to copy.
     * @returns The copied modulator.
     */
    public static copyFrom(mod: Modulator) {
        return new Modulator(
            ModulatorSource.copyFrom(mod.primarySource),
            ModulatorSource.copyFrom(mod.secondarySource),
            mod.destination,
            mod.transformAmount,
            mod.transformType
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

    public write(modData: IndexedByteArray, indexes?: SoundFontWriteIndexes) {
        writeWord(modData, this.primarySource.toSourceEnum());
        writeWord(modData, this.destination);
        writeWord(modData, this.transformAmount);
        writeWord(modData, this.secondarySource.toSourceEnum());
        writeWord(modData, this.transformType);
        if (!indexes) {
            return;
        }
        indexes.mod++;
    }

    /**
     * Sums transform and create a NEW modulator
     * @param modulator the modulator to sum with
     * @returns the new modulator
     */
    public sumTransform(modulator: Modulator): Modulator {
        const m = Modulator.copyFrom(this);
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
        super(
            ModulatorSource.fromSourceEnum(sourceEnum),
            ModulatorSource.fromSourceEnum(secondarySourceEnum),
            destination,
            amount,
            transformType as ModulatorTransformType
        );

        if (this.destination > MAX_GENERATOR) {
            this.destination = GeneratorTypes.invalid; // Flag as invalid (for linked ones)
        }
    }
}

const defaultSoundFont2Modulators = [
    // Vel to attenuation
    new DecodedModulator(
        getModSourceEnum(
            ModulatorCurveTypes.concave,
            false,
            true,
            false,
            ModulatorControllerSources.noteOnVelocity
        ),
        0x0,
        GeneratorTypes.initialAttenuation,
        960,
        0
    ),

    // Mod wheel to vibrato
    new DecodedModulator(0x00_81, 0x0, GeneratorTypes.vibLfoToPitch, 50, 0),

    // Vol to attenuation
    new DecodedModulator(
        getModSourceEnum(
            ModulatorCurveTypes.concave,
            false,
            true,
            true,
            MIDIControllers.mainVolume
        ),
        0x0,
        GeneratorTypes.initialAttenuation,
        960,
        0
    ),

    // Channel pressure to vibrato
    new DecodedModulator(0x00_0d, 0x0, GeneratorTypes.vibLfoToPitch, 50, 0),

    // Pitch wheel to tuning
    new DecodedModulator(0x02_0e, 0x00_10, GeneratorTypes.fineTune, 12_700, 0),

    // Pan to uhh, pan
    // Amount is 500 instead of 1000, see #59
    new DecodedModulator(0x02_8a, 0x0, GeneratorTypes.pan, 500, 0),

    // Expression to attenuation
    new DecodedModulator(
        getModSourceEnum(
            ModulatorCurveTypes.concave,
            false,
            true,
            true,
            MIDIControllers.expressionController
        ),
        0x0,
        GeneratorTypes.initialAttenuation,
        960,
        0
    ),

    // Reverb effects to send
    new DecodedModulator(
        0x00_db,
        0x0,
        GeneratorTypes.reverbEffectsSend,
        200,
        0
    ),

    // Chorus effects to send
    new DecodedModulator(0x00_dd, 0x0, GeneratorTypes.chorusEffectsSend, 200, 0)
];

const defaultSpessaSynthModulators = [
    // Custom modulators heck yeah
    // Cc 73 (attack time) to volEnv attack
    new DecodedModulator(
        getModSourceEnum(
            ModulatorCurveTypes.convex,
            true,
            false,
            true,
            MIDIControllers.attackTime
        ), // Linear forward bipolar cc 72
        0x0, // No controller
        GeneratorTypes.attackVolEnv,
        6000,
        0
    ),

    // Cc 72 (release time) to volEnv release
    new DecodedModulator(
        getModSourceEnum(
            ModulatorCurveTypes.linear,
            true,
            false,
            true,
            MIDIControllers.releaseTime
        ), // Linear forward bipolar cc 72
        0x0, // No controller
        GeneratorTypes.releaseVolEnv,
        3600,
        0
    ),

    // Cc 75 (decay time) to vol env decay
    new DecodedModulator(
        getModSourceEnum(
            ModulatorCurveTypes.linear,
            true,
            false,
            true,
            MIDIControllers.decayTime
        ), // Linear forward bipolar cc 75
        0x0, // No controller
        GeneratorTypes.decayVolEnv,
        3600,
        0
    ),

    // Cc 74 (brightness) to filterFc
    new DecodedModulator(
        getModSourceEnum(
            ModulatorCurveTypes.linear,
            true,
            false,
            true,
            MIDIControllers.brightness
        ), // Linear forwards bipolar cc 74
        0x0, // No controller
        GeneratorTypes.initialFilterFc,
        9600,
        0
    ),

    // Cc 71 (filter Q) to filter Q (default resonant modulator)
    new DecodedModulator(
        DEFAULT_RESONANT_MOD_SOURCE,
        0x0, // No controller
        GeneratorTypes.initialFilterQ,
        200,
        0
    ),

    // Cc 67 (soft pedal) to attenuation
    new DecodedModulator(
        getModSourceEnum(
            ModulatorCurveTypes.switch,
            false,
            false,
            true,
            MIDIControllers.softPedal
        ), // Switch unipolar positive 67
        0x0, // No controller
        GeneratorTypes.initialAttenuation,
        50,
        0
    ),
    // Cc 67 (soft pedal) to filter fc
    new DecodedModulator(
        getModSourceEnum(
            ModulatorCurveTypes.switch,
            false,
            false,
            true,
            MIDIControllers.softPedal
        ), // Switch unipolar positive 67
        0x0, // No controller
        GeneratorTypes.initialFilterFc,
        -2400,
        0
    ),

    // Cc 8 (balance) to pan
    new DecodedModulator(
        getModSourceEnum(
            ModulatorCurveTypes.linear,
            true,
            false,
            true,
            MIDIControllers.balance
        ), // Linear bipolar positive 8
        0x0, // No controller
        GeneratorTypes.pan,
        500,
        0
    )
];

export const SPESSASYNTH_DEFAULT_MODULATORS: Modulator[] = [
    ...defaultSoundFont2Modulators,
    ...defaultSpessaSynthModulators
];
