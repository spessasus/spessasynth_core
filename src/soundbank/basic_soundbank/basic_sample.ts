import { IndexedByteArray } from "../../utils/indexed_array";
import { type SampleType, SampleTypes } from "../enums";
import type { BasicInstrument } from "./basic_instrument";
import type { SampleEncodingFunction } from "../types";
import { SpessaLog } from "../../utils/loggin";
import { StbVorbis } from "stb-vorbis";

// Should be reasonable for most cases
const RESAMPLE_RATE = 48_000;

/**
 * A basic sample represents a single audio sample with associated parameters.
 *
 * @group Sound Banks.Samples
 */
export class BasicSample {
    /**
     * The sample's name.
     */
    public name: string;

    /**
     * The sample rate of the sample, in Hertz.
     */
    public sampleRate: number;

    /**
     * The MIDI note number of the recorded pitch for this sample.
     */
    public originalKey: number;

    /**
     * The pitch correction to apply in cents. It can be negative.
     */
    public pitchCorrection: number;

    /**
     * The other linked sample of the stereo pair. `undefined` if the sample has no link.
     */
    public linkedSample?: BasicSample;

    /**
     * The type of the sample, as defined per SF2 specification:
     *
     * > The value in sfSampleType is an enumeration with eight defined values: monoSample = 1, rightSample = 2, leftSample = 4,
     * > linkedSample = 8, RomMonoSample = 32769, RomRightSample = 32770, RomLeftSample = 32772, and
     * > RomLinkedSample = 32776. It can be seen that this is encoded such that bit 15 of the 16 bit value is set if the sample is in
     * > ROM, and reset if it is included in the SoundFont compatible bank. The four LS bits of the word are then exclusively set
     * > indicating mono, left, right, or linked.
     *
     * > **Warning**
     * >
     * > Do not change this value directly. use {@link BasicSample.setSampleType},
     * > {@link BasicSample.setLinkedSample} or {@link BasicSample.unlinkSample} instead.
     */
    public sampleType: SampleType;

    /**
     * The sample's loop start index, _inclusive_.
     * In sample data points, relative to the start of the sample.
     *
     * Minimum allowed value is 0.
     */
    public loopStart: number;

    /**
     * The sample's loop end index, _exclusive_.
     * In sample data points, relative to the start of the sample.
     *
     * Maximum allowed value is the sample data length.
     */
    public loopEnd: number;
    /**
     * Sample's linked instruments (the instruments that use it).
     *
     * > **Note**
     * >
     * > Duplicate entries are allowed since one instrument can use the same sample multiple times.
     */
    public linkedTo: BasicInstrument[] = [];
    /**
     * Indicates if the data was overridden, so it cannot be copied back unchanged.
     */
    protected dataOverridden = true;
    /**
     * The compressed sample data if the sample has been compressed.
     */
    protected compressedData?: Uint8Array;
    /**
     * The sample's audio data.
     */
    protected audioData?: Float32Array;

    /**
     * Creates a new `BasicSample`.
     *
     * > **Tip**
     * >
     * > For an easier to use constructor, consider using {@link EmptySample} instead.
     *
     * @param sampleName The sample's name.
     * @param sampleRate The sample's rate in Hz.
     * @param originalKey The sample's pitch as a MIDI note number.
     * @param pitchCorrection The sample's pitch correction in cents.
     * @param sampleType The sample's type, an enum that defines the sample type/compression.
     * @param loopStart The sample's loop start relative to the sample start in sample points.
     * @param loopEnd The sample's loop end relative to the sample start in sample points. Exclusive.
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
     * Indicates if the sample contains compressed audio.
     */
    public get isCompressed(): boolean {
        return this.compressedData !== undefined;
    }

    /**
     * If the sample is linked to another sample.
     */
    public get isLinked(): boolean {
        return (
            this.sampleType === SampleTypes.rightSample ||
            this.sampleType === SampleTypes.leftSample ||
            this.sampleType === SampleTypes.linkedSample
        );
    }

    /**
     * How many instruments is this sample used by.
     */
    public get useCount() {
        return this.linkedTo.length;
    }

    /**
     * Get raw data for writing the file, either a compressed bit stream or signed 16-bit little endian PCM data.
     * @param allowVorbis if vorbis file data is allowed.
     * @return either s16le or vorbis data.
     * @internal
     */
    public getRawData(allowVorbis: boolean): Uint8Array {
        if (this.compressedData && allowVorbis && !this.dataOverridden) {
            return this.compressedData;
        }
        return this.encodeS16LE();
    }

    /**
     * Resamples the audio data _in-place_ to a given sample rate.
     * @param newSampleRate The new sample rate, in hertz.
     */
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
        // Adjust loop points
        this.loopStart = Math.floor(this.loopStart * ratio);
        this.loopEnd = Math.floor(this.loopEnd * ratio);
        this.audioData = audioData;
    }

    /**
     * Compresses the audio data
     * @param encodeVorbis the compression function to use when compressing.
     * @internal
     */
    public async compressSample(encodeVorbis: SampleEncodingFunction) {
        // No need to compress
        if (this.isCompressed) {
            return;
        }
        // Compress, always mono!
        try {
            // If the sample rate is too low or too high, resample
            let audioData = this.getAudioData();
            if (this.sampleRate < 8000 || this.sampleRate > 96_000) {
                this.resampleData(RESAMPLE_RATE);
                audioData = this.getAudioData();
            }
            const compressed = await encodeVorbis(audioData, this.sampleRate);
            this.setCompressedData(compressed);
        } catch (error) {
            SpessaLog.warn(
                `Failed to compress ${this.name}. Leaving as uncompressed!`,
                error
            );
            this.compressedData = undefined;
        }
    }

    /**
     * Sets the sample type and unlinks if needed.
     * @param type The type to set it to.
     */
    public setSampleType(type: SampleType) {
        this.sampleType = type;
        if (!this.isLinked) {
            // Unlink the other sample
            if (this.linkedSample) {
                this.linkedSample.linkedSample = undefined;
                this.linkedSample.sampleType = type;
            }

            this.linkedSample = undefined;
        }
        if ((type & 0x80_00) > 0) {
            throw new Error("ROM samples are not supported.");
        }
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Unlinks the sample from its stereo link if it has any.
     */
    public unlinkSample() {
        this.setSampleType(SampleTypes.monoSample);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Links a stereo sample.
     * @param sample The sample to link to.
     * @param type Either left, right or linked. The linked sample will be set appropriately as well.
     */
    public setLinkedSample(sample: BasicSample, type: SampleType) {
        // Sanity check
        if (sample.linkedSample) {
            throw new Error(
                `${sample.name} is linked to ${sample.linkedSample.name}. Unlink it first.`
            );
        }
        // Testcase: pc98_ym2608.sf2
        if (this === sample)
            throw new Error(`${sample.name} cannot be linked to itself.`);

        this.linkedSample = sample;
        sample.linkedSample = this;
        switch (type) {
            case SampleTypes.leftSample: {
                this.setSampleType(SampleTypes.leftSample);
                sample.setSampleType(SampleTypes.rightSample);

                break;
            }
            case SampleTypes.rightSample: {
                this.setSampleType(SampleTypes.rightSample);
                sample.setSampleType(SampleTypes.leftSample);

                break;
            }
            case SampleTypes.linkedSample: {
                this.setSampleType(SampleTypes.linkedSample);
                sample.setSampleType(SampleTypes.linkedSample);

                break;
            }
            default: {
                throw new Error("Invalid sample type: " + type);
            }
        }
    }

    /**
     * Links the sample to a given instrument
     * @param instrument the instrument to link to
     * @internal
     */
    public linkTo(instrument: BasicInstrument) {
        this.linkedTo.push(instrument);
    }

    /**
     * Unlinks the sample from a given instrument
     * @param instrument the instrument to unlink from
     * @internal
     */
    public unlinkFrom(instrument: BasicInstrument) {
        const index = this.linkedTo.indexOf(instrument);
        if (index === -1) {
            SpessaLog.warn(
                `Cannot unlink ${instrument.name} from ${this.name}: not linked.`
            );
            return;
        }
        this.linkedTo.splice(index, 1);
    }

    /**
     * Get the PCM Float32 audio data of this sample.
     * This either decodes the compressed data or passes the ready sampleData.
     * @returns The raw audio data.
     */
    public getAudioData(): Float32Array {
        if (this.audioData) {
            return this.audioData;
        }
        if (this.isCompressed) {
            // SF3
            // If compressed, decode
            this.audioData = this.decodeVorbis();
            return this.audioData;
        }
        throw new Error("Sample data is undefined for a BasicSample instance.");
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Replaces the audio data *in-place*.
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
     * Replaces the audio with a compressed data sample and flags the sample as compressed.
     * @param data The new compressed data.
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
            let sample = data[i] * 32_768;
            // Clamp for safety (do not use Math.max/Math.min here)
            if (sample > 32_767) {
                sample = 32_767;
            } else if (sample < -32_768) {
                sample = -32_768;
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
            const vorbis = StbVorbis.decode(this.compressedData);
            if (vorbis.sampleRate !== this.sampleRate) {
                SpessaLog.warn(
                    `Sample ${this.name}: Sample rate mismatch. Expected ${this.sampleRate}, got ${vorbis.sampleRate}.`
                );
            }

            if (vorbis.channels.length === 0) {
                SpessaLog.warn(
                    `Error decoding sample ${this.name}: No channels!`
                );
                // Do not error out, fill with silence
                return new Float32Array(this.loopEnd);
            } else if (vorbis.channels.length > 1) {
                SpessaLog.warn(
                    `Sample ${this.name}: Returned ${vorbis.channels.length} channels instead of mono.`
                );
            }

            const decoded = vorbis.channels[0];
            // Clip
            // Because vorbis can go above 1 sometimes
            for (let i = 0; i < decoded.length; i++) {
                // Magic number is 32,767 / 32,768
                decoded[i] = Math.max(
                    -1,
                    Math.min(decoded[i], 0.999_969_482_421_875)
                );
            }
            return decoded;
        } catch (error) {
            // Do not error out, fill with silence
            SpessaLog.warn(
                `Error decoding sample ${this.name}: ${error as Error}`
            );
            return new Float32Array(this.loopEnd);
        }
    }
}

/**
 * A simplified class for creating {@link BasicSample}.
 *
 * @group Sound Banks.Samples
 */
export class EmptySample extends BasicSample {
    public constructor() {
        super("", 44_100, 60, 0, SampleTypes.monoSample, 0, 0);
    }
}
