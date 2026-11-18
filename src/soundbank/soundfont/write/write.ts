import { IndexedByteArray } from "../../../utils/indexed_array";
import { RIFFChunk } from "../../../utils/riff_chunk";
import {
    getStringBytes,
    writeBinaryStringIndexed
} from "../../../utils/byte_functions/string";
import { ConsoleColors } from "../../../utils/other";
import { getSDTA } from "./sdta";
import { getSHDR } from "./shdr";
import {
    writeDword,
    writeLittleEndianIndexed,
    writeWord
} from "../../../utils/byte_functions/little_endian";
import { SpessaLog } from "../../../utils/loggin";
import { MOD_BYTE_SIZE, XMOD_BYTE_SIZE } from "../../basic_soundbank/modulator";
import type { ModulatorCurve } from "../../basic_soundbank/modulator_curve";
import type {
    ProgressFunction,
    SF2InfoFourCC,
    SFeWriteOptions,
    SoundFont2WriteOptions
} from "../../types";
import type { BasicSoundBank } from "../../basic_soundbank/basic_soundbank";
import type { ExtendedSF2Chunks, SoundFontWriteFormat } from "./types";
import { writeSF2Elements } from "./write_sf2_elements";
import { toISODateString } from "../../../utils/date";
import {
    sf2NeedsDefaultModulators,
    toSF2Modulators
} from "../sf2_compatibility";

export const DEFAULT_SF2_WRITE_OPTIONS: SoundFont2WriteOptions = {
    writeDefaultModulators: true,
    writeExtendedLimits: true,
    software: "SpessaSynth" // ( ͡° ͜ʖ ͡°)
};

export const DEFAULT_SFE_WRITE_OPTIONS: SFeWriteOptions = {
    rf64: false,
    software: "SpessaSynth" // ( ͡° ͜ʖ ͡°)
};

/**
 * General writing function for both SFe and SF2.
 * @param bank the bank
 * @param format the format to write.
 * @param software software param
 * @param writeDefaultModulators SFe + SF2 compatible
 * @param writeExtendedLimits SFe + SF2 compatible
 * @param rf64 SFe Only
 * @param progressFunction called after each written sample
 * @internal
 */
