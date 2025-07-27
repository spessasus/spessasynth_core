import { Modulator } from "../../../soundbank/basic_soundbank/modulator";
import { modulatorCurveTypes, type ModulatorSourceEnum, modulatorSources } from "../../../soundbank/enums";
import { NON_CC_INDEX_OFFSET } from "./controller_tables";
import type { GeneratorType } from "../../../soundbank/basic_soundbank/generator_types";

/**
 * A class for dynamic modulators
 * that are assigned for more complex system exclusive messages
 */
export class DynamicModulatorSystem {
    /**
     * the current dynamic modulator list.
     */
    modulatorList: { mod: Modulator; id: string }[] = [];

    resetModulators() {
        this.modulatorList = [];
    }

    _getModulatorId(
        source: number,
        destination: GeneratorType,
        isBipolar: boolean,
        isNegative: boolean
    ) {
        return `${source}-${destination}-${isBipolar}-${isNegative}`;
    }

    /**
     * @param source Like in midiControllers: values below NON_CC_INDEX_OFFSET are CCs,
     * above are regular modulator sources.
     * @param destination The generator type to modulate.
     * @param amount The amount of modulation to apply.
     * @param isBipolar If true, the modulation is bipolar (ranges from -1 to 1 instead of from 0 to 1).
     * @param isNegative If true, the modulation is negative (goes from 1 to 0 instead of from 0 to 1).
     */
    setModulator(
        source: ModulatorSourceEnum,
        destination: GeneratorType,
        amount: number,
        isBipolar: boolean = false,
        isNegative: boolean = false
    ) {
        const id = this._getModulatorId(
            source,
            destination,
            isBipolar,
            isNegative
        );
        if (amount === 0) {
            this._deleteModulator(id);
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
                srcNum = source as ModulatorSourceEnum;
                isCC = true;
            }
            const modulator = new Modulator(
                srcNum,
                modulatorCurveTypes.linear,
                isCC ? 1 : 0,
                isBipolar ? 1 : 0,
                0,
                modulatorSources.noController,
                modulatorCurveTypes.linear,
                0,
                0,
                0,
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

    private _deleteModulator(id: string) {
        this.modulatorList = this.modulatorList.filter((m) => m.id !== id);
    }
}
