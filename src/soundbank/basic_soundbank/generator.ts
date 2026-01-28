import {
    generatorLimits,
    type GeneratorType,
    generatorTypes
} from "./generator_types";
import type { IndexedByteArray } from "../../utils/indexed_array";
import { writeWord } from "../../utils/byte_functions/little_endian";

export const GEN_BYTE_SIZE = 4;

export class Generator {
    /**
     * The generator's SF2 type.
     */
    public generatorType: GeneratorType;
    /**
     * The generator's 16-bit value.
     */
    public generatorValue = 0;

    /**
     * Constructs a new generator
     * @param type generator type
     * @param value generator value
     * @param validate if the limits should be validated
     */
    public constructor(type: GeneratorType, value: number, validate = true) {
        this.generatorType = type;
        if (value === undefined) {
            throw new Error("No value provided.");
        }
        this.generatorValue = Math.round(value);
        if (validate) {
            const lim = generatorLimits[type];

            if (lim !== undefined) {
                this.generatorValue = Math.max(
                    lim.min,
                    Math.min(lim.max, this.generatorValue)
                );
            }
        }
    }

    public write(genData: IndexedByteArray) {
        // Name is deceptive, it works on negatives
        writeWord(genData, this.generatorType);
        writeWord(genData, this.generatorValue);
    }

    public toString() {
        return `${Object.keys(generatorTypes).find((k) => generatorTypes[k as keyof typeof generatorTypes] === this.generatorType)}: ${this.generatorValue}`;
    }
}
