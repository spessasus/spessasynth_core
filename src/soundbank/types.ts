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

export interface SoundBankInfoData {
    INAM: string;
    ICRD: string;
    IENG: string;
    IPRD: string;
    ICOP: string;
    ICMT: string;
    ISBJ: string;
    ifil: string;
    isng: string;
    iron: string;
    iver: string;
    ISFT: string;
    DMOD: string;
    LIST: IndexedByteArray;
}

export type SoundBankInfoFourCC = keyof SoundBankInfoData;
export type SoundBankInfo = Partial<SoundBankInfoData>;

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

// A function to track progress during writing.
export type ProgressFunction = (
    // The written sample name.
    sampleName: string,
    // The sample's index.
    sampleIndex: number,
    // The total sample count for progress displaying.
    sampleCount: number
) => Promise<unknown>;

// Options for writing a SoundFont2 file.
export interface SoundFont2WriteOptions {
    // If the soundfont should be compressed with a given function.
    compress: boolean;

    // The encode Vorbis function. It can be undefined if not compressed.
    compressionFunction?: SampleEncodingFunction;

    // The Vorbis compression quality (-0.1 to 1). This can be undefined if the compression is disabled.
    compressionQuality: number;

    // A function to show progress for writing large banks. It can be undefined.
    progressFunction?: ProgressFunction;

    // If the DMOD chunk should be written. Recommended.
    writeDefaultModulators: boolean;

    // If the XDTA chunk should be written to allow virtually infinite parameters. Recommended.
    writeExtendedLimits: boolean;

    // If an SF3 bank should be decompressed back to SF2. Not recommended.
    decompress: boolean;
}

// Returned structure containing extended SF2 chunks.
export interface ReturnedExtendedSf2Chunks {
    // The PDTA part of the chunk.
    pdta: IndexedByteArray;

    // The XDTA (https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md) part of the chunk.
    xdta: IndexedByteArray;

    // The highest index written (0 if not applicable). Used for determining whether the XDTA chunk is necessary.
    highestIndex: number;
}

// Options for writing a DLS file.
export interface DLSWriteOptions {
    // A function to show progress for writing large banks. It can be undefined.
    progressFunction?: ProgressFunction;
}

export interface KeyRange {
    min: number;
    max: number;
}
