import { IndexedByteArray } from "../../../utils/indexed_array";
import { RIFFChunk } from "../../../utils/riff_chunk";
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
import type { SF2InfoFourCC, SoundFont2WriteOptions } from "../../types";
import type { BasicSoundBank } from "../../basic_soundbank/basic_soundbank";
import type { ExtendedSF2Chunks } from "./types";
import { writeSF2Elements } from "./write_sf2_elements";
import { toISODateString } from "../../../utils/date";

export const DEFAULT_SF2_WRITE_OPTIONS: SoundFont2WriteOptions = {
    writeDefaultModulators: true,
    writeExtendedLimits: true,
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
    SpessaSynthGroupCollapsed("%cSaving soundbank...", consoleColors.info);
    SpessaSynthGroup("%cWriting INFO...", consoleColors.info);
    /**
     * Write INFO
     */
    const infoArrays: IndexedByteArray[] = [];

    const writeSF2Info = (type: SF2InfoFourCC, data?: string) => {
        if (!data) return;

        infoArrays.push(
            RIFFChunk.write(
                type,
                getStringBytes(data, true, true) // Pad with zero and ensure even length
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
        infoArrays.push(RIFFChunk.write("ifil", ifilData));
    }
    writeSF2Info("isng", info.soundEngine);
    writeSF2Info("INAM", info.name);
    writeSF2Info("irom", info.romInfo);
    if (info.romVersion) {
        const ifilData = new IndexedByteArray(4);
        writeWord(ifilData, info.romVersion.major);
        writeWord(ifilData, info.romVersion.minor);
        infoArrays.push(RIFFChunk.write("iver", ifilData));
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
    const software = options.software;
    writeSF2Info("ISFT", software);

    // Do not write unchanged default modulators
    const unchangedDefaultModulators = bank.defaultModulators.some(
        (mod) =>
            !SPESSASYNTH_DEFAULT_MODULATORS.some((m) =>
                Modulator.isIdentical(m, mod, true)
            )
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

        infoArrays.push(RIFFChunk.write("DMOD", dmodData));
    }

    SpessaSynthGroupEnd();
    SpessaSynthInfo("%cWriting SDTA...", consoleColors.info);
    // Write sdta
    const smplStartOffsets: number[] = [];
    const smplEndOffsets: number[] = [];
    const sdtaChunk = getSDTA(bank, smplStartOffsets, smplEndOffsets);

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
    const pdtaChunk = RIFFChunk.writeParts(
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
            `%cWriting the xdta chunk as writeExtendedLimits is enabled and at least one condition was met.`,
            consoleColors.info,
            consoleColors.value
        );
        // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md
        infoArrays.push(
            RIFFChunk.writeParts(
                "xdta",
                chunks.map((c) => c.xdta),
                true
            )
        );
    }

    const infoChunk = RIFFChunk.writeParts("INFO", infoArrays, true);
    SpessaSynthInfo("%cWriting the output file...", consoleColors.info);
    // Finally, combine everything
    const main = RIFFChunk.writeParts("RIFF", [
        getStringBytes("sfbk"),
        infoChunk,
        sdtaChunk,
        pdtaChunk
    ]);
    SpessaSynthInfo(
        `%cSaved successfully! Final file size: %c${main.length}`,
        consoleColors.info,
        consoleColors.recognized
    );
    SpessaSynthGroupEnd();
    return main.buffer;
}
