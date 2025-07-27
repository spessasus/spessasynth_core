import { IndexedByteArray } from "../../../utils/indexed_array";
import { combineZones } from "./combine_zones";
import { writeRIFFChunkParts, writeRIFFChunkRaw } from "../riff_chunk";
import { writeDword } from "../../../utils/byte_functions/little_endian";
import { writeDLSRegion } from "./rgn2";
import { writeArticulator } from "./art2";
import { SpessaSynthGroupCollapsed, SpessaSynthGroupEnd } from "../../../utils/loggin";
import { consoleColors } from "../../../utils/other";
import { getStringBytes } from "../../../utils/byte_functions/string";
import type { BasicSoundBank } from "../basic_soundbank";
import type { BasicPreset } from "../basic_preset";

/**
 * @param bank {BasicSoundBank}
 * @param preset {BasicPreset}
 * @returns {IndexedByteArray}
 */
export function writeIns(
    bank: BasicSoundBank,
    preset: BasicPreset
): IndexedByteArray {
    SpessaSynthGroupCollapsed(
        `%cWriting %c${preset.name}%c...`,
        consoleColors.info,
        consoleColors.recognized,
        consoleColors.info
    );
    // combine preset and instrument zones into a single instrument zone (region) list
    const inst = combineZones(preset);
    const global = inst.globalZone;
    const zones = inst.zones;

    // insh: instrument header
    const inshData = new IndexedByteArray(12);
    writeDword(inshData, zones.length); // cRegions
    // bank MSB is in bits 8-14
    let ulBank = (preset.bank & 127) << 8;
    // bit 32 means drums
    if (preset.bank === 128) {
        ulBank |= 1 << 31;
    }
    writeDword(inshData, ulBank); // ulBank
    writeDword(inshData, preset.program & 127); // ulInstrument

    const insh = writeRIFFChunkRaw("insh", inshData);

    // write global zone
    const art2 = writeArticulator(global);
    const lar2 = writeRIFFChunkRaw("lar2", art2, false, true);

    // write the region list
    const lrgn = writeRIFFChunkParts(
        "lrgn",
        zones.reduce((arrs: IndexedByteArray[], z) => {
            arrs.push(writeDLSRegion(bank, z, global));
            return arrs;
        }, []),
        true
    );

    // writeINFO
    const inam = writeRIFFChunkRaw("INAM", getStringBytes(preset.name, true));
    const info = writeRIFFChunkRaw("INFO", inam, false, true);

    SpessaSynthGroupEnd();
    return writeRIFFChunkParts("ins ", [insh, lrgn, lar2, info], true);
}
