import { IndexedByteArray } from "../../../utils/indexed_array.js";
import { writeWord } from "../../../utils/byte_functions/little_endian.js";
import { writeRIFFChunkRaw } from "../riff_chunk.js";
import type { BasicSoundBank } from "../basic_soundbank.ts";
import type { ReturnedExtendedSf2Chunks } from "../../types.ts";
import type { BasicZone } from "../basic_zone.ts";

const BAG_SIZE = 4;

export function getPBAG(bank: BasicSoundBank): ReturnedExtendedSf2Chunks {
    // write all pbag with their start indexes as they were changed in getPGEN() and getPMOD()
    const pbagSize = bank.presets.reduce(
        (sum, i) =>
            // +1 because global zone
            (i.presetZones.length + 1) * BAG_SIZE + sum,
        BAG_SIZE
    );
    const pbagData = new IndexedByteArray(pbagSize);
    // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md
    const xpbagData = new IndexedByteArray(pbagSize);
    let generatorIndex = 0;
    let modulatorIndex = 0;

    const writeZone = (z: BasicZone) => {
        writeWord(pbagData, generatorIndex & 0xffff);
        writeWord(pbagData, modulatorIndex & 0xffff);
        writeWord(xpbagData, generatorIndex >> 16);
        writeWord(xpbagData, modulatorIndex >> 16);
        generatorIndex += z.generators.length;
        modulatorIndex += z.modulators.length;
    };

    for (const preset of bank.presets) {
        // global
        writeZone(preset.globalZone);
        for (const pbag of preset.presetZones) {
            writeZone(pbag);
        }
    }
    // write the terminal PBAG
    writeWord(pbagData, generatorIndex);
    writeWord(pbagData, modulatorIndex);
    writeWord(xpbagData, generatorIndex);
    writeWord(xpbagData, modulatorIndex);
    const pbag = writeRIFFChunkRaw("pbag", pbagData);
    const xbag = writeRIFFChunkRaw("pbag", xpbagData);
    return {
        pdta: pbag,
        xdta: xbag,
        highestIndex: Math.max(generatorIndex, modulatorIndex)
    };
}
