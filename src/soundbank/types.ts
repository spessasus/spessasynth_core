import type { BasicSoundBank } from "./basic_soundbank/basic_soundbank";
import type { Generator } from "./basic_soundbank/generator";
import { Modulator } from "./basic_soundbank/modulator";
import type { BasicSample } from "./basic_soundbank/basic_sample";
import type { IndexedByteArray } from "../utils/indexed_array";
import type { MIDIController } from "../midi/enums";
import type { ModulatorSourceEnum } from "./enums";

export interface SoundBankManagerListEntry {
    id: string;
    soundBank: BasicSoundBank;
    bankOffset: number;
}

export interface SF2VersionTag {
    major: number;
    minor: number;
}

export type GenericBankInfoFourCC =
    | "INAM"
    | "ICRD"
    | "IENG"
    | "IPRD"
    | "ICOP"
    | "ICMT"
    | "ISFT";

export type SF2InfoFourCC =
    | GenericBankInfoFourCC
    | "ifil"
    | "isng"
    | "irom"
    | "iver"
    | "DMOD"
    | "LIST";

export type SF2ChunkFourCC =
    | "pdta"
    | "xdta"
    | "sdta"
    | "smpl"
    | "sm24"
    | "phdr"
    | "pbag"
    | "pmod"
    | "pgen"
    | "inst"
    | "ibag"
    | "imod"
    | "igen"
    | "shdr";

export type DLSInfoFourCC = GenericBankInfoFourCC | "ISBJ";

export type DLSChunkFourCC =
    | "dls "
    | "dlid"
    | "cdl "
    | "ptbl"
    | "vers"
    | "colh"
    | "wvpl"
    | "wsmp"
    | "data"
    | "lart"
    | "lar2"
    | "art2"
    | "art1"
    | "lrgn"
    | "rgnh"
    | "wlnk"
    | "lins"
    | "ins "
    | "insh"
    | "rgn2";

export interface SoundBankInfoData {
    /**
     * Name.
     */
    name: string;
    /**
     * The sound bank's version.
     */
    version: SF2VersionTag;
    /**
     * Creation date.
     */
    creationDate: Date;
    /**
     * Sound engine.
     */
    soundEngine: string;
    /**
     * Author.
     */
    engineer?: string;
    /**
     * Product.
     */
    product?: string;
    /**
     * Copyright.
     */
    copyright?: string;
    /**
     * Comment.
     */
    comment?: string;
    /**
     * Subject.
     */
    subject?: string;
    /**
     * ROM information.
     */
    romInfo?: string;
    /**
     * Software used to edit the file.
     */
    software?: string;
    /**
     * A tag that only applies to SF2 and will usually be undefined.
     */
    romVersion?: SF2VersionTag;
}

export type SoundBankInfoFourCC = keyof SoundBankInfoData;

export interface SampleAndGenerators {
    instrumentGenerators: Generator[];
    presetGenerators: Generator[];
    modulators: Modulator[];
    sample: BasicSample;
}

export type SampleEncodingFunction = (
    audioData: Float32Array,
    sampleRate: number
) => Promise<Uint8Array>;

export type ModulatorNumericBool = 0 | 1;
export type ModulatorSource = ModulatorSourceEnum | MIDIController;

/**
 * A function to track progress during writing.
 */
export type ProgressFunction = (
    /**
     * The written sample name.
     */
    sampleName: string,
    /**
     * The sample's index.
     */
    sampleIndex: number,
    /**
     * The total sample count for progress displaying.
     */
    sampleCount: number
) => Promise<unknown>;

/**
 * Options for writing a SoundFont2 file.
 */
export interface SoundFont2WriteOptions {
    /**
     * If the soundfont should be compressed with a given function.
     */
    compress: boolean;

    /**
     * The encode Vorbis function. It can be undefined if not compressed.
     */
    compressionFunction?: SampleEncodingFunction;

    /**
     * The Vorbis compression quality (-0.1 to 1). This can be undefined if the compression is disabled.
     */
    compressionQuality: number;

    /**
     * A function to show progress for writing large banks. It can be undefined.
     */
    progressFunction?: ProgressFunction;

    /**
     * If the DMOD chunk should be written. Recommended.
     */
    writeDefaultModulators: boolean;

    /**
     * If the XDTA chunk should be written to allow virtually infinite parameters. Recommended.
     */
    writeExtendedLimits: boolean;

    /**
     * If an SF3 bank should be decompressed back to SF2. Not recommended.
     */
    decompress: boolean;
}

/**
 * Returned structure containing extended SF2 chunks.
 */
export interface ReturnedExtendedSf2Chunks {
    /**
     * The PDTA part of the chunk.
     */
    pdta: IndexedByteArray;

    /**
     * The XDTA (https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md) part of the chunk.
     */
    xdta: IndexedByteArray;

    /**
     * The highest index written (0 if not applicable). Used for determining whether the XDTA chunk is necessary.
     */
    highestIndex: number;
}

/**
 * Options for writing a DLS file.
 */
export interface DLSWriteOptions {
    /**
     * A function to show progress for writing large banks. It can be undefined.
     */
    progressFunction?: ProgressFunction;
}

export interface KeyRange {
    min: number;
    max: number;
}
