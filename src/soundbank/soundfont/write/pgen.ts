import {
    writeDword,
    writeWord
} from "../../../utils/byte_functions/little_endian";
import { IndexedByteArray } from "../../../utils/indexed_array";
import { writeRIFFChunkRaw } from "../../../utils/riff_chunk";

import { GEN_BYTE_SIZE, Generator } from "../../basic_soundbank/generator";
import type { BasicSoundBank } from "../../basic_soundbank/basic_soundbank";
import type { ReturnedExtendedSf2Chunks } from "../../types";
import type { BasicZone } from "../../basic_soundbank/basic_zone";
import { generatorTypes } from "../../basic_soundbank/generator_types";

export function getPGEN(bank: BasicSoundBank): ReturnedExtendedSf2Chunks {
    // Almost identical to igen, except the correct instrument instead of sample gen
    // Goes through all preset zones and writes generators sequentially (add 4 for terminal)
    let pgenSize = GEN_BYTE_SIZE;
    for (const preset of bank.presets) {
        pgenSize += preset.globalZone.generators.length * GEN_BYTE_SIZE;
        pgenSize += preset.zones.reduce((size, z) => {
            // Clear instrument and range generators before determining the size
            z.generators = z.generators.filter(
                (g) =>
                    g.generatorType !== generatorTypes.instrument &&
                    g.generatorType !== generatorTypes.keyRange &&
                    g.generatorType !== generatorTypes.velRange
            );
            // Unshift vel then key and instrument is last
            if (z.hasVelRange) {
                z.prependGenerator(
                    new Generator(
                        generatorTypes.velRange,
                        (z.velRange.max << 8) | Math.max(z.velRange.min, 0),
                        false
                    )
                );
            }
            if (z.hasKeyRange) {
                z.prependGenerator(
                    new Generator(
                        generatorTypes.keyRange,
                        (z.keyRange.max << 8) | Math.max(z.keyRange.min, 0),
                        false
                    )
                );
            }
            // Write the instrument id
            // (Force, don't use .addGenerators which filters it out)
            z.generators.push(
                new Generator(
                    generatorTypes.instrument,
                    bank.instruments.indexOf(z.instrument),
                    false
                )
            );
            return z.generators.length * GEN_BYTE_SIZE + size;
        }, 0);
    }
    const pgenData = new IndexedByteArray(pgenSize);

    const writeZone = (z: BasicZone) => {
        for (const gen of z.generators) {
            // Name is deceptive, it works on negatives
            writeWord(pgenData, gen.generatorType);
            writeWord(pgenData, gen.generatorValue);
        }
    };
    for (const preset of bank.presets) {
        // global zone
        writeZone(preset.globalZone);
        for (const zone of preset.zones) {
            writeZone(zone);
        }
    }
    // Terminal generator, is zero
    writeDword(pgenData, 0);

    // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md
    const xpgenData = new IndexedByteArray(GEN_BYTE_SIZE);
    writeDword(xpgenData, 0);

    const pgen = writeRIFFChunkRaw("pgen", pgenData);

    const xpgen = writeRIFFChunkRaw("pgen", xpgenData);
    return {
        pdta: pgen,
        xdta: xpgen,
        highestIndex: 0 // Not applicable
    };
}
