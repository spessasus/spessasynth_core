import { Modulator } from "./basic_soundbank/modulator";
import type { BasicSample } from "./basic_soundbank/basic_sample";
import type { MIDIController } from "../midi/enums";
import type { ModulatorControllerSource } from "./enums";
import type { WAVFourCC } from "../utils/riff_chunk";
import type { MIDIPatchFull } from "./basic_soundbank/midi_patch";

export interface SF2Channel {
    /**
     * All MIDI controller values for modulation.
     */
    midiControllers: Int16Array;

    /**
     * Poly Pressures for all 128 notes.
     */
    polyPressures: Uint8Array;

    /**
     * Other MIDI parameters.
     */
    midiParameters: {
        /**
         * Channel Pressure.
         */
        pressure: number;

        /**
         * 0-16,383
         */
        pitchWheel: number;

        /**
         * Semitones, can be a floating point number.
         */
        pitchWheelRange: number;
    };
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

/**
 * Metadata object representing information associated with a {@link BasicSoundBank}.
 *
 * @group Sound Banks
 */
export interface SoundBankInfoData {
    /**
     * The sound bank's name.
     */
    name: string;
    /**
     * The sound bank's version.
     */
    version: SF2VersionTag;
    /**
     * The creation date of this sound bank.
     *
     * > **Note**
     * >
     * > If the date text is invalid, the current date will be used instead.
     * > If you have a valid date in your sound bank, and it still fails to parse, please open an issue!
     */
    creationDate: Date;
    /**
     * The target sound engine of this sound bank.
     */
    soundEngine: string;
    /**
     * The engineer (creator) of the sound bank.
     */
    engineer?: string;
    /**
     * The product information associated with the sound bank.
     */
    product?: string;
    /**
     * The copyright information associated with the sound bank.
     */
    copyright?: string;
    /**
     * The comment for this sound bank, usually the description.
     */
    comment?: string;
    /**
     * Name of the last software used to edit the file.
     */
    software?: string;
    /**
     * The subject of the file. This only appears in DLS files.
     */
    subject?: string;
    /**
     * ROM information. SF2 only and will usually not be present.
     */
    romInfo?: string;
    /**
     * ROM version information. SF2 only and will usually not be present.
     */
    romVersion?: SF2VersionTag;
}

export type SoundBankInfoFourCC = keyof SoundBankInfoData;

export interface VoiceParameters {
    generators: Int16Array;
    modulators: Modulator[];
    sample: BasicSample;
}

/**
 * This function is used to compress/encode a {@link BasicSample}.
 * The function is recommended to be asynchronous.
 *
 *  > **Note**
 * > Using a custom function allows for using *any* type of compression for the SF3 soundBank.
 * > This is allowed by the [RFC describing SF3 spec](https://github.com/FluidSynth/fluidsynth/wiki/SoundFont3Format),
 * > but SpessaSynth can only read Ogg Vorbis compression.
 *
 * @param audioData The PCM sample data.
 * @param sampleRate The sample rate in Hertz.
 * @returns `Uint8Array` containing the compressed audio data (a complete container).
 *
 * @group Sound Banks.Samples
 */
export type SampleEncodingFunction = (
    audioData: Float32Array,
    sampleRate: number
) => Promise<Uint8Array>;

export type ModulatorSourceIndex = ModulatorControllerSource | MIDIController;

/**
 * A function to track progress during writing.
 * @param progress Estimated progress, from 0 to 1.
 *
 * @group Sound Banks.Writing
 */
export type ProgressFunction = (progress: number) => unknown;

/**
 * Options for changing the {@link BasicSoundBank}'s sample format.
 *
 * @group Sound Banks.Samples
 */
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
           * It must be provided if `compressed` format is chosen.
           */
          compressionFunction: SampleEncodingFunction;
      }
);

/**
 * Options for writing a sound bank file.
 *
 * @group Sound Banks.Writing
 */
export interface SoundBankWriteOptions {
    /**
     * The `ISFT` field to set when writing. If unset, `SpessaSynth` is written.
     * This field indicates the last software that was used to edit this sound bank.
     */
    software: string;

    /**
     * A function to allow showing progress long operations. It can be undefined.
     */
    progressFunction?: ProgressFunction;
}

/**
 * Options for writing a SoundFont2/3 file.
 *
 * @group Sound Banks.Writing
 */
export interface SoundFont2WriteOptions extends SoundBankWriteOptions {
    /**
     * If the DMOD chunk should be written. Recommended.
     * > **Note**
     * >
     * > The chunk will only be written if the modulators are unchanged.
     */
    writeDefaultModulators: boolean;

    /**
     * If the XDTA chunk should be written to allow virtually infinite parameters. Recommended.
     *
     * > **Note**
     * >
     * > The chunk will only be written if needed.
     */
    writeExtendedLimits: boolean;
}

/**
 * Options for writing an SFE 4 file.
 *
 * @group Sound Banks.Writing
 */
export interface SFEWriteOptions extends SoundBankWriteOptions {
    /**
     * If the RIFS (64-bit RIFF chunks) should be used.
     * Increases maximum size from 4GB to effectively infinite.
     * Recommended, since SFE 4 is effectively incompatible with SF2.
     */
    rf64: boolean;
}

/**
 * A simple range interface.
 *
 * @group Sound Banks.Zones
 */
export interface GenericRange {
    /**
     * The minimum value.
     */
    min: number;
    /**
     * The maximum value.
     */

    max: number;
}

/**
 * - Key - the preset.
 * - Value - A Map:
 *   - Key: The MIDI note number.
 *   - Value: A set of all velocities this key was pressed with.
 *
 * @group MIDI.Protocol
 */
export type PresetsWithKeyCombinations<T extends MIDIPatchFull> = Map<
    T,
    Map<number, Set<number>>
>;
/**
 * One of the General MIDI systems.
 *
 * > **Tip**
 * >
 * > Consider reading the [MIDI Implementation](../../docs/extra/midi-implementation.md)
 * to learn more about these systems.
 *
 * @group MIDI.Protocol
 */
export type MIDISystem = "gm" | "gm2" | "gs" | "xg";
