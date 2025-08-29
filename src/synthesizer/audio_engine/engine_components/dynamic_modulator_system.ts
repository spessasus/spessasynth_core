import { Modulator } from "../../../soundbank/basic_soundbank/modulator";
import { modulatorCurveTypes, type ModulatorSourceEnum } from "../../../soundbank/enums";
import { NON_CC_INDEX_OFFSET } from "./controller_tables";
import type { GeneratorType } from "../../../soundbank/basic_soundbank/generator_types";
import { ModulatorSource } from "../../../soundbank/basic_soundbank/modulator_source";

/**
 * A class for dynamic modulators
 * that are assigned for more complex system exclusive messages
 */
export class DynamicModulatorSystem {
    /**
     * The current dynamic modulator list.
     */
    public modulatorList: { mod: Modulator; id: string }[] = [];

    public resetModulators() {
        this.modulatorList = [];
    }

    /**
     * @param source Like in midiControllers: values below NON_CC_INDEX_OFFSET are CCs,
     * above are regular modulator sources.
     * @param destination The generator type to modulate.
     * @param amount The amount of modulation to apply.
     * @param isBipolar If true, the modulation is bipolar (ranges from -1 to 1 instead of from 0 to 1).
     * @param isNegative If true, the modulation is negative (goes from 1 to 0 instead of from 0 to 1).
     */
    public setModulator(
        source: ModulatorSourceEnum,
        destination: GeneratorType,
        amount: number,
        isBipolar = false,
        isNegative = false
    ) {
        const id = this.getModulatorID(
            source,
            destination,
            isBipolar,
            isNegative
        );
        if (amount === 0) {
            this.deleteModulator(id);
        }
        const mod = this.modulatorList.find((m) => m.id === id);
        if (mod) {
            mod.mod.transformAmount = amount;
        } else {
            let srcNum: ModulatorSourceEnum, isCC: boolean;
            if (source >= NON_CC_INDEX_OFFSET) {
                srcNum = (source - NON_CC_INDEX_OFFSET) as ModulatorSourceEnum;
                isCC = false;
            } else {
                srcNum = source;
                isCC = true;
            }
            const modulator = new Modulator(
                new ModulatorSource(
                    srcNum,
                    modulatorCurveTypes.linear,
                    isCC,
                    isBipolar
                ),
                new ModulatorSource(),
                destination,
                amount,
                0
            );
            this.modulatorList.push({
                mod: modulator,
                id: id
            });
        }
    }

    private getModulatorID(
        source: number,
        destination: GeneratorType,
        isBipolar: boolean,
        isNegative: boolean
    ) {
        return `${source}-${destination}-${isBipolar}-${isNegative}`;
    }

    private deleteModulator(id: string) {
        this.modulatorList = this.modulatorList.filter((m) => m.id !== id);
    }
}