export function writeSF(
    bank: BasicSoundBank,
    format: SoundFontWriteFormat,
    software: string,
    writeDefaultModulators: boolean,
    writeExtendedLimits: boolean,
    rf64: boolean,
    progressFunction?: ProgressFunction
) {
    const isSFe = format === "sfe";
    SpessaLog.groupCollapsed("%cSaving soundbank...", ConsoleColors.info);
    SpessaLog.group("%cWriting INFO...", ConsoleColors.info);
    /**
     * Write INFO
     */
    const infoArrays: Uint8Array[] = [];

    const writeSF2Info = (type: SF2InfoFourCC, data?: string) => {
        if (data === undefined) return;

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
        // The version follows what is written, not what was loaded:
        // 4.0 for SFe, 3.0 with compressed samples, 2.4 otherwise
        const ifilData = new IndexedByteArray(4);
        const major = isSFe
            ? 4
            : bank.samples.some((s) => s.isCompressed)
              ? 3
              : 2;
        writeWord(ifilData, major);
        writeWord(ifilData, major === 2 ? 4 : 0);
        infoArrays.push(RIFFChunk.write("ifil", ifilData, rf64));
    }
    // The spec requires isng. An SFe bank is made for the SFe 4 engine
    writeSF2Info("isng", isSFe ? "SFe 4" : (info.soundEngine ?? "EMU8000"));
    // The spec requires INAM, even if the name is empty
    writeSF2Info("INAM", info.name ?? "");
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
    const commentText = info.subject
        ? (info.comment ? info.comment + "\n" : "") + info.subject
        : info.comment;
    writeSF2Info("ICMT", commentText);
    writeSF2Info("ISFT", software);

    // SFe always writes its list
    const writeDMOD =
        writeDefaultModulators && (isSFe || sf2NeedsDefaultModulators(bank));

    // SFe custom curves: the bank's list, in order
    const curves = isSFe ? bank.customCurves : [];
    let curveIndex: ((curve: ModulatorCurve) => number) | undefined;
    if (isSFe) {
        const indexes = new Map<ModulatorCurve, number>();
        for (const [i, curve] of curves.entries()) {
            if (curve.points.length > 0xff_ff) {
                throw new Error(
                    `The custom curve "${curve.toString()}" has too many points: ${curve.points.length}, the maximum is 65535.`
                );
            }
            indexes.set(curve, i);
        }
        curveIndex = (curve: ModulatorCurve) => {
            const index = indexes.get(curve);
            if (index === undefined) {
                throw new Error(
                    `The custom curve "${curve.toString()}" is used by a modulator but is not in the bank's customCurves.`
                );
            }
            return index;
        };
    }

    if (writeDMOD) {
        const mods = isSFe
            ? bank.defaultModulators.filter((m) => !m.isMissingCurve)
            : toSF2Modulators(bank.defaultModulators);
        SpessaLog.info(
            `%cWriting %c${mods.length}%c default modulators...`,
            ConsoleColors.info,
            ConsoleColors.recognized,
            ConsoleColors.info
        );
        const dmodSize = MOD_BYTE_SIZE + mods.length * MOD_BYTE_SIZE;
        const dmodData = new IndexedByteArray(dmodSize);
        for (const mod of mods) {
            mod.write(dmodData, undefined, isSFe);
        }

        // Terminal modulator, is zero
        writeLittleEndianIndexed(dmodData, 0, MOD_BYTE_SIZE);

        infoArrays.push(...RIFFChunk.getParts("DMOD", [dmodData], rf64));

        // SFe: the extended records of DMOD, one per modulator with the flag (a custom curve), then the terminal
        const customMods = mods.filter((m) => m.usesCustomCurve);
        if (curveIndex && customMods.length > 0) {
            const xmodData = new IndexedByteArray(
                (customMods.length + 1) * XMOD_BYTE_SIZE
            );
            for (const mod of customMods)
                mod.writeExtended(xmodData, curveIndex);
            infoArrays.push(...RIFFChunk.getParts("XMOD", [xmodData], rf64));
        }
    }

    if (curves.length > 0) {
        SpessaLog.info(
            `%cWriting %c${curves.length}%c custom curves...`,
            ConsoleColors.info,
            ConsoleColors.recognized,
            ConsoleColors.info
        );
        const size =
            4 + curves.reduce((sum, c) => sum + 42 + c.points.length * 4, 0);
        const curvData = new IndexedByteArray(size);
        writeDword(curvData, curves.length);
        for (const c of curves) {
            writeBinaryStringIndexed(curvData, c.name, 40);
            writeWord(curvData, c.points.length);
            for (const p of c.points) {
                writeWord(curvData, p.x);
                writeWord(curvData, p.y);
            }
        }
        infoArrays.push(...RIFFChunk.getParts("CURV", [curvData], rf64));
    }

    SpessaLog.groupEnd();
    SpessaLog.info("%cWriting SDTA...", ConsoleColors.info);
    // Write sdta
    const smplStartOffsets: number[] = [];
    const smplEndOffsets: number[] = [];
    const sdtaChunk = getSDTA(
        bank,
        smplStartOffsets,
        smplEndOffsets,
        rf64,
        progressFunction
    );

    SpessaLog.info("%cWriting PDTA...", ConsoleColors.info);
    // Write pdta
    SpessaLog.info("%cWriting SHDR...", ConsoleColors.info);
    const shdrChunk = getSHDR(bank, smplStartOffsets, smplEndOffsets, rf64);

    // Note:
    // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md

    SpessaLog.group("%cWriting instruments...", ConsoleColors.info);
    const instData = writeSF2Elements(bank, format, rf64, false, curveIndex);
    SpessaLog.groupEnd();

    SpessaLog.group("%cWriting presets...", ConsoleColors.info);
    const presData = writeSF2Elements(bank, format, rf64, true, curveIndex);
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
            ConsoleColors.info
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
            getStringBytes(isSFe ? "sfen" : "sfbk"),
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
