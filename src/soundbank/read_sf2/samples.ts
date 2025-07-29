import { IndexedByteArray } from "../../utils/indexed_array";
import { readLittleEndian, signedInt8 } from "../../utils/byte_functions/little_endian";
import { SpessaSynthInfo, SpessaSynthWarn } from "../../utils/loggin";
import { readBytesAsString } from "../../utils/byte_functions/string";
import { BasicSample } from "../basic_soundbank/basic_sample";
import { consoleColors } from "../../utils/other";
import type { SampleType } from "../enums";
import type { RIFFChunk } from "../basic_soundbank/riff_chunk";

/**
 * samples.js
 * purpose: parses soundfont samples
 */

export const SF3_BIT_FLIT = 0x10;

export class SoundFontSample extends BasicSample {
    /**
     * Linked sample index for retrieving linked samples in sf2
     */
    public linkedSampleIndex: number;

    /**
     * The sliced sample from the smpl chunk
     */
    protected s16leData: Uint8Array | undefined = undefined;

    protected startByteOffset: number;

    protected endByteOffset: number;

    protected sampleID: number;

    /**
     * Creates a sample
     * @param sampleName
     * @param sampleStartIndex
     * @param sampleEndIndex
     * @param sampleLoopStartIndex
     * @param sampleLoopEndIndex
     * @param sampleRate
     * @param samplePitch
     * @param samplePitchCorrection
     * @param linkedSampleIndex
     * @param sampleType
     * @param sampleDataArray
     * @param sampleIndex initial sample index when loading the sfont
     * Used for SF2Pack support
     */
    public constructor(
        sampleName: string,
        sampleStartIndex: number,
        sampleEndIndex: number,
        sampleLoopStartIndex: number,
        sampleLoopEndIndex: number,
        sampleRate: number,
        samplePitch: number,
        samplePitchCorrection: number,
        linkedSampleIndex: number,
        sampleType: SampleType,
        sampleDataArray: IndexedByteArray | Float32Array,
        sampleIndex: number
    ) {
        // read sf3
        // https://github.com/FluidSynth/fluidsynth/wiki/SoundFont3Format
        const compressed = (sampleType & SF3_BIT_FLIT) > 0;
        // remove the compression flag
        sampleType &= ~SF3_BIT_FLIT;
        super(
            sampleName,
            sampleRate,
            samplePitch,
            samplePitchCorrection,
            sampleType as SampleType,
            sampleLoopStartIndex - sampleStartIndex / 2,
            sampleLoopEndIndex - sampleStartIndex / 2
        );
        this.dataOverridden = false;
        this.name = sampleName;
        // in bytes
        this.startByteOffset = sampleStartIndex;
        this.endByteOffset = sampleEndIndex;
        this.sampleID = sampleIndex;
        const smplStart =
            sampleDataArray instanceof IndexedByteArray
                ? sampleDataArray.currentIndex
                : 0;

        // three data types in:
        // SF2 (s16le)
        // SF3 (vorbis)
        // SF2Pack (entire smpl vorbis)
        if (sampleDataArray instanceof IndexedByteArray) {
            if (compressed) {
                // correct loop points
                this.loopStart += this.startByteOffset / 2;
                this.loopEnd += this.startByteOffset / 2;

                // copy the compressed data, it can be preserved during writing
                this.setCompressedData(
                    sampleDataArray.slice(
                        this.startByteOffset / 2 + smplStart,
                        this.endByteOffset / 2 + smplStart
                    )
                );
            } else {
                // regular sf2 s16le
                this.s16leData = sampleDataArray.slice(
                    smplStart + this.startByteOffset,
                    smplStart + this.endByteOffset
                );
            }
        } else {
            // float32 array from SF2pack, copy directly
            this.setAudioData(
                sampleDataArray.slice(
                    this.startByteOffset / 2,
                    this.endByteOffset / 2
                ),
                sampleRate
            );
        }
        this.linkedSampleIndex = linkedSampleIndex;
    }

