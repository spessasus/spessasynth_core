import { writeDword, writeWord } from "../../../utils/byte_functions/little_endian.js";
import { IndexedByteArray } from "../../../utils/indexed_array.js";
import { RiffChunk, writeRIFFChunk } from "../riff_chunk.js";
import { GEN_BYTE_SIZE, Generator } from "../generator.js";
import { generatorTypes } from "../generator_types.js";

/**
 * @this {BasicSoundBank}
 * @returns {ReturnedExtendedSf2Chunks}
 */
export function getIGEN()
{
    // go through all instruments -> zones and write generators sequentially (add 4 for terminal)
    let igenSize = GEN_BYTE_SIZE;
    for (const inst of this.instruments)
    {
        igenSize += inst.globalZone.generators.length * GEN_BYTE_SIZE;
        igenSize += inst.instrumentZones.reduce((sum, z) =>
        {
            // clear sample and range generators before determining the size
            z.generators = (z.generators.filter(g =>
                g.generatorType !== generatorTypes.sampleID &&
                g.generatorType !== generatorTypes.keyRange &&
                g.generatorType !== generatorTypes.velRange
            ));
            // add sample and ranges if necessary
            // unshift vel then key (to make key first) and the sample is last
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
            // add sample id
            z.addGenerators(new Generator(
                generatorTypes.sampleID,
                this.samples.indexOf(z.sample),
                false
            ));
            return z.generators.length * GEN_BYTE_SIZE + sum;
        }, 0);
    }
    const igenData = new IndexedByteArray(igenSize);
    
    /**
     * @param z {BasicZone}
     */
    const writeZone = z =>
    {
        for (const gen of z.generators)
        {
            // name is deceptive, it works on negatives
            writeWord(igenData, gen.generatorType);
            writeWord(igenData, gen.generatorValue);
        }
    };
    
    for (const instrument of this.instruments)
    {
        // global zone
        writeZone(instrument.globalZone);
        for (const instrumentZone of instrument.instrumentZones)
        {
            writeZone(instrumentZone);
        }
    }
    // terminal generator, is zero
    writeDword(igenData, 0);
    
    // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md
    const xigenData = new IndexedByteArray(GEN_BYTE_SIZE);
    writeDword(xigenData, 0);
    
    const igen = writeRIFFChunk(new RiffChunk(
        "igen",
        igenData.length,
        igenData
    ));
    const xigen = writeRIFFChunk(new RiffChunk(
        "igen",
        xigenData.length,
        xigenData
    ));
    return {
        pdta: igen,
        xdta: xigen,
        highestIndex: 0 // not applicable
    };
}