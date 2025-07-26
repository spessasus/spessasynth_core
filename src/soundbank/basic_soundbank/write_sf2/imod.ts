import { IndexedByteArray } from "../../../utils/indexed_array";
import {
    writeLittleEndian,
    writeWord
} from "../../../utils/byte_functions/little_endian";
import { writeRIFFChunkRaw } from "../riff_chunk";
import { MOD_BYTE_SIZE } from "../modulator";
import type { BasicSoundBank } from "../basic_soundbank";
import type { ReturnedExtendedSf2Chunks } from "../../types";
import type { BasicZone } from "../basic_zone";

/**
 * @param bank {BasicSoundBank}
 * @returns {ReturnedExtendedSf2Chunks}
 */
export function getIMOD(bank: BasicSoundBank): ReturnedExtendedSf2Chunks {
    // very similar to igen,
    // go through all instruments -> zones and write modulators sequentially
    let imodSize = MOD_BYTE_SIZE; // terminal
    for (const inst of bank.instruments) {
        imodSize += inst.globalZone.modulators.length * MOD_BYTE_SIZE;
        // start with one mod for global
        imodSize += inst.instrumentZones.reduce(
            (sum, z) => z.modulators.length * MOD_BYTE_SIZE + sum,
            0
        );
    }
    const imodData = new IndexedByteArray(imodSize);

    const writeZone = (z: BasicZone) => {
        for (const mod of z.modulators) {
            writeWord(imodData, mod.getSourceEnum());
            writeWord(imodData, mod.modulatorDestination);
            writeWord(imodData, mod.transformAmount);
            writeWord(imodData, mod.getSecSrcEnum());
            writeWord(imodData, mod.transformType);
        }
    };

    for (const inst of bank.instruments) {
        // global
        writeZone(inst.globalZone);
        for (const instrumentZone of inst.instrumentZones) {
            writeZone(instrumentZone);
        }
    }

    // terminal modulator, is zero
    writeLittleEndian(imodData, 0, MOD_BYTE_SIZE);

    // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md
    const ximodData = new IndexedByteArray(MOD_BYTE_SIZE);
    writeLittleEndian(ximodData, 0, MOD_BYTE_SIZE);

    const imod = writeRIFFChunkRaw("imod", imodData);
    const ximod = writeRIFFChunkRaw("imod", ximodData);
    return {
        pdta: imod,
        xdta: ximod,
        highestIndex: 0 // not applicable
    };
}
