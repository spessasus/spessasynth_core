import { readLittleEndian } from "../../utils/byte_functions/little_endian.js";
import { RiffChunk } from "../basic_soundfont/riff_chunk.js";
import { BasicPresetZone } from "../basic_soundfont/basic_preset_zone.js";
import { Generator } from "../basic_soundfont/generator.js";
import { Modulator } from "../basic_soundfont/modulator.js";
import { generatorTypes } from "../basic_soundfont/generator_types.js";

/**
 * preset_zones.js
 * purpose: reads preset zones from soundfont and gets their respective samples and generators and modulators
 */

export class PresetZone extends BasicPresetZone
{
    /**
     * Creates a zone (preset)
     * @param preset {BasicPreset}
     */
    constructor(preset)
    {
        super(preset);
    }
    
    /**
     * grab the instrument
     * @param instruments {BasicInstrument[]}
     */
    getInstrument(instruments)
    {
        let instrumentID = this.generators.find(g => g.generatorType === generatorTypes.instrument);
        if (instrumentID)
        {
            this.setInstrument(instruments[instrumentID.generatorValue]);
        }
    }
}

/**
 * Reads the given preset zone read
 * @param zonesChunk {RiffChunk}
 * @param presetGens {Generator[]}
 * @param instruments {BasicInstrument[]}
 * @param presetMods {Modulator[]}
 * @param presets {Preset[]}
 */
export function readPresetZones(zonesChunk, presetGens, presetMods, instruments, presets)
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
    for (const preset of presets)
    {
        for (let i = 0; i < preset.zonesCount; i++)
        {
            const gensStart = genStartIndexes[genIndex++];
            const gensEnd = genStartIndexes[genIndex];
            const gens = presetGens.slice(gensStart, gensEnd);
            const modsStart = modStartIndexes[modIndex++];
            const modsEnd = modStartIndexes[modIndex];
            const mods = presetMods.slice(modsStart, modsEnd);
            // check for global zone
            if (gens.find(g => g.generatorType === generatorTypes.instrument) !== undefined)
            {
                // regular zone
                const zone = preset.createZone();
                zone.addGenerators(...gens);
                zone.addModulators(...mods);
                zone.getInstrument(instruments);
            }
            else
            {
                // global zone
                preset.globalZone.addGenerators(...gens);
                preset.globalZone.addModulators(...mods);
            }
        }
    }
}