import { writeDword, writeWord } from "../../../utils/byte_functions/little_endian.js";
import { IndexedByteArray } from "../../../utils/indexed_array.js";
import { RiffChunk, writeRIFFChunk } from "../riff_chunk.js";

import { GEN_BYTE_SIZE, Generator } from "../generator.js";
import { generatorTypes } from "../generator_types.js";

/**
 * @this {BasicSoundBank}
 * @returns {IndexedByteArray}
 */
export function getPGEN()
{
    // almost identical to igen, except the correct instrument instead of sample gen
    // goes through all preset zones and writes generators sequentially (add 4 for terminal)
    let pgensize = GEN_BYTE_SIZE;
    for (const preset of this.presets)
    {
        pgensize += preset.globalZone.generators.length * GEN_BYTE_SIZE;
        pgensize += preset.presetZones.reduce((size, z) =>
        {
            // clear instrument and range generators before determining the size
            z.generators = z.generators.filter(g =>
                g.generatorType !== generatorTypes.instrument &&
                g.generatorType !== generatorTypes.keyRange &&
                g.generatorType !== generatorTypes.velRange
            );
            // unshift vel then key and instrument is last
            if (z.hasVelRange)
            {
                z.prependGenerator(new Generator(
                    generatorTypes.velRange,
                    z.velRange.max << 8 | Math.max(z.velRange.min, 0),
                    false
                ));
            }
            if (z.hasKeyRange)
            {
                z.prependGenerator(new Generator(
                    generatorTypes.keyRange,
                    z.keyRange.max << 8 | Math.max(z.keyRange.min, 0),
                    false
                ));
            }
            // write the instrument id
            z.addGenerators(new Generator(
                generatorTypes.instrument,
                this.instruments.indexOf(z.instrument),
                false
            ));
            return z.generators.length * GEN_BYTE_SIZE + size;
        }, 0);
    }
    const pgendata = new IndexedByteArray(pgensize);
    
    /**
     * @param z {BasicZone}
     */
    const writeZone = z =>
    {
        for (const gen of z.generators)
        {
            // name is deceptive, it works on negatives
            writeWord(pgendata, gen.generatorType);
            writeWord(pgendata, gen.generatorValue);
        }
    };
    for (const preset of this.presets)
    {
        // global zone
        writeZone(preset.globalZone);
        for (const zone of preset.presetZones)
        {
            writeZone(zone);
        }
    }
    // terminal generator, is zero
    writeDword(pgendata, 0);
    
    return writeRIFFChunk(new RiffChunk(
        "pgen",
        pgendata.length,
        pgendata
    ));
}