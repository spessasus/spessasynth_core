import { IndexedByteArray } from "../../../utils/indexed_array";
import { writeRIFFChunkParts, writeRIFFChunkRaw } from "../riff_chunk";
import { getStringBytes } from "../../../utils/byte_functions/string";
import { consoleColors } from "../../../utils/other";
import { getIGEN } from "./igen";
import { getSDTA } from "./sdta";
import { getSHDR } from "./shdr";
import { getIMOD } from "./imod";
import { getIBAG } from "./ibag";
import { getINST } from "./inst";
import { getPGEN } from "./pgen";
import { getPMOD } from "./pmod";
import { getPBAG } from "./pbag";
import { getPHDR } from "./phdr";
import {
    writeLittleEndian,
    writeWord
} from "../../../utils/byte_functions/little_endian";
import {
    SpessaSynthGroupCollapsed,
    SpessaSynthGroupEnd,
    SpessaSynthInfo
} from "../../../utils/loggin";
import { MOD_BYTE_SIZE } from "../modulator";
import { fillWithDefaults } from "../../../utils/fill_with_defaults";
import type {
    ReturnedExtendedSf2Chunks,
    SoundFont2WriteOptions
} from "../../types";
import type { BasicSoundBank } from "../basic_soundbank";

export const DEFAULT_SF2_WRITE_OPTIONS: SoundFont2WriteOptions = {
    compress: false,
    compressionQuality: 0.5,
    compressionFunction: undefined,
    progressFunction: undefined,
    writeDefaultModulators: true,
    writeExtendedLimits: true,
    decompress: false
};

/**
 * Writes the sound bank as an SF2 file.
 * @param targetSoundBank
 * @param writeOptions the options for writing.
 * @returns the binary file data.
 */
