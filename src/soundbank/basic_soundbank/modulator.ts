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
import {
    writeDword,
    writeWord
} from "../../utils/byte_functions/little_endian";
import type { IndexedByteArray } from "../../utils/indexed_array";
import { ModulatorSource } from "./modulator_source";
import type { SoundFontWriteIndexes } from "../soundfont/write/types";
import { CustomCurve, type CustomCurveUser } from "./custom_curve";
import { type ModulatorCurve, SOURCE_VALUE_7_BIT } from "./modulator_curve";

/**
 * Modulators.ts
 * purpose: parses soundfont modulators and the source enums, also includes the default modulators list
 **/

export const MOD_BYTE_SIZE = 10;
/**
 * The size of an SFe extended modulator record (xdta pmod/imod and XMOD).
 */
export const XMOD_BYTE_SIZE = 16;

/**
 * Bit 15 of the transform enumerator in an SFe file: the modulator has an extended record.
 * The transform itself is the lower 15 bits.
 */
export const MODULATOR_EXTENDED_FLAG = 0x80_00;

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
); // Linear forwards bipolar cc 71

/**
 * The amount source of the default CC 71 modulator, a switch on CC 71, so only values above 64 raise the resonance.
 * @internal
 */
export const DEFAULT_RESONANT_MOD_AMOUNT_SOURCE = getModSourceEnum(
    ModulatorCurveTypes.switch,
    false,
    false,
    true,
    MIDIControllers.filterResonance
); // Switch unipolar positive cc 71

/**
 * This class represents a single modulator (map from a source to a given synthesis parameter).
 *
 * > **Tip**
 * >
 * > Consider reading [Modulator Information](../../../docs/extra/modulator-information.md).
 *
 * @group Sound Banks.Modulators
 */
export class Modulator {
    /**
     * The destination generator for this modulator.
     * This is the target parameter that will be changed.
     */
    public destination: GeneratorType;

    /**
     * The transform amount for this modulator.
     * This is the multiplier of the transformation.
     */
    public transformAmount = 0;

    /**
     * The transform type for this modulator.
     * Usually no operation is performed.
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
     * Creates a new modulator.
     * @param primarySource An optional primary source.
     * @param secondarySource An optional secondary source.
     * @param destination An optional destination can be set here.
     * @param amount An optional amount.
     * @param transformType An optional transform type.
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

    /**
     * If any of the sources uses a custom curve (SFe only).
     * @internal
     */
    public get usesCustomCurve() {
        return (
            this.primarySource.curveType === ModulatorCurveTypes.custom ||
            this.secondarySource.curveType === ModulatorCurveTypes.custom
        );
    }

