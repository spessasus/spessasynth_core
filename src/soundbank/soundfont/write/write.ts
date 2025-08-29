import { IndexedByteArray } from "../../../utils/indexed_array";
import {
    writeRIFFChunkParts,
    writeRIFFChunkRaw
} from "../../../utils/riff_chunk";
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
    writeLittleEndianIndexed,
    writeWord
} from "../../../utils/byte_functions/little_endian";
import {
    SpessaSynthGroup,
    SpessaSynthGroupCollapsed,
    SpessaSynthGroupEnd,
    SpessaSynthInfo
} from "../../../utils/loggin";
import {
    MOD_BYTE_SIZE,
    Modulator,
    SPESSASYNTH_DEFAULT_MODULATORS
} from "../../basic_soundbank/modulator";
import { fillWithDefaults } from "../../../utils/fill_with_defaults";
import type {
    ReturnedExtendedSf2Chunks,
    SF2InfoFourCC,
    SoundBankInfoData,
    SoundBankInfoFourCC,
    SoundFont2WriteOptions
} from "../../types";
import type { BasicSoundBank } from "../../basic_soundbank/basic_soundbank";

export const DEFAULT_SF2_WRITE_OPTIONS: SoundFont2WriteOptions = {
    compress: false,
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
): Promise<ArrayBuffer> {
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
        `%cCompression: %c${options?.compress || "false"}%c`,
        consoleColors.info,
        consoleColors.recognized,
        consoleColors.info,
        consoleColors.recognized
    );
    SpessaSynthGroup("%cWriting INFO...", consoleColors.info);
    /**
     * Write INFO
     */
    const infoArrays: IndexedByteArray[] = [];
    targetSoundBank.soundBankInfo.software = "SpessaSynth"; // ( ͡° ͜ʖ ͡°)
    if (
        options?.compress ||
        targetSoundBank.samples.some((s) => s.isCompressed)
    ) {
        // Set version to 3
        targetSoundBank.soundBankInfo.version.major = 3;
        targetSoundBank.soundBankInfo.version.minor = 0;
    }
    if (options?.decompress) {
        // Set version to 2.4
        targetSoundBank.soundBankInfo.version.major = 2;
        targetSoundBank.soundBankInfo.version.minor = 4;
    }

    const writeSF2Info = (type: SF2InfoFourCC, data: string) => {
        infoArrays.push(
            writeRIFFChunkRaw(
                type,
                getStringBytes(data, true, true) // Pad with zero and ensure even length
            )
        );
    };

    // Write versions
    const ifilData = new IndexedByteArray(4);
    writeWord(ifilData, targetSoundBank.soundBankInfo.version.major);
    writeWord(ifilData, targetSoundBank.soundBankInfo.version.minor);
    infoArrays.push(writeRIFFChunkRaw("ifil", ifilData));

    if (targetSoundBank.soundBankInfo.romVersion) {
        const ifilData = new IndexedByteArray(4);
        writeWord(ifilData, targetSoundBank.soundBankInfo.romVersion.major);
        writeWord(ifilData, targetSoundBank.soundBankInfo.romVersion.minor);
        infoArrays.push(writeRIFFChunkRaw("iver", ifilData));
    }

    // Special comment case: merge subject and comment
    const commentText =
        (targetSoundBank.soundBankInfo?.comment ?? "") +
        (targetSoundBank.soundBankInfo.subject
            ? `
${targetSoundBank.soundBankInfo.subject}`
            : "");

    for (const [t, d] of Object.entries(targetSoundBank.soundBankInfo)) {
        const type = t as SoundBankInfoFourCC;
        const data = d as SoundBankInfoData[SoundBankInfoFourCC];
        if (!data) {
            continue;
        }

        switch (type) {
            case "name":
                writeSF2Info("INAM", data as string);
                break;

            case "comment":
                writeSF2Info("ICMT", commentText);
                break;

            case "copyright":
                writeSF2Info("ICOP", data as string);
                break;

            case "creationDate":
                writeSF2Info("ICRD", (data as Date).toISOString());
                break;

            case "engineer":
                writeSF2Info("IENG", data as string);
                break;

            case "product":
                writeSF2Info("IPRD", data as string);
                break;

            case "romInfo":
                writeSF2Info("irom", data as string);
                break;

            case "software":
                writeSF2Info("ISFT", data as string);
                break;

            case "soundEngine":
                writeSF2Info("isng", data as string);
                break;

            case "subject":
                // Merged with the comment
                break;
        }
    }

    // Do not write unchanged default modulators
    const unchangedDefaultModulators = targetSoundBank.defaultModulators.some(
        (mod) =>
            SPESSASYNTH_DEFAULT_MODULATORS.findIndex((m) =>
                Modulator.isIdentical(m, mod, true)
            ) === -1
    );

    if (unchangedDefaultModulators && options?.writeDefaultModulators) {
        const mods = targetSoundBank.defaultModulators;
        SpessaSynthInfo(
            `%cWriting %c${mods.length}%c default modulators...`,
            consoleColors.info,
            consoleColors.recognized,
            consoleColors.info
        );
        const dmodSize = MOD_BYTE_SIZE + mods.length * MOD_BYTE_SIZE;
        const dmodData = new IndexedByteArray(dmodSize);
        for (const mod of mods) {
            mod.write(dmodData);
        }

        // Terminal modulator, is zero
        writeLittleEndianIndexed(dmodData, 0, MOD_BYTE_SIZE);

        infoArrays.push(writeRIFFChunkRaw("DMOD", dmodData));
    }

    SpessaSynthGroupEnd();
    SpessaSynthInfo("%cWriting SDTA...", consoleColors.info);
    // Write sdta
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
    // Write pdta
    // Go in reverse so the indexes are correct
    // Instruments
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
    // Presets
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
    // Combine in the sfspec order
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
    // Finally, combine everything
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
    return main.buffer;
}
