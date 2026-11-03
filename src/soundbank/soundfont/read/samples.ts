import { IndexedByteArray } from "../../../utils/indexed_array";
import {
    readLittleEndianIndexed,
    signedInt8
} from "../../../utils/byte_functions/little_endian";
import { SpessaLog } from "../../../utils/loggin";
import { readBinaryStringIndexed } from "../../../utils/byte_functions/string";
import {
    BasicSample,
    getVorbisLength
} from "../../basic_soundbank/basic_sample";
import { ConsoleColors } from "../../../utils/other";
import type { SampleType } from "../../enums";
import type { RIFFChunk } from "../../../utils/riff_chunk";
import type { SoundBankLoadOptions } from "../../types";

/**
 * Samples.ts
 * purpose: parses soundfont samples
 */

export const SF3_BIT_FLAG = 0x10;

/**
 * A sample read from a SoundFont file.
 * The data is given by readSample, in the form the file stores it.
 */
export class SoundFontSample extends BasicSample {
    /**
     * Linked sample index for retrieving linked samples in sf2
     */
    public linkedSampleIndex: number;

    /**
     * Creates a sample
     * @param sampleName
     * @param sampleRate
     * @param samplePitch
     * @param samplePitchCorrection
     * @param linkedSampleIndex
     * @param sampleType
     * @param loopStart relative to the sample start, in sample points
     * @param loopEnd relative to the sample start, in sample points
     */
    public constructor(
        sampleName: string,
        sampleRate: number,
        samplePitch: number,
        samplePitchCorrection: number,
        linkedSampleIndex: number,
        sampleType: SampleType,
        loopStart: number,
        loopEnd: number
    ) {
        super(
            sampleName,
            sampleRate,
            samplePitch,
            samplePitchCorrection,
            sampleType,
            loopStart,
            loopEnd
        );
        this.linkedSampleIndex = linkedSampleIndex;
    }

    public getLinkedSample(samplesArray: BasicSample[]) {
        if (this.linkedSample || !this.isLinked) {
            return;
        }
        const linked = samplesArray[this.linkedSampleIndex];
        if (linked) {
            // Check for corrupted files (like FluidR3_GM.sf2 that link EVERYTHING to a single sample)
            if (linked.linkedSample) {
                SpessaLog.info(
                    `%cInvalid linked sample for ${this.name}: ${linked.name} is already linked to ${linked.linkedSample.name}`,
                    ConsoleColors.warn
                );
                this.unlinkSample();
            } else if (linked === this) {
                // Testcase: pc98_ym2608.sf2
                SpessaLog.info(
                    `%cInvalid linked sample for ${this.name}: linked to itself.`,
                    ConsoleColors.warn
                );
                this.unlinkSample();
            } else {
                this.setLinkedSample(linked, this.sampleType);
            }
        } else {
            // Log as info because it's common and not really dangerous
            SpessaLog.info(
                `%cInvalid linked sample for ${this.name}. Setting to mono.`,
                ConsoleColors.warn
            );
            this.unlinkSample();
        }
    }
}

/**
 * Reads the samples from the shdr chunk
 */
export function readSamples(
    sampleHeadersChunk: RIFFChunk,
    smplChunkData: IndexedByteArray | Float32Array,
    options: SoundBankLoadOptions,
    linkSamples = true
): SoundFontSample[] {
    const samples: SoundFontSample[] = [];
    while (
        sampleHeadersChunk.data.length > sampleHeadersChunk.data.currentIndex
    ) {
        samples.push(
            readSample(sampleHeadersChunk.data, smplChunkData, options)
        );
    }
    // Remove EOS
    samples.pop();

    // Link samples
    if (linkSamples) {
        for (const s of samples) s.getLinkedSample(samples);
    }

    return samples;
}

/**
 * Reads it into a sample
 */
