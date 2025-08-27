import { IndexedByteArray } from "../../../utils/indexed_array";
import { flattenSFZones } from "../structure/flatten_sf_zones";
import { writeRIFFChunkParts, writeRIFFChunkRaw } from "../../../utils/riff_chunk";
import { writeDword } from "../../../utils/byte_functions/little_endian";
import { writeDLSRegion } from "./rgn2";
import { SpessaSynthGroupCollapsed, SpessaSynthGroupEnd } from "../../../utils/loggin";
import { consoleColors } from "../../../utils/other";
import { getStringBytes } from "../../../utils/byte_functions/string";
import type { BasicSoundBank } from "../../basic_soundbank/basic_soundbank";
import type { BasicPreset } from "../../basic_soundbank/basic_preset";

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
    // Combine preset and instrument zones into a single instrument zone (region) list
    const inst = flattenSFZones(preset);
    const global = inst.globalZone;
    const zones = inst.zones;

    // Insh: instrument header
    const inshData = new IndexedByteArray(12);
    writeDword(inshData, zones.length); // CRegions
    // Bank MSB is in bits 8-14
    let ulBank = (preset.bankMSB & 127) << 8;
    // Bit 32 means drums
    if (preset.bankMSB === 128) {
        ulBank |= 1 << 31;
    }
    writeDword(inshData, ulBank); // UlBank
    writeDword(inshData, preset.program & 127); // UlInstrument

    const insh = writeRIFFChunkRaw("insh", inshData);

    // Write the region list
    const lrgn = writeRIFFChunkParts(
        "lrgn",
        zones.reduce((arrs: IndexedByteArray[], z) => {
            arrs.push(writeDLSRegion(bank, z, global));
            return arrs;
        }, []),
        true
    );

    // WriteINFO
    const inam = writeRIFFChunkRaw("INAM", getStringBytes(preset.name, true));
    const info = writeRIFFChunkRaw("INFO", inam, false, true);

    SpessaSynthGroupEnd();
    return writeRIFFChunkParts("ins ", [insh, lrgn, info], true);
}
