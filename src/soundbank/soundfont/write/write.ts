import { IndexedByteArray } from "../../../utils/indexed_array";
import { RIFFChunk } from "../../../utils/riff_chunk";
import { getStringBytes } from "../../../utils/byte_functions/string";
import { ConsoleColors } from "../../../utils/other";
import { getSDTA } from "./sdta";
import { getSHDR } from "./shdr";
import {
    writeLittleEndianIndexed,
    writeWord
} from "../../../utils/byte_functions/little_endian";
import { SpessaLog } from "../../../utils/loggin";
import {
    MOD_BYTE_SIZE,
    Modulator,
    SPESSASYNTH_DEFAULT_MODULATORS
} from "../../basic_soundbank/modulator";
import { fillWithDefaults } from "../../../utils/fill_with_defaults";
import type {
    SF2InfoFourCC,
    SFEWriteOptions,
    SoundFont2WriteOptions
} from "../../types";
import type { BasicSoundBank } from "../../basic_soundbank/basic_soundbank";
import type { ExtendedSF2Chunks } from "./types";
import { writeSF2Elements } from "./write_sf2_elements";
import { toISODateString } from "../../../utils/date";

export const DEFAULT_SF2_WRITE_OPTIONS: SoundFont2WriteOptions = {
    writeDefaultModulators: true,
    writeExtendedLimits: true,
    software: "SpessaSynth" // ( ͡° ͜ʖ ͡°)
};

export const DEFAULT_SFE_WRITE_OPTIONS: SFEWriteOptions = {
    rf64: true,
    software: "SpessaSynth" // ( ͡° ͜ʖ ͡°)
};

/**
 * Writes the sound bank as an SF2 file.
 * @param bank
 * @param writeOptions the options for writing.
 * @returns the binary file data.
 */
export function writeSF2Internal(
    bank: BasicSoundBank,
    writeOptions: Partial<SoundFont2WriteOptions>
) {
    const options: SoundFont2WriteOptions = fillWithDefaults(
        writeOptions,
        DEFAULT_SF2_WRITE_OPTIONS
    );
    return writeSF(
        bank,
        options.software,
        options.writeDefaultModulators,
        options.writeExtendedLimits,
        false,
        false
    );
}

/**
 * Writes the sound bank as an SFE 4 file.
 * @param bank
 * @param writeOptions the options for writing.
 * @returns the binary file data.
 */
export function writeSFEInternal(
    bank: BasicSoundBank,
    writeOptions: Partial<SFEWriteOptions>
) {
    const options = fillWithDefaults(writeOptions, DEFAULT_SFE_WRITE_OPTIONS);
    return writeSF(bank, options.software, true, true, true, true);
}

/**
 * General writing function for both SFE and SF2.
 * @param bank the bank
 * @param software software param
 * @param writeDefaultModulators SFE + SF2 compatible
 * @param writeExtendedLimits SFE + SF2 compatible
 * @param writeBankLSB SFE Only
 * @param rf64 SFE Only
 * @internal
 */
