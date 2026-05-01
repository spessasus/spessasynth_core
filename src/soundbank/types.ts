import type { BasicSoundBank } from "./basic_soundbank/basic_soundbank";
import { Modulator } from "./basic_soundbank/modulator";
import type { BasicSample } from "./basic_soundbank/basic_sample";
import type { MIDIController } from "../midi/enums";
import type { DLSLoopType, ModulatorSourceEnum } from "./enums";
import type { WAVFourCC } from "../utils/riff_chunk";

export interface SoundBankManagerListEntry {
    /**
     * The unique string identifier of the sound bank.
     */
    id: string;
    /**
     * The sound bank itself.
     */
    soundBank: BasicSoundBank;
    /**
     * The bank MSB offset for this sound bank.
     */
    bankOffset: number;
}

export interface SF2VersionTag {
    /**
     * The major revision number of the sound bank.
     */
    major: number;
    /**
     * The minor revision number of this sound bank.
     */
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
    | WAVFourCC
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
    | "rgn "
    | "rgn2"
    // Proprietary MobileBAE instrument aliasing chunk
    | "pgal";

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

export interface VoiceParameters {
    generators: Int16Array;
    modulators: Modulator[];
    sample: BasicSample;
}

export type SampleEncodingFunction = (
    audioData: Float32Array,
    sampleRate: number
) => Promise<Uint8Array>;

export type ModulatorSourceIndex = ModulatorSourceEnum | MIDIController;

/**
 * A function to track progress during writing.
 */
export type ProgressFunction = (
    /**
     * Estimated progress, from 0 to 1.
     */
    progress: number
) => unknown;

export type SetSampleFormatOptions = {
    /**
     * A function to show progress for compressing. It can be undefined.
     */
    progressFunction?: ProgressFunction;
} & (
    | {
          /**
           * The sample format to use.
           * - `pcm` - decompresses the sound bank and changes its version to `2.04` (SF2)
           * - `compressed` - compresses the sound bank with a given function and changes its version to `3.0` (SF3)
           *
           * Note that decompressing usually results in permanent sample quality loss!
           */
          format: "pcm";
      }
    | {
          /**
           * The sample format to use.
           * - `pcm` - decompresses the sound bank and changes its version to `2.04` (SF2)
           * - `compressed` - compresses the sound bank with a given function and changes its version to `3.0` (SF3)
           *
           * Note that decompressing usually results in permanent sample quality loss!
           */
          format: "compressed";

          /**
           * The function for compressing samples.
           */
          compressionFunction: SampleEncodingFunction;
      }
);

interface SoundBankWriteOptions {
    /**
     * The `ISFT` field to set when writing. If unset, `SpessaSynth` is written.
     * This field indicates the last software that was used to edit this sound bank.
     */
    software: string;

    /**
     * A function for long operations. It can be undefined.
     */
    progressFunction?: ProgressFunction;
}

/**
 * Options for writing a SoundFont2 file.
 */
export interface SoundFont2WriteOptions extends SoundBankWriteOptions {
    /**
     * If the DMOD chunk should be written. Recommended.
     * Note that it will only be written if the modulators are unchanged.
     */
    writeDefaultModulators: boolean;

    /**
     * If the XDTA chunk should be written to allow virtually infinite parameters. Recommended.
     * Note that it will only be written needed.
     */
    writeExtendedLimits: boolean;
}

/**
 * Options for writing a DLS file.
 */
export type DLSWriteOptions = SoundBankWriteOptions;

export interface GenericRange {
    min: number;
    max: number;
}

export interface DLSLoop {
    loopType: DLSLoopType;
    /*
    Specifies the start point of the loop in samples as an absolute offset from the beginning of the
    data in the <data-ck> subchunk of the <wave-list> wave file chunk.
     */
    loopStart: number;
    /*
    Specifies the length of the loop in samples.
     */
    loopLength: number;
}
