import { IndexedByteArray } from "../../../utils/indexed_array";
import { writeLittleEndianIndexed, writeWord } from "../../../utils/byte_functions/little_endian";
import { writeRIFFChunkRaw } from "../../../utils/riff_chunk";
import { MOD_BYTE_SIZE } from "../modulator";
import type { BasicSoundBank } from "../basic_soundbank";
import type { ReturnedExtendedSf2Chunks } from "../../types";
import type { BasicZone } from "../basic_zone";

/**
 * @param bank {BasicSoundBank}
 * @returns {ReturnedExtendedSf2Chunks}
 */
export function getIMOD(bank: BasicSoundBank): ReturnedExtendedSf2Chunks {
    // Very similar to igen,
    // Go through all instruments -> zones and write modulators sequentially
    let imodSize = MOD_BYTE_SIZE; // Terminal
    for (const inst of bank.instruments) {
        imodSize += inst.globalZone.modulators.length * MOD_BYTE_SIZE;
        // Start with one mod for global
        imodSize += inst.zones.reduce(
            (sum, z) => z.modulators.length * MOD_BYTE_SIZE + sum,
            0
        );
    }
    const imodData = new IndexedByteArray(imodSize);

    const writeZone = (z: BasicZone) => {
        for (const mod of z.modulators) {
            writeWord(imodData, mod.getSourceEnum());
            writeWord(imodData, mod.destination);
            writeWord(imodData, mod.transformAmount);
            writeWord(imodData, mod.getSecSrcEnum());
            writeWord(imodData, mod.transformType);
        }
    };

    for (const inst of bank.instruments) {
        // Global
        writeZone(inst.globalZone);
        for (const instrumentZone of inst.zones) {
            writeZone(instrumentZone);
        }
    }

    // Terminal modulator, is zero
    writeLittleEndianIndexed(imodData, 0, MOD_BYTE_SIZE);

    // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md
    const ximodData = new IndexedByteArray(MOD_BYTE_SIZE);
    writeLittleEndianIndexed(ximodData, 0, MOD_BYTE_SIZE);

    const imod = writeRIFFChunkRaw("imod", imodData);
    const ximod = writeRIFFChunkRaw("imod", ximodData);
    return {
        pdta: imod,
        xdta: ximod,
        highestIndex: 0 // Not applicable
    };
}
