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
    public generatorType: GeneratorType = generatorTypes.INVALID;
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
    public constructor(
        type: GeneratorType = generatorTypes.INVALID,
        value = 0,
        validate = true
    ) {
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

/**
 * Generator.ts
 * purpose: contains enums for generators,
 * and their limits parses reads soundfont generators, sums them and applies limits
 */
/**
 * Adds and clamps generators
 */
export function addAndClampGenerator(
    generatorType: number,
    presetGens: Generator[],
    instrumentGens: Generator[]
) {
    const limits = generatorLimits[generatorType] || {
        min: 0,
        max: 32768,
        def: 0
    };
    const presetGen = presetGens.find((g) => g.generatorType === generatorType);
    let presetValue = 0;
    if (presetGen) {
        presetValue = presetGen.generatorValue;
    }

    const instrGen = instrumentGens.find(
        (g) => g.generatorType === generatorType
    );
    let instValue = limits.def;
    if (instrGen) {
        instValue = instrGen.generatorValue;
    }

    // Limits are applied in the compute_modulator function
    // Clamp to prevent short from overflowing
    // Testcase: Sega Genesis soundfont (spessasynth/#169) adds 20,999 and the default 13,500 to initialFilterFc
    // Which is more than 32k
    return Math.max(-32767, Math.min(32767, instValue + presetValue));
}