export async function writeSF2Internal(
    targetSoundBank: BasicSoundBank,
    writeOptions: Partial<SoundFont2WriteOptions> = DEFAULT_SF2_WRITE_OPTIONS
): Promise<Uint8Array<ArrayBuffer>> {
    const options: SoundFont2WriteOptions = fillWithDefaults(
        writeOptions,
        DEFAULT_SF2_WRITE_OPTIONS
    );
    if (options?.compress) {
        if (typeof options?.compressionFunction !== "function") {
            throw new Error(
                "No compression function supplied but compression enabled."
            );
        }
        if (options?.decompress) {
            throw new Error("Decompressed and compressed at the same time.");
        }
    }
    SpessaSynthGroupCollapsed("%cSaving soundbank...", consoleColors.info);
    SpessaSynthInfo(
        `%cCompression: %c${options?.compress || "false"}%c quality: %c${options?.compressionQuality || "none"}`,
        consoleColors.info,
        consoleColors.recognized,
        consoleColors.info,
        consoleColors.recognized
    );
    SpessaSynthInfo("%cWriting INFO...", consoleColors.info);
    /**
     * Write INFO
     * @type {IndexedByteArray[]}
     */
    const infoArrays: IndexedByteArray[] = [];
    targetSoundBank.soundFontInfo["ISFT"] = "SpessaSynth"; // ( ͡° ͜ʖ ͡°)
    if (
        options?.compress ||
        targetSoundBank.samples.some((s) => s.isCompressed)
    ) {
        targetSoundBank.soundFontInfo["ifil"] = "3.0"; // set version to 3
    }
    if (options?.decompress) {
        targetSoundBank.soundFontInfo["ifil"] = "2.4"; // set version to 2.04
    }

    if (options?.writeDefaultModulators) {
        // trigger the DMOD write
        targetSoundBank.soundFontInfo["DMOD"] =
            `${targetSoundBank.defaultModulators.length} Modulators`;
        targetSoundBank.customDefaultModulators = true;
    } else {
        delete targetSoundBank.soundFontInfo["DMOD"];
    }

    for (const [type, data] of Object.entries(targetSoundBank.soundFontInfo)) {
        const isString = typeof data === "string";
        if ((type === "ifil" || type === "iver") && isString) {
            const major = parseInt(data.split(".")[0]);
            const minor = parseInt(data.split(".")[1]);
            const ckdata = new IndexedByteArray(4);
            writeWord(ckdata, major);
            writeWord(ckdata, minor);
            infoArrays.push(writeRIFFChunkRaw(type, ckdata));
        } else if (type === "DMOD") {
            const mods = targetSoundBank.defaultModulators;
            SpessaSynthInfo(
                `%cWriting %c${mods.length}%c default modulators...`,
                consoleColors.info,
                consoleColors.recognized,
                consoleColors.info
            );
            const dmodsize = MOD_BYTE_SIZE + mods.length * MOD_BYTE_SIZE;
            const dmoddata = new IndexedByteArray(dmodsize);
            for (const mod of mods) {
                writeWord(dmoddata, mod.getSourceEnum());
                writeWord(dmoddata, mod.destination);
                writeWord(dmoddata, mod.transformAmount);
                writeWord(dmoddata, mod.getSecSrcEnum());
                writeWord(dmoddata, mod.transformType);
            }

            // terminal modulator, is zero
            writeLittleEndian(dmoddata, 0, MOD_BYTE_SIZE);

            infoArrays.push(writeRIFFChunkRaw(type, dmoddata));
        } else if (isString) {
            infoArrays.push(
                writeRIFFChunkRaw(
                    type,
                    getStringBytes(data, true, true) // pad with zero and ensure even length
                )
            );
        }
    }

    SpessaSynthInfo("%cWriting SDTA...", consoleColors.info);
    // write sdta
    const smplStartOffsets: number[] = [];
    const smplEndOffsets: number[] = [];
    const sdtaChunk = await getSDTA(
        targetSoundBank,
        smplStartOffsets,
        smplEndOffsets,
        options.compress,
        options.decompress,
        options?.compressionFunction,
        options?.progressFunction
    );

    SpessaSynthInfo("%cWriting PDTA...", consoleColors.info);
    // write pdta
    // go in reverse so the indexes are correct
    // instruments
    SpessaSynthInfo("%cWriting SHDR...", consoleColors.info);
    const shdrChunk = getSHDR(
        targetSoundBank,
        smplStartOffsets,
        smplEndOffsets
    );
    SpessaSynthInfo("%cWriting IGEN...", consoleColors.info);
    const igenChunk = getIGEN(targetSoundBank);
    SpessaSynthInfo("%cWriting IMOD...", consoleColors.info);
    const imodChunk = getIMOD(targetSoundBank);
    SpessaSynthInfo("%cWriting IBAG...", consoleColors.info);
    const ibagChunk = getIBAG(targetSoundBank);
    SpessaSynthInfo("%cWriting INST...", consoleColors.info);
    const instChunk = getINST(targetSoundBank);
    SpessaSynthInfo("%cWriting PGEN...", consoleColors.info);
    // presets
    const pgenChunk = getPGEN(targetSoundBank);
    SpessaSynthInfo("%cWriting PMOD...", consoleColors.info);
    const pmodChunk = getPMOD(targetSoundBank);
    SpessaSynthInfo("%cWriting PBAG...", consoleColors.info);
    const pbagChunk = getPBAG(targetSoundBank);
    SpessaSynthInfo("%cWriting PHDR...", consoleColors.info);
    const phdrChunk = getPHDR(targetSoundBank);
    const chunks: ReturnedExtendedSf2Chunks[] = [
        phdrChunk,
        pbagChunk,
        pmodChunk,
        pgenChunk,
        instChunk,
        ibagChunk,
        imodChunk,
        igenChunk,
        shdrChunk
    ];
    // combine in the sfspec order
    const pdtaChunk = writeRIFFChunkParts(
        "pdta",
        chunks.map((c) => c.pdta),
        true
    );
    const maxIndex = Math.max(...chunks.map((c) => c.highestIndex));

    const writeXdta =
        options.writeExtendedLimits &&
        (maxIndex > 0xffff ||
            targetSoundBank.presets.some((p) => p.name.length > 20) ||
            targetSoundBank.instruments.some((i) => i.name.length > 20) ||
            targetSoundBank.samples.some((s) => s.name.length > 20));

    if (writeXdta) {
        SpessaSynthInfo(
            `%cWriting the xdta chunk! Max index: %c${maxIndex}`,
            consoleColors.info,
            consoleColors.value
        );
        // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md
        const xpdtaChunk = writeRIFFChunkParts(
            "xdta",
            chunks.map((c) => c.xdta),
            true
        );
        infoArrays.push(xpdtaChunk);
    }

    const infoChunk = writeRIFFChunkParts("INFO", infoArrays, true);
    SpessaSynthInfo("%cWriting the output file...", consoleColors.info);
    // finally, combine everything
    const main = writeRIFFChunkParts("RIFF", [
        getStringBytes("sfbk"),
        infoChunk,
        sdtaChunk,
        pdtaChunk
    ]);
    SpessaSynthInfo(
        `%cSaved succesfully! Final file size: %c${main.length}`,
        consoleColors.info,
        consoleColors.recognized
    );
    SpessaSynthGroupEnd();
    return main;
}