function writeSF(
    bank: BasicSoundBank,
    software: string,
    writeDefaultModulators: boolean,
    writeExtendedLimits: boolean,
    writeBankLSB: boolean,
    rf64: boolean
) {
    SpessaLog.groupCollapsed("%cSaving soundbank...", ConsoleColors.info);
    SpessaLog.group("%cWriting INFO...", ConsoleColors.info);
    /**
     * Write INFO
     */
    const infoArrays: Uint8Array[] = [];

    const writeSF2Info = (type: SF2InfoFourCC, data?: string) => {
        if (!data) return;

        infoArrays.push(
            ...RIFFChunk.getParts(
                type,
                [getStringBytes(data, true, true)], // Pad with zero and ensure even length
                rf64
            )
        );
    };

    // Write info
    // Go with the SFSpec order (write functions auto skip if null)

    const info = bank.soundBankInfo;
    // Version writing needs special handling
    {
        const ifilData = new IndexedByteArray(4);
        writeWord(ifilData, info.version.major);
        writeWord(ifilData, info.version.minor);
        infoArrays.push(RIFFChunk.write("ifil", ifilData, rf64));
    }
    writeSF2Info("isng", info.soundEngine);
    writeSF2Info("INAM", info.name);
    writeSF2Info("irom", info.romInfo);
    if (info.romVersion) {
        const ifilData = new IndexedByteArray(4);
        writeWord(ifilData, info.romVersion.major);
        writeWord(ifilData, info.romVersion.minor);
        infoArrays.push(RIFFChunk.write("iver", ifilData, rf64));
    }
    writeSF2Info("ICRD", toISODateString(info.creationDate));
    writeSF2Info("IENG", info.engineer);
    writeSF2Info("IPRD", info.product);
    writeSF2Info("ICOP", info.copyright);
    // Special comment case: merge subject and comment
    const commentText = info?.subject
        ? (info?.comment ? info.comment + "\n" : "") + info.subject
        : info?.comment;
    writeSF2Info("ICMT", commentText);
    writeSF2Info("ISFT", software);

    // Do not write unchanged default modulators
    const unchangedDefaultModulators = bank.defaultModulators.some(
        (mod) =>
            !SPESSASYNTH_DEFAULT_MODULATORS.some((m) =>
                Modulator.isIdentical(m, mod, true)
            )
    );

    if (unchangedDefaultModulators && writeDefaultModulators) {
        const mods = bank.defaultModulators;
        SpessaLog.info(
            `%cWriting %c${mods.length}%c default modulators...`,
            ConsoleColors.info,
            ConsoleColors.recognized,
            ConsoleColors.info
        );
        const dmodSize = MOD_BYTE_SIZE + mods.length * MOD_BYTE_SIZE;
        const dmodData = new IndexedByteArray(dmodSize);
        for (const mod of mods) {
            mod.write(dmodData);
        }

        // Terminal modulator, is zero
        writeLittleEndianIndexed(dmodData, 0, MOD_BYTE_SIZE);

        infoArrays.push(...RIFFChunk.getParts("DMOD", [dmodData], rf64));
    }

    SpessaLog.groupEnd();
    SpessaLog.info("%cWriting SDTA...", ConsoleColors.info);
    // Write sdta
    const smplStartOffsets: number[] = [];
    const smplEndOffsets: number[] = [];
    const sdtaChunk = getSDTA(bank, smplStartOffsets, smplEndOffsets, rf64);

    SpessaLog.info("%cWriting PDTA...", ConsoleColors.info);
    // Write pdta
    // Go in reverse so the indexes are correct
    // Instruments
    SpessaLog.info("%cWriting SHDR...", ConsoleColors.info);
    const shdrChunk = getSHDR(bank, smplStartOffsets, smplEndOffsets, rf64);

    // Note:
    // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md

    SpessaLog.group("%cWriting instruments...", ConsoleColors.info);
    const instData = writeSF2Elements(bank, rf64, false);
    SpessaLog.groupEnd();

    SpessaLog.group("%cWriting presets...", ConsoleColors.info);
    const presData = writeSF2Elements(bank, rf64, true, writeBankLSB);
    SpessaLog.groupEnd();

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
    const pdtaChunk = RIFFChunk.getParts(
        "pdta",
        chunks.map((c) => c.pdta),
        rf64,
        true
    );

    const writeXdta =
        writeExtendedLimits &&
        (instData.writeXdta ||
            presData.writeXdta ||
            bank.presets.some((p) => p.name.length > 20) ||
            bank.instruments.some((i) => i.name.length > 20) ||
            bank.samples.some((s) => s.name.length > 20));

    if (writeXdta) {
        SpessaLog.info(
            `%cWriting the xdta chunk as writeExtendedLimits is enabled and at least one condition was met.`,
            ConsoleColors.info,
            ConsoleColors.value
        );
        // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md
        infoArrays.push(
            ...RIFFChunk.getParts(
                "xdta",
                chunks.map((c) => c.xdta),
                rf64,
                true
            )
        );
    }

    const infoChunk = RIFFChunk.getParts("INFO", infoArrays, rf64, true);
    SpessaLog.info("%cWriting the output file...", ConsoleColors.info);
    // Finally, combine everything
    const main = RIFFChunk.writeParts(
        rf64 ? "RIFS" : "RIFF",
        [
            getStringBytes(writeBankLSB ? "sfen" : "sfbk"),
            ...infoChunk,
            ...sdtaChunk,
            ...pdtaChunk
        ],
        rf64
    );
    SpessaLog.info(
        `%cSaved successfully! Final file size: %c${main.length}`,
        ConsoleColors.info,
        ConsoleColors.recognized
    );
    SpessaLog.groupEnd();
    return main.buffer;
}
