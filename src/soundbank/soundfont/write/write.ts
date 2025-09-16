import { IndexedByteArray } from "../../../utils/indexed_array";
import {
    writeRIFFChunkParts,
    writeRIFFChunkRaw
} from "../../../utils/riff_chunk";
import { getStringBytes } from "../../../utils/byte_functions/string";
import { consoleColors } from "../../../utils/other";
import { getSDTA } from "./sdta";
import { getSHDR } from "./shdr";
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
    SF2InfoFourCC,
    SoundBankInfoData,
    SoundBankInfoFourCC,
    SoundFont2WriteOptions
} from "../../types";
import type { BasicSoundBank } from "../../basic_soundbank/basic_soundbank";
import type { ExtendedSF2Chunks } from "./types";
import { writeSF2Elements } from "./write_sf2_elements";

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
 * @param bank
 * @param writeOptions the options for writing.
 * @returns the binary file data.
 */
export async function writeSF2Internal(
    bank: BasicSoundBank,
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
    bank.soundBankInfo.software = "SpessaSynth"; // ( ͡° ͜ʖ ͡°)
    if (options?.compress || bank.samples.some((s) => s.isCompressed)) {
        // Set version to 3
        bank.soundBankInfo.version.major = 3;
        bank.soundBankInfo.version.minor = 0;
    }
    if (options?.decompress) {
        // Set version to 2.4
        bank.soundBankInfo.version.major = 2;
        bank.soundBankInfo.version.minor = 4;
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
    writeWord(ifilData, bank.soundBankInfo.version.major);
    writeWord(ifilData, bank.soundBankInfo.version.minor);
    infoArrays.push(writeRIFFChunkRaw("ifil", ifilData));

    if (bank.soundBankInfo.romVersion) {
        const ifilData = new IndexedByteArray(4);
        writeWord(ifilData, bank.soundBankInfo.romVersion.major);
        writeWord(ifilData, bank.soundBankInfo.romVersion.minor);
        infoArrays.push(writeRIFFChunkRaw("iver", ifilData));
    }

    // Special comment case: merge subject and comment
    const commentText =
        (bank.soundBankInfo?.comment ?? "") +
        (bank.soundBankInfo.subject
            ? `
${bank.soundBankInfo.subject}`
            : "");

    for (const [t, d] of Object.entries(bank.soundBankInfo)) {
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
    const unchangedDefaultModulators = bank.defaultModulators.some(
        (mod) =>
            SPESSASYNTH_DEFAULT_MODULATORS.findIndex((m) =>
                Modulator.isIdentical(m, mod, true)
            ) === -1
    );

    if (unchangedDefaultModulators && options?.writeDefaultModulators) {
        const mods = bank.defaultModulators;
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
        bank,
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
    const shdrChunk = getSHDR(bank, smplStartOffsets, smplEndOffsets);

    // Note:
    // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md

    SpessaSynthGroup("%cWriting instruments...", consoleColors.info);
    const instData = writeSF2Elements(bank, false);
    SpessaSynthGroupEnd();

    SpessaSynthGroup("%cWriting presets...", consoleColors.info);
    const presData = writeSF2Elements(bank, true);
    SpessaSynthGroupEnd();

    const chunks: ExtendedSF2Chunks[] = [
        presData.hdr,
        presData.bag,
        presData.mod,
        presData.gen,
        instData.hdr,
        instData.bag,
        instData.mod,
        instData.gen,
        shdrChunk
    ];
    // Combine in the soundfont spec order
    const pdtaChunk = writeRIFFChunkParts(
        "pdta",
        chunks.map((c) => c.pdta),
        true
    );

    const writeXdta =
        options.writeExtendedLimits &&
        (instData.writeXdta ||
            presData.writeXdta ||
            bank.presets.some((p) => p.name.length > 20) ||
            bank.instruments.some((i) => i.name.length > 20) ||
            bank.samples.some((s) => s.name.length > 20));

    if (writeXdta) {
        SpessaSynthInfo(
            `%cWriting the xdta chunk as writeExendedLimits is enabled and at least one condition was met.`,
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
