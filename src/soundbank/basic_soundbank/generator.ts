import {
    GeneratorLimits,
    type GeneratorType,
    GeneratorTypes
} from "./generator_types";
import type { IndexedByteArray } from "../../utils/indexed_array";
import { writeWord } from "../../utils/byte_functions/little_endian";

export const GEN_BYTE_SIZE = 4;

export class Generator {
    /**
     * The generator's SF2 type.
     */
    public type: GeneratorType;
    /**
     * The generator's 16-bit value.
     */
    public value = 0;

    /**
     * Constructs a new generator
     * @param type generator type
     * @param value generator value
     * @param validate if the limits should be validated and clamped.
     */
    public constructor(type: GeneratorType, value: number, validate = true) {
        this.type = type;
        if (value === undefined) throw new Error("No value provided.");

        this.value = Math.round(value);
        if (validate) {
            const lim = GeneratorLimits[type];

            if (lim !== undefined)
                this.value = Math.max(lim.min, Math.min(lim.max, this.value));
        }
    }

    public write(genData: IndexedByteArray) {
        // Name is deceptive, it works on negatives
        writeWord(genData, this.type);
        writeWord(genData, this.value);
    }

    public toString() {
        return `${Object.keys(GeneratorTypes).find((k) => GeneratorTypes[k as keyof typeof GeneratorTypes] === this.type)}: ${this.value}`;
    }
}
