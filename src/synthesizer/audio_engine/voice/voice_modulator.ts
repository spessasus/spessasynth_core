import {
    type GeneratorType,
    GeneratorTypes
} from "../../../soundbank/basic_soundbank/generator_types";
import { Modulator } from "../../../soundbank/basic_soundbank/modulator";
import type { ModulatorSource } from "../../../soundbank/basic_soundbank/modulator_source";
import type { ModulatorTransformType } from "../../../soundbank/enums";
import { MIDIControllers } from "../../../midi/enums";

export class VoiceModulator extends Modulator {
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
        isModWheelModulator: boolean
    ) {
        super(s1, s2, destination, amount, transformType);
        this.isModWheelModulator = isModWheelModulator;
    }

    public static fromData(
        s1: ModulatorSource,
        s2: ModulatorSource,
        destination: GeneratorType,
        amount: number,
        transformType: ModulatorTransformType
    ) {
        const isModWheelModulator =
            (s1.isController(MIDIControllers.modulationWheel) ||
                s2.isController(MIDIControllers.modulationWheel)) &&
            (destination === GeneratorTypes.modLfoToPitch ||
                destination === GeneratorTypes.vibLfoToPitch);

        return new VoiceModulator(
            s1,
            s2,
            destination,
            amount,
            transformType,
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
