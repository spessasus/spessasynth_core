/**
 * @typedef {Object} SoundFontRange
 * @property {number} min - the minimum midi note
 * @property {number} max - the maximum midi note
 */
import { generatorTypes } from "./generator_types.js";
import { Generator } from "./generator.js";

export class BasicZone
{
    /**
     * The zone's velocity range
     * min -1 means that it is a default value
     * @type {SoundFontRange}
     */
    velRange = { min: -1, max: 127 };
    
    /**
     * The zone's key range
     * min -1 means that it is a default value
     * @type {SoundFontRange}
     */
    keyRange = { min: -1, max: 127 };
    
    /**
     * The zone's generators
     * @type {Generator[]}
     */
    generators = [];
    /**
     * The zone's modulators
     * @type {Modulator[]}
     */
    modulators = [];
    
    /**
     * @returns {boolean}
     */
    get hasKeyRange()
    {
        return this.keyRange.min !== -1;
    }
    
    /**
     * @returns {boolean}
     */
    get hasVelRange()
    {
        return this.velRange.min !== -1;
    }
    
    /**
     * Adds at the start
     * @param generator {Generator}
     */
    prependGenerator(generator)
    {
        this.generators.unshift(generator);
    }
    
    /**
     * @param type {generatorTypes}
     * @param value {number}
     */
    setGenerator(type, value)
    {
        switch (type)
        {
            case generatorTypes.sampleID:
                throw new Error("Use setSample()");
            case generatorTypes.instrument:
                throw new Error("Use setInstrument()");
            
            case generatorTypes.velRange:
            case generatorTypes.keyRange:
                throw new Error("Set the range manually");
        }
        let generator = this.generators.find(g => g.generatorType === type);
        if (generator)
        {
            generator.generatorValue = value;
        }
        else
        {
            this.addGenerators(new Generator(type, value));
        }
    }
    
    /**
     * @param generators {Generator}
     */
    addGenerators(...generators)
    {
        generators.forEach(g =>
        {
            switch (g.generatorType)
            {
                default:
                    this.generators.push(g);
                    break;
                
                case generatorTypes.velRange:
                    this.velRange.min = g.generatorValue & 0x7F;
                    this.velRange.max = (g.generatorValue >> 8) & 0x7F;
                    break;
                
                case generatorTypes.keyRange:
                    this.keyRange.min = g.generatorValue & 0x7F;
                    this.keyRange.max = (g.generatorValue >> 8) & 0x7F;
            }
        });
    }
    
    /**
     * @param modulators {Modulator}
     */
    addModulators(...modulators)
    {
        this.modulators.push(...modulators);
    }
    
    /**
     * @param generatorType {generatorTypes}
     * @param notFoundValue {number}
     * @returns {number}
     */
    getGeneratorValue(generatorType, notFoundValue)
    {
        return this.generators.find(g => g.generatorType === generatorType)?.generatorValue ?? notFoundValue;
    }
}

