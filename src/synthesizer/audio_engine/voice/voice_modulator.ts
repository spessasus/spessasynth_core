import {
    type GeneratorType,
    GeneratorTypes
} from "../../../soundbank/basic_soundbank/generator_types";
import {
    DEFAULT_RESONANT_MOD_SOURCE,
    Modulator
} from "../../../soundbank/basic_soundbank/modulator";
import type { ModulatorSource } from "../../../soundbank/basic_soundbank/modulator_source";
import type { ModulatorTransformType } from "../../../soundbank/enums";
import { MIDIControllers } from "../../../midi/enums";

export class VoiceModulator extends Modulator {
    /**
     * Indicates if the given modulator is chorus or reverb effects modulator.
     * This is done to simulate BASSMIDI effects behavior:
     * - defaults to 1000 transform amount rather than 200
     * - values up to 1000 are multiplied by 5 (200 * 5 = 1000) and capped at 1000
     * - values above 1000 are copied directly
     * - still can be disabled if the soundfont has its own modulator curve
     * - this fixes the very low amount of reverb by default and doesn't break soundfonts
     */
    public readonly isEffectModulator;

    /**
     * The default resonant modulator does not affect the filter gain.
     * Neither XG nor GS responded to cc #71 in that way.
     */
    public readonly isDefaultResonantModulator;

    /**
     * If this is a modulation wheel modulator (for modulation depth range).
     */
    public readonly isModWheelModulator;

    private constructor(
        s1: ModulatorSource,
        s2: ModulatorSource,
        destination: GeneratorType,
        amount: number,
        transformType: ModulatorTransformType,
        isEffectModulator: boolean,
        isDefaultResonantModulator: boolean,
        isModWheelModulator: boolean
    ) {
        super(s1, s2, destination, amount, transformType);
        this.isEffectModulator = isEffectModulator;
        this.isDefaultResonantModulator = isDefaultResonantModulator;
        this.isModWheelModulator = isModWheelModulator;
    }

    public static fromData(
        s1: ModulatorSource,
        s2: ModulatorSource,
        destination: GeneratorType,
        amount: number,
        transformType: ModulatorTransformType
    ) {
        const s1Enum = s1.toSourceEnum();
        const s2Enum = s2.toSourceEnum();
        const isEffectModulator =
            (s1Enum === 0x00_db || s1Enum === 0x00_dd) &&
            s2Enum === 0x0 &&
            (destination === GeneratorTypes.reverbEffectsSend ||
                destination === GeneratorTypes.chorusEffectsSend);

        const isDefaultResonantModulator =
            s1Enum === DEFAULT_RESONANT_MOD_SOURCE &&
            s2Enum === 0x0 &&
            destination === GeneratorTypes.initialFilterQ;

        const isModWheelModulator =
            ((s1.isCC && s1.index === MIDIControllers.modulationWheel) ||
                (s2.isCC && s2.index === MIDIControllers.modulationWheel)) &&
            (destination === GeneratorTypes.modLfoToPitch ||
                destination === GeneratorTypes.vibLfoToPitch);

        return new VoiceModulator(
            s1,
            s2,
            destination,
            amount,
            transformType,
            isEffectModulator,
            isDefaultResonantModulator,
            isModWheelModulator
        );
    }

    public static fromModulator(mod: Modulator) {
        return this.fromData(
            mod.primarySource,
            mod.secondarySource,
            mod.destination,
            mod.transformAmount,
            mod.transformType
        );
    }
}
