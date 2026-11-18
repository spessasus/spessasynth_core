import type { GeneratorType } from "../../../soundbank/basic_soundbank/generator_types";
import { Modulator } from "../../../soundbank/basic_soundbank/modulator";
import type { ModulatorSource } from "../../../soundbank/basic_soundbank/modulator_source";
import type { ModulatorTransformType } from "../../../soundbank/enums";

export class VoiceModulator extends Modulator {
    private constructor(
        s1: ModulatorSource,
        s2: ModulatorSource,
        destination: GeneratorType,
        amount: number,
        transformType: ModulatorTransformType
    ) {
        super(s1, s2, destination, amount, transformType);
    }

    public static fromData(
        s1: ModulatorSource,
        s2: ModulatorSource,
        destination: GeneratorType,
        amount: number,
        transformType: ModulatorTransformType
    ) {
        return new VoiceModulator(s1, s2, destination, amount, transformType);
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