    public getLinkedSample(samplesArray: BasicSample[]) {
        if (this.linkedSample || !this.isLinked) {
            return;
        }
        const linked = samplesArray[this.linkedSampleIndex];
        if (!linked) {
            // log as info because it's common and not really dangerous
            SpessaSynthInfo(
                `%cInvalid linked sample for ${this.name}. Setting to mono.`,
                consoleColors.warn
            );
            this.unlinkSample();
        } else {
            // check for corrupted files (like FluidR3_GM.sf2 that link EVERYTHING to a single sample)
            if (linked.linkedSample) {
                SpessaSynthInfo(
                    `%cInvalid linked sample for ${this.name}: Already linked to ${linked.linkedSample.name}`,
                    consoleColors.warn
                );
                this.unlinkSample();
            } else {
                this.setLinkedSample(linked, this.sampleType);
            }
        }
    }

    /**
     * Loads the audio data and stores it for reuse
     * @returns  The audio data
     */
    public getAudioData(): Float32Array {
        if (this.audioData) {
            return this.audioData;
        }
        // SF2Pack is decoded during load time
        // SF3 is decoded in BasicSample
        if (this.isCompressed) {
            return super.getAudioData();
        }
        if (!this.s16leData) {
            console.error(this);
            throw new Error("Unexpected lack of audio data.");
        }

        // start loading data if it is not loaded
        const byteLength = this.endByteOffset - this.startByteOffset;
        if (byteLength < 1) {
            SpessaSynthWarn(
                `Invalid sample ${this.name}! Invalid length: ${byteLength}`
            );
            return new Float32Array(1);
        }

        // SF2
        // read the sample data
        const audioData = new Float32Array(byteLength / 2);
        const convertedSigned16 = new Int16Array(this.s16leData.buffer);

        // convert to float
        for (let i = 0; i < convertedSigned16.length; i++) {
            audioData[i] = convertedSigned16[i] / 32768;
        }

        this.audioData = audioData;
        return audioData;
    }

    public getRawData(allowVorbis: boolean): Uint8Array {
        if (this.dataOverridden || this.compressedData) {
            // return vorbis or encode manually
            return super.getRawData(allowVorbis);
        }
        // copy the smpl directly
        return this.s16leData ?? new Uint8Array(0);
    }
}

/**
 * Reads the samples from the shdr chunk
 */
export function readSamples(
    sampleHeadersChunk: RIFFChunk,
    smplChunkData: IndexedByteArray | Float32Array,
    linkSamples = true
): SoundFontSample[] {
    const samples: SoundFontSample[] = [];
    let index = 0;
    while (
        sampleHeadersChunk.chunkData.length >
        sampleHeadersChunk.chunkData.currentIndex
    ) {
        const sample = readSample(
            index,
            sampleHeadersChunk.chunkData,
            smplChunkData
        );
        samples.push(sample);
        index++;
    }
    // remove EOS
    samples.pop();

    // link samples
    if (linkSamples) {
        samples.forEach((s) => s.getLinkedSample(samples));
    }

    return samples;
}

/**
 * Reads it into a sample
 */
function readSample(
    index: number,
    sampleHeaderData: IndexedByteArray,
    smplArrayData: IndexedByteArray | Float32Array
): SoundFontSample {
    // read the sample name
    const sampleName = readBytesAsString(sampleHeaderData, 20);

    // read the sample start index
    const sampleStartIndex = readLittleEndian(sampleHeaderData, 4) * 2;

    // read the sample end index
    const sampleEndIndex = readLittleEndian(sampleHeaderData, 4) * 2;

    // read the sample looping start index
    const sampleLoopStartIndex = readLittleEndian(sampleHeaderData, 4);

    // read the sample looping end index
    const sampleLoopEndIndex = readLittleEndian(sampleHeaderData, 4);

    // read the sample rate
    const sampleRate = readLittleEndian(sampleHeaderData, 4);

    // read the original sample pitch
    let samplePitch = sampleHeaderData[sampleHeaderData.currentIndex++];
    if (samplePitch > 127) {
        // if it's out of range, then default to 60
        samplePitch = 60;
    }

    // read the sample pitch correction
    const samplePitchCorrection = signedInt8(
        sampleHeaderData[sampleHeaderData.currentIndex++]
    );

    // read the link to the other channel
    const sampleLink = readLittleEndian(sampleHeaderData, 2);
    const sampleType = readLittleEndian(sampleHeaderData, 2) as SampleType;

    return new SoundFontSample(
        sampleName,
        sampleStartIndex,
        sampleEndIndex,
        sampleLoopStartIndex,
        sampleLoopEndIndex,
        sampleRate,
        samplePitch,
        samplePitchCorrection,
        sampleLink,
        sampleType,
        smplArrayData,
        index
    );
}