    /**
     * If a source uses a custom curve but has none set. Such a modulator is not written.
     * @internal
     */
    public get isMissingCurve() {
        return (
            (this.primarySource.curveType === ModulatorCurveTypes.custom &&
                !(this.primarySource.curve instanceof CustomCurve)) ||
            (this.secondarySource.curveType === ModulatorCurveTypes.custom &&
                !(this.secondarySource.curve instanceof CustomCurve))
        );
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
     * @param mod1 Modulator 1 to compare.
     * @param mod2 Modulator 2 to compare.
     * @param checkAmount If the amount should be checked too. SF2 specification compares everything except amount.
     * @returns True if the two modulators are identical.
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
     * Of identical modulators in one list, only the last one applies and the earlier ones are ignored
     * (SF2 section 7.4, SFe 4.0, sections 7.3 and 7.4). Identity is the one of {@link isIdentical}.
     * @param list The modulators of one zone or of the default list.
     * @returns The list without the superseded modulators, in their original order.
     * @internal
     */
    public static getLatestOnly(list: readonly Modulator[]) {
        return list.filter(
            (m, i) =>
                !list.some(
                    (later, j) => j > i && Modulator.isIdentical(m, later)
                )
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

    /**
     * Throws if any of the modulators can't be added to a zone or to the default modulators:
     * one that already belongs somewhere, or the same modulator twice.
     * Called before a list changes, so a failed call leaves it as it was.
     * @param modulators The modulators about to be added.
     * @param kept Modulators that stay in the list being changed, which may be among them.
     * @internal
     */
    public static checkAddable(
        modulators: readonly Modulator[],
        kept: readonly Modulator[] = []
    ) {
        const seen = new Set<Modulator>();
        for (const m of modulators) {
            if (Object.isFrozen(m)) {
                throw new Error(
                    "The standard default modulators are for comparing only. Add copies of them instead, and the custom curves of the copies to the sound bank."
                );
            }
            if (
                seen.has(m) ||
                (!kept.includes(m) &&
                    (m.primarySource.user || m.secondarySource.user))
            ) {
                throw new Error(ALREADY_LINKED);
            }
            seen.add(m);
        }
    }

    /**
     * Links the custom curves of both sources to the element that holds this modulator.
     * @param user The instrument, preset or sound bank (default modulators).
     * @internal
     */
    public linkCurves(user: CustomCurveUser) {
        if (this.primarySource.user || this.secondarySource.user) {
            throw new Error(ALREADY_LINKED);
        }
        for (const source of [this.primarySource, this.secondarySource]) {
            source.user = user;
            if (source.curve instanceof CustomCurve) source.curve.linkTo(user);
        }
    }

    /**
     * Unlinks the custom curves of both sources, when the modulator leaves its zone or list.
     * @internal
     */
    public unlinkCurves() {
        for (const source of [this.primarySource, this.secondarySource]) {
            const user = source.user;
            if (!user) continue;
            if (source.curve instanceof CustomCurve)
                source.curve.unlinkFrom(user);
            source.user = undefined;
        }
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
     * @internal
     * @param modData
     * @param indexes
     * @param sfe If this is an SFe file, where a modulator that uses a custom curve has the extended flag.
     */
    public write(
        modData: IndexedByteArray,
        indexes?: SoundFontWriteIndexes,
        sfe = false
    ) {
        writeWord(modData, this.primarySource.toSourceEnum());
        writeWord(modData, this.destination);
        writeWord(modData, this.transformAmount);
        writeWord(modData, this.secondarySource.toSourceEnum());
        writeWord(
            modData,
            sfe && this.usesCustomCurve
                ? this.transformType | MODULATOR_EXTENDED_FLAG
                : this.transformType
        );
        if (!indexes) {
            return;
        }
        indexes.mod++;
    }

    /**
     * Writes the SFe extended record of this modulator.
     * @param data the output
     * @param curveIndex returns the index of a curve in the CURV chunk
     * @internal
     */
    public writeExtended(
        data: IndexedByteArray,
        curveIndex: (curve: ModulatorCurve) => number
    ) {
        const p = this.primarySource;
        const s = this.secondarySource;
        writeDword(
            data,
            p.curveType === ModulatorCurveTypes.custom ? curveIndex(p.curve) : 0
        );
        writeDword(
            data,
            s.curveType === ModulatorCurveTypes.custom ? curveIndex(s.curve) : 0
        );
        // The 8 reserved bytes
        writeDword(data, 0);
        writeDword(data, 0);
    }

    /**
     * Sums transform and create a NEW modulator
     * @param modulator the modulator to sum with
     * @returns the new modulator
     * @internal
     */
    public sumTransform(modulator: Modulator): Modulator {
        const m = Modulator.copyFrom(this);
        m.transformAmount += modulator.transformAmount;
        return m;
    }
}

const GENERAL_SOURCES = new Set<number>([
    ModulatorControllerSources.noController,
    ModulatorControllerSources.noteOnVelocity,
    ModulatorControllerSources.noteOnKeyNum,
    ModulatorControllerSources.polyPressure,
    ModulatorControllerSources.channelPressure,
    ModulatorControllerSources.pitchWheel,
    ModulatorControllerSources.pitchWheelRange,
    ModulatorControllerSources.modulationDepthRange
]);

/**
 * If a reader ignores a modulator with this source. SF2 8.2.1 calls these controllers illegal:
 * bank select, data entry, the RPN and NRPN numbers and the channel mode messages.
 * The general controllers it does not list are reserved, the link included.
 * @param source The source to check.
 * @internal
 */
export const isIllegalSource = (source: ModulatorSource) =>
    source.isCC
        ? source.index === 0 ||
          source.index === 6 ||
          source.index === 32 ||
          source.index === 38 ||
          (source.index >= 98 && source.index <= 101) ||
          source.index >= 120
        : !GENERAL_SOURCES.has(source.index);

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

        // Linked modulators are reserved: a link source, or a destination with bit 15 set, is ignored.
        // So is a modulator with an illegal or reserved controller as a source
        if (
            this.destination > MAX_GENERATOR ||
            isIllegalSource(this.primarySource) ||
            isIllegalSource(this.secondarySource)
        ) {
            this.destination = GeneratorTypes.invalid;
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

    // Mod wheel to vibrato, scaled by the modulation depth range (RPN 5)
    // 1600 is 50 cents at the default range, the source is full at 16 semitones
    new DecodedModulator(
        0x00_81,
        ModulatorControllerSources.modulationDepthRange,
        GeneratorTypes.vibLfoToPitch,
        1600,
        0
    ),

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
            MIDIControllers.expression
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
        1000,
        0
    ),

    // Chorus effects to send
    new DecodedModulator(
        0x00_dd,
        0x0,
        GeneratorTypes.chorusEffectsSend,
        1000,
        0
    )
];

// The points are (CC value, y), each CC value at its source value (SFe 4.0, section 7.3)
const getCurve = (name: string, points: [number, number][]) =>
    new CustomCurve(
        points.map(([cc, y]) => ({ x: SOURCE_VALUE_7_BIT[cc], y })),
        name
    );

const ATTACK_TIME_CURVE = getCurve("Attack time", [
    [0, 0],
    [64, 8192],
    [69, 8192],
    [70, 8260],
    [72, 8453],
    [74, 8661],
    [77, 8988],
    [81, 9444],
    [87, 10_149],
    [95, 11_112],
    [105, 12_337],
    [119, 14_075],
    [127, 15_074]
]);

const DECAY_RELEASE_TIME_CURVE = getCurve("Decay and release time", [
    [0, 0],
    [64, 8192],
    [65, 8263],
    [66, 8290],
    [67, 8297],
    [110, 8297],
    [111, 8309],
    [113, 8387],
    [114, 8434],
    [115, 8488],
    [116, 8548],
    [117, 8618],
    [118, 8697],
    [119, 8789],
    [120, 8896],
    [121, 9023],
    [122, 9176],
    [123, 9363],
    [124, 9601],
    [125, 9919],
    [126, 10_384],
    [127, 11_205]
]);

const envelopeTime = (
    cc: number,
    curve: CustomCurve,
    destination: GeneratorType
) =>
    new Modulator(
        new ModulatorSource(cc as ModulatorSourceIndex, curve, true, true),
        new ModulatorSource(),
        destination,
        9600
    );

const defaultSpessaSynthModulators = [
    // Custom modulators heck yeah
    // Attack time to attackVolEnv
    envelopeTime(
        MIDIControllers.attackTime,
        ATTACK_TIME_CURVE,
        GeneratorTypes.attackVolEnv
    ),
    // Decay time to decayVolEnv
    envelopeTime(
        MIDIControllers.decayTime,
        DECAY_RELEASE_TIME_CURVE,
        GeneratorTypes.decayVolEnv
    ),
    // Release time to releaseVolEnv
    envelopeTime(
        MIDIControllers.releaseTime,
        DECAY_RELEASE_TIME_CURVE,
        GeneratorTypes.releaseVolEnv
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
        4800,
        0
    ),

    // Cc 71 (filter Q) to the resonance offset (default resonant modulator).
    // FilterQOffset changes the Q without the gain reduction, so the part keeps its level, as on GS and XG.
    // The switch keeps values below 64 from lowering the resonance (SFe 4.0, section 7.3)
    new DecodedModulator(
        DEFAULT_RESONANT_MOD_SOURCE,
        DEFAULT_RESONANT_MOD_AMOUNT_SOURCE,
        GeneratorTypes.filterQOffset,
        250,
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
        -1200,
        0
    ),
    // CC 94 (variation depth) to the variation send
    new DecodedModulator(
        0x00_de,
        0x0,
        GeneratorTypes.variationEffectsSend,
        1000,
        0
    )
];

const ALREADY_LINKED =
    "This modulator already belongs to a zone or to the default modulators. Add a copy instead.";

/**
 * The default modulators of a new sound bank: the SFe default modulators (section 7.3 of the SFe specification).
 *
 * > **Warning**
 * >
 * > This list is for reading and comparing only. Its modulators are frozen and can't be added to a bank or a zone.
 * > A new bank already holds its own copies, and {@link BasicSoundBank.resetDefaultModulators} brings them back.
 * > A copy made with {@link Modulator.copyFrom} has its own copies of the custom curves,
 * > which have to be added to the sound bank with {@link BasicSoundBank.addCustomCurves}.
 *
 * @group Sound Banks.Modulators
 */
export const SPESSASYNTH_DEFAULT_MODULATORS: readonly Modulator[] =
    Object.freeze([
        ...defaultSoundFont2Modulators,
        ...defaultSpessaSynthModulators
    ]);
for (const m of SPESSASYNTH_DEFAULT_MODULATORS) {
    // The curves too: editing one would change every bank made afterwards
    Object.freeze(m.primarySource.curve);
    Object.freeze(m.secondarySource.curve);
    Object.freeze(m.primarySource);
    Object.freeze(m.secondarySource);
    Object.freeze(m);
}

/**
 * Copies modulators for another bank, with one new copy of every custom curve they use.
 * @param modulators The modulators to copy.
 * @returns the copies and their curves.
 * @internal
 */
export function copyWithOwnCurves(modulators: readonly Modulator[]) {
    const curves = new Map<ModulatorCurve, CustomCurve>();
    // The copies of the same curve share one new curve
    const copySource = (source: ModulatorSource) => {
        const curve = source.curve;
        if (!(curve instanceof CustomCurve))
            return ModulatorSource.copyFrom(source);
        let own = curves.get(curve);
        if (!own) {
            own = new CustomCurve(curve.points, curve.name);
            curves.set(curve, own);
        }
        return new ModulatorSource(
            source.index,
            own,
            source.isCC,
            source.isBipolar,
            source.isNegative
        );
    };
    const copies = modulators.map(
        (m) =>
            new Modulator(
                copySource(m.primarySource),
                copySource(m.secondarySource),
                m.destination,
                m.transformAmount,
                m.transformType
            )
    );
    return { modulators: copies, curves: [...curves.values()] };
}

/**
 * Copies {@link SPESSASYNTH_DEFAULT_MODULATORS} for a bank, with their own copies of the custom curves.
 * @returns the modulators and the curves they use.
 * @internal
 */
export function copyDefaultModulators() {
    return copyWithOwnCurves(SPESSASYNTH_DEFAULT_MODULATORS);
}
