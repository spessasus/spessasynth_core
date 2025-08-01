import {
    generatorLimits,
    type GeneratorType,
    generatorTypes
} from "./generator_types";

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
}

/**
 * generator.ts
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

    // limits are applied in the compute_modulator function
    // clamp to prevent short from overflowing
    // testcase: Sega Genesis soundfont (spessasynth/#169) adds 20,999 and the default 13,500 to initialFilterFc
    // which is more than 32k
    return Math.max(-32767, Math.min(32767, instValue + presetValue));
}
