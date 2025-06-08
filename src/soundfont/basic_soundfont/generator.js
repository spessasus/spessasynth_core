import { generatorLimits, generatorTypes } from "./generator_types.js";

export const GEN_BYTE_SIZE = 4;

export class Generator
{
    /**
     * The generator's enum number
     * @type {generatorTypes|number}
     */
    generatorType = generatorTypes.INVALID;
    /**
     * The generator's 16-bit value
     * @type {number}
     */
    generatorValue = 0;
    
    /**
     * Constructs a new generator
     * @param type {generatorTypes|number}
     * @param value {number}
     * @param validate {boolean}
     */
    constructor(type = generatorTypes.INVALID, value = 0, validate = true)
    {
        this.generatorType = type;
        if (value === undefined)
        {
            throw new Error("No value provided.");
        }
        this.generatorValue = Math.round(value);
        if (validate)
        {
            const lim = generatorLimits[type];
            
            if (lim !== undefined)
            {
                this.generatorValue = Math.max(lim.min, Math.min(lim.max, this.generatorValue));
            }
        }
    }
}

/**
 * generator.js
 * purpose: contains enums for generators,
 * and their limis parses reads soundfont generators, sums them and applies limits
 */
/**
 * @param generatorType {number}
 * @param presetGens {Generator[]}
 * @param instrumentGens {Generator[]}
 */
export function addAndClampGenerator(generatorType, presetGens, instrumentGens)
{
    const limits = generatorLimits[generatorType] || { min: 0, max: 32768, def: 0 };
    let presetGen = presetGens.find(g => g.generatorType === generatorType);
    let presetValue = 0;
    if (presetGen)
    {
        presetValue = presetGen.generatorValue;
    }
    
    let instruGen = instrumentGens.find(g => g.generatorType === generatorType);
    let instruValue = limits.def;
    if (instruGen)
    {
        instruValue = instruGen.generatorValue;
    }
    
    // limits are applied in the compute_modulator function
    return instruValue + presetValue;
}