import { SpessaSynthWarn } from "../../utils/loggin";
import { IndexedByteArray } from "../../utils/indexed_array";
import { stbvorbis } from "../../externals/stbvorbis_sync/stbvorbis_wrapper";
import { type SampleType, sampleTypes } from "../enums";
import type { BasicInstrument } from "./basic_instrument";
import type { SampleEncodingFunction } from "../types";

// should be reasonable for most cases
const RESAMPLE_RATE = 48000;

export class BasicSample {
    /**
     * The sample's name.
     */
    public name: string;

    /**
     * Sample rate in Hz.
     */
    public sampleRate: number;

    /**
     * Original pitch of the sample as a MIDI note number.
     */
    public originalKey: number;

    /**
     * Pitch correction, in cents. Can be negative.
     */
    public pitchCorrection: number;

    /**
     * Linked sample, unused if mono.
     */
    public linkedSample: BasicSample | undefined;

    /**
     * The type of the sample.
     */
    public sampleType: SampleType;

    /**
     * Relative to the start of the sample in sample points.
     */
    public loopStart: number;

    /**
     * Relative to the start of the sample in sample points.
     */
    public loopEnd: number;
    /**
     * Sample's linked instruments (the instruments that use it)
     * note that duplicates are allowed since one instrument can use the same sample multiple times.
     */
    public linkedTo: BasicInstrument[] = [];
    /**
     * Indicates if the data was overridden, so it cannot be copied back unchanged.
     */
    protected dataOverridden: boolean = true;
    /**
     * The compressed sample data if the sample has been compressed.
     */
    protected compressedData: Uint8Array | undefined;
    /**
     * The sample's audio data.
     */
    protected audioData: Float32Array | undefined;

    /**
     * The basic representation of a sample
     * @param sampleName The sample's name
     * @param sampleRate The sample's rate in Hz
     * @param originalKey The sample's pitch as a MIDI note number
     * @param pitchCorrection The sample's pitch correction in cents
     * @param sampleType The sample's type, an enum that can indicate SF3
     * @param loopStart The sample's loop start relative to the sample start in sample points
     * @param loopEnd The sample's loop end relative to the sample start in sample points
     */
    public constructor(
        sampleName: string,
        sampleRate: number,
        originalKey: number,
        pitchCorrection: number,
        sampleType: SampleType,
        loopStart: number,
        loopEnd: number
    ) {
        this.name = sampleName;
        this.sampleRate = sampleRate;
        this.originalKey = originalKey;
        this.pitchCorrection = pitchCorrection;
        this.loopStart = loopStart;
        this.loopEnd = loopEnd;
        this.sampleType = sampleType;
    }

    /**
     * Indicates if the sample is compressed using vorbis SF3
     */
    public get isCompressed(): boolean {
        return this.compressedData !== undefined;
    }

    /**
     * If the sample is linked to another sample
     */
    public get isLinked(): boolean {
        return (
            this.sampleType === sampleTypes.rightSample ||
            this.sampleType === sampleTypes.leftSample ||
            this.sampleType === sampleTypes.linkedSample
        );
    }

    /**
     * The sample's use count
     */
    public get useCount() {
        return this.linkedTo.length;
    }

    /**
     * Get raw data for writing the file
     * @param allowVorbis if vorbis file data is allowed
     * @return either s16 or vorbis data
     */
    public getRawData(allowVorbis: boolean): Uint8Array {
        if (this.compressedData && allowVorbis && !this.dataOverridden) {
            return this.compressedData;
        }
        return this.encodeS16LE();
    }

    // resamples the audio data to a given sample rate
    public resampleData(newSampleRate: number) {
        let audioData = this.getAudioData();
        const ratio = newSampleRate / this.sampleRate;
        const resampled = new Float32Array(
            Math.floor(audioData.length * ratio)
        );
        for (let i = 0; i < resampled.length; i++) {
            resampled[i] = audioData[Math.floor(i * (1 / ratio))];
        }
        audioData = resampled;
        this.sampleRate = newSampleRate;
        // adjust loop points
        this.loopStart = Math.floor(this.loopStart * ratio);
        this.loopEnd = Math.floor(this.loopEnd * ratio);
        this.audioData = audioData;
    }

    /**
     * Compresses the audio data
     * @param encodeVorbis the compression function to use when compressing
     */
    public async compressSample(encodeVorbis: SampleEncodingFunction) {
        // no need to compress
        if (this.isCompressed) {
            return;
        }
        // compress, always mono!
        try {
            // if the sample rate is too low or too high, resample
            let audioData = this.getAudioData();
            if (this.sampleRate < 8000 || this.sampleRate > 96000) {
                this.resampleData(RESAMPLE_RATE);
                audioData = this.getAudioData();
            }
            const compressed = await encodeVorbis(audioData, this.sampleRate);
            this.setCompressedData(compressed);
        } catch (e) {
            SpessaSynthWarn(
                `Failed to compress ${this.name}. Leaving as uncompressed!`,
                e
            );
            this.compressedData = undefined;
        }
    }

    /**
     * Sets the sample type and unlinks if needed
     * @param type the type to use
     */
    public setSampleType(type: SampleType) {
        this.sampleType = type;
        if (!this.isLinked) {
            // unlink the other sample
            if (this.linkedSample) {
                this.linkedSample.linkedSample = undefined;
                this.linkedSample.sampleType = type;
            }

            this.linkedSample = undefined;
        }
        if ((type & 0x8000) > 0) {
            throw new Error("ROM samples are not supported.");
        }
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Unlinks a sample from its link
     */
    public unlinkSample() {
        this.setSampleType(sampleTypes.monoSample);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Links a stereo sample
     * @param sample the sample to link to
     * @param type either left, right or linked
     */
    public setLinkedSample(sample: BasicSample, type: SampleType) {
        // sanity check
        if (sample.linkedSample) {
            throw new Error(
                `${sample.name} is linked tp ${sample.linkedSample.name}. Unlink it first.`
            );
        }
        this.linkedSample = sample;
        sample.linkedSample = this;
        if (type === sampleTypes.leftSample) {
            this.setSampleType(sampleTypes.leftSample);
            sample.setSampleType(sampleTypes.rightSample);
        } else if (type === sampleTypes.rightSample) {
            this.setSampleType(sampleTypes.rightSample);
            sample.setSampleType(sampleTypes.leftSample);
        } else if (type === sampleTypes.linkedSample) {
            this.setSampleType(sampleTypes.linkedSample);
            sample.setSampleType(sampleTypes.linkedSample);
        } else {
            throw new Error("Invalid sample type: " + type);
        }
    }

    /**
     * Links the sample to a given instrument
     * @param instrument the instrument to link to
     */
    public linkTo(instrument: BasicInstrument) {
        this.linkedTo.push(instrument);
    }

    /**
     * Unlinks the sample from a given instrument
     * @param instrument the instrument to unlink from
     */
    public unlinkFrom(instrument: BasicInstrument) {
        const index = this.linkedTo.indexOf(instrument);
        if (index < 0) {
            SpessaSynthWarn(
                `Cannot unlink ${instrument.name} from ${this.name}: not linked.`
            );
            return;
        }
        this.linkedTo.splice(index, 1);
    }

    /**
     * Get the float32 audio data.
     * Note that this either decodes the compressed data or passes the ready sampleData.
     * If neither are set then it will throw an error!
     * @returns the audio data
     */
    public getAudioData(): Float32Array {
        if (this.audioData) {
            return this.audioData;
        }
        if (this.isCompressed) {
            // SF3
            // if compressed, decode
            this.audioData = this.decodeVorbis();
            return this.audioData;
        }
        throw new Error("Sample data is undefined for a BasicSample instance.");
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Replaces the audio data _in-place_.
     * @param audioData The new audio data as Float32.
     * @param sampleRate The new sample rate, in Hertz.
     */
    public setAudioData(audioData: Float32Array, sampleRate: number) {
        this.audioData = audioData;
        this.sampleRate = sampleRate;
        this.dataOverridden = true;
        this.compressedData = undefined;
    }

    /**
     * Replaces the audio with a compressed data sample and flags the sample as compressed
     * @param data the new compressed data
     */
    public setCompressedData(data: Uint8Array) {
        this.audioData = undefined;
        this.compressedData = data;
        this.dataOverridden = false;
    }

    /**
     * Encodes s16le sample
     * @return the encoded data
     */
    protected encodeS16LE(): IndexedByteArray {
        const data = this.getAudioData();
        const data16 = new Int16Array(data.length);
        const len = data.length;
        for (let i = 0; i < len; i++) {
            let sample = data[i] * 32768;
            // Clamp for safety (do not use Math.max/Math.min here)
            if (sample > 32767) {
                sample = 32767;
            } else if (sample < -32768) {
                sample = -32768;
            }
            data16[i] = sample;
        }
        return new IndexedByteArray(data16.buffer);
    }

    /**
     * Decode binary vorbis into a float32 pcm
     */
    protected decodeVorbis(): Float32Array {
        if (this.audioData) {
            return this.audioData;
        }
        if (!this.compressedData) {
            throw new Error("Compressed data is missing.");
        }
        try {
            const vorbis = stbvorbis.decode(this.compressedData);
            const decoded = vorbis.data[0];
            if (decoded === undefined) {
                SpessaSynthWarn(
                    `Error decoding sample ${this.name}: Vorbis decode returned undefined.`
                );
                return new Float32Array(0);
            }
            // clip
            // because vorbis can go above 1 sometimes
            for (let i = 0; i < decoded.length; i++) {
                // magic number is 32,767 / 32,768
                decoded[i] = Math.max(
                    -1,
                    Math.min(decoded[i], 0.999969482421875)
                );
            }
            return decoded;
        } catch (e) {
            // do not error out, fill with silence
            SpessaSynthWarn(
                `Error decoding sample ${this.name}: ${e as Error}`
            );
            return new Float32Array(this.loopEnd + 1);
        }
    }
}

export class EmptySample extends BasicSample {
    /**
     * A simplified class for creating samples.
     */
    public constructor() {
        super("", 44100, 60, 0, sampleTypes.monoSample, 0, 0);
    }
}