function readSample(
    sampleHeaderData: IndexedByteArray,
    smplArrayData: IndexedByteArray | Float32Array,
    options: SoundBankLoadOptions
): SoundFontSample {
    // Read the sample name
    const sampleName = readBinaryStringIndexed(sampleHeaderData, 20);

    // Read the sample start index
    const sampleStartIndex = readLittleEndianIndexed(sampleHeaderData, 4) * 2;

    // Read the sample end index
    const sampleEndIndex = readLittleEndianIndexed(sampleHeaderData, 4) * 2;

    // Read the sample looping start index
    const sampleLoopStartIndex = readLittleEndianIndexed(sampleHeaderData, 4);

    // Read the sample looping end index
    const sampleLoopEndIndex = readLittleEndianIndexed(sampleHeaderData, 4);

    // Read the sample rate
    const sampleRate = readLittleEndianIndexed(sampleHeaderData, 4);

    // Read the original sample pitch
    let samplePitch = sampleHeaderData[sampleHeaderData.currentIndex++];
    if (samplePitch > 127) {
        // If it's out of range, then default to 60
        samplePitch = 60;
    }

    // Read the sample pitch correction
    const samplePitchCorrection = signedInt8(
        sampleHeaderData[sampleHeaderData.currentIndex++]
    );

    // Read the link to the other channel
    const sampleLink = readLittleEndianIndexed(sampleHeaderData, 2);
    let sampleType = readLittleEndianIndexed(sampleHeaderData, 2) as SampleType;

    // Read sf3
    // https://github.com/FluidSynth/fluidsynth/wiki/SoundFont3Format
    const compressed = (sampleType & SF3_BIT_FLAG) > 0;
    // Remove the compression flag
    sampleType = (sampleType & ~SF3_BIT_FLAG) as SampleType;

    // Three data types in:
    // SF2 (s16le)
    // SF3 (vorbis)
    // SF2Pack (entire smpl vorbis)
    const isFloat = !(smplArrayData instanceof IndexedByteArray);
    // SF3 loop points are already relative to the sample start
    const relativeLoops = compressed && !isFloat;
    const sample = new SoundFontSample(
        sampleName,
        sampleRate,
        samplePitch,
        samplePitchCorrection,
        sampleLink,
        sampleType,
        relativeLoops
            ? sampleLoopStartIndex
            : sampleLoopStartIndex - sampleStartIndex / 2,
        relativeLoops
            ? sampleLoopEndIndex
            : sampleLoopEndIndex - sampleStartIndex / 2
    );

    if (isFloat) {
        // Float32 array from SF2pack, decoded during load time
        if (options.sampleData) {
            const range = [sampleStartIndex / 2, sampleEndIndex / 2] as const;
            sample.setStoredData({
                form: "float32",
                data: options.copySampleData
                    ? smplArrayData.slice(...range)
                    : smplArrayData.subarray(...range)
            });
        } else {
            sample.setLengthWithoutData(
                (sampleEndIndex - sampleStartIndex) / 2,
                "float32"
            );
        }
        return sample;
    }

    const smplStart = smplArrayData.currentIndex;
    // Compressed offsets are in bytes, PCM in sample points
    const start =
        smplStart + (compressed ? sampleStartIndex / 2 : sampleStartIndex);
    const end = smplStart + (compressed ? sampleEndIndex / 2 : sampleEndIndex);
    // A view does not copy, it is only read here or kept when copying is off
    const view = smplArrayData.subarray(start, end);
    if (!options.sampleData) {
        if (compressed) {
            sample.setLengthWithoutData(getVorbisLength(view) ?? 0, "vorbis");
        } else {
            sample.setLengthWithoutData(view.length >> 1, "s16le");
        }
        return sample;
    }
    const data = options.copySampleData ? view.slice() : view;
    // The data is written back unchanged when saving
    sample.setStoredData(
        compressed ? { form: "vorbis", data } : { form: "s16le", data }
    );
    return sample;
}
