/**
 * instrument_zones.js
 * purpose: reads instrument zones from soundfont and gets their respective samples and generators and modulators
 */
import { BasicInstrumentZone } from "../basic_soundfont/basic_instrument_zone.js";
import { generatorTypes } from "../basic_soundfont/generator_types.js";
import { readLittleEndian } from "../../utils/byte_functions/little_endian.js";

export class InstrumentZone extends BasicInstrumentZone
{
    /**
     * Creates a zone (instrument)
     * @param inst {Instrument}
     */
    constructor(inst)
    {
        super(inst);
    }
    
    /**
     * Loads the zone's sample
     * @param samples {BasicSample[]}
     */
    getSample(samples)
    {
        let sampleID = this.generators.find(g => g.generatorType === generatorTypes.sampleID);
        if (sampleID)
        {
            this.setSample(samples[sampleID.generatorValue]);
        }
    }
}

/**
 * Reads the given instrument zone
 * @param zonesChunk {RiffChunk}
 * @param instrumentGenerators {Generator[]}
 * @param instrumentModulators {Modulator[]}
 * @param samples {BasicSample[]}
 * @param instruments {Instrument[]}
 */
export function readInstrumentZones(zonesChunk, instrumentGenerators, instrumentModulators, samples, instruments)
{
    /**
     * @type {number[]}
     */
    const modStartIndexes = [];
    /**
     * @type {number[]}
     */
    const genStartIndexes = [];
    
    while (zonesChunk.chunkData.length > zonesChunk.chunkData.currentIndex)
    {
        genStartIndexes.push(readLittleEndian(zonesChunk.chunkData, 2));
        modStartIndexes.push(readLittleEndian(zonesChunk.chunkData, 2));
    }
    
    let modIndex = 0;
    let genIndex = 0;
    for (const instrument of instruments)
    {
        for (let i = 0; i < instrument.zonesCount; i++)
        {
            const gensStart = genStartIndexes[genIndex++];
            const gensEnd = genStartIndexes[genIndex];
            const gens = instrumentGenerators.slice(gensStart, gensEnd);
            const modsStart = modStartIndexes[modIndex++];
            const modsEnd = modStartIndexes[modIndex];
            const mods = instrumentModulators.slice(modsStart, modsEnd);
            // check for global zone
            if (gens.find(g => g.generatorType === generatorTypes.sampleID))
            {
                // regular zone
                const zone = instrument.createZone();
                zone.addGenerators(...gens);
                zone.addModulators(...mods);
                zone.getSample(samples);
            }
            else
            {
                // global zone
                instrument.globalZone.addGenerators(...gens);
                instrument.globalZone.addModulators(...mods);
            }
        }
    }
}