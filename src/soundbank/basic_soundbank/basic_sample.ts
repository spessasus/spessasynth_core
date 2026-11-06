import { IndexedByteArray } from "../../utils/indexed_array";
import { type SampleType, SampleTypes } from "../enums";
import type { BasicInstrument } from "./basic_instrument";
import type { SampleEncodingFunction, SampleStoredData } from "../types";
import { SpessaLog } from "../../utils/loggin";
import { StbVorbis } from "stb-vorbis";

// Should be reasonable for most cases
const RESAMPLE_RATE = 48_000;

/**
 * Reads the sample count of an Ogg Vorbis stream from the page granule positions, without decoding all of it.
 * The last page gives the end, and decoding the headers and the first audio page gives the start offset.
 * This is exact for well-formed streams. Streams with gaps in the granule positions decode shorter.
 * @param data The Ogg stream.
 * @returns The length in sample points, or undefined if the pages could not be read.
 * @internal
 */
export function getVorbisLength(data: Uint8Array): number | undefined {
    let firstAudioEnd = -1;
    let firstGranule = 0;
    let lastGranule = -1;
    let pageCount = 0;
    let i = 0;
    // Walk the pages, only their headers are read
    while (i + 27 <= data.length) {
        if (
            data[i] !== 0x4f ||
            data[i + 1] !== 0x67 ||
            data[i + 2] !== 0x67 ||
            data[i + 3] !== 0x53
        ) {
            return undefined;
        }
        const segments = data[i + 26];
        let size = 27 + segments;
        for (let s = 0; s < segments; s++) {
            size += data[i + 27 + s];
        }
        // 64-bit granule position at offset 6, all ones means no packet ends on this page
        const low =
            (data[i + 6] |
                (data[i + 7] << 8) |
                (data[i + 8] << 16) |
                (data[i + 9] << 24)) >>>
            0;
        const high =
            (data[i + 10] |
                (data[i + 11] << 8) |
                (data[i + 12] << 16) |
                (data[i + 13] << 24)) >>>
            0;
        if (low !== 0xff_ff_ff_ff || high !== 0xff_ff_ff_ff) {
            const granule = high * 0x1_00_00_00_00 + low;
            // Header pages have a granule of 0
            if (granule > 0 && firstAudioEnd === -1) {
                firstAudioEnd = i + size;
                firstGranule = granule;
                pageCount = 0;
            }
            lastGranule = granule;
        }
        pageCount++;
        i += size;
    }
    if (lastGranule < 0) {
        return undefined;
    }
    // A stream can start at a granule above 0, the first page then ends later than the samples it holds
    if (firstAudioEnd !== -1 && pageCount > 1) {
        try {
            const firstPage = StbVorbis.decode(data.subarray(0, firstAudioEnd));
            const produced = firstPage.channels[0]?.length ?? firstGranule;
            return lastGranule - Math.max(0, firstGranule - produced);
        } catch {
            // The decoder may not be ready, the granule alone is right for most streams
        }
    }
    return lastGranule;
}

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
     * > Do not change this value directly. Use {@link BasicSample.setSampleType},
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
     * The signed 16-bit little endian PCM data, as read from the file.
     */
    protected s16leData?: Uint8Array;
    /**
     * The length in sample points when it is not known from the data,
     * either a sample without data or a vorbis stream's length that was read once.
     */
    protected cachedLength?: number;
    /**
     * The form the data had before it was released or when it was loaded without data.
     */
    protected releasedForm?: SampleStoredData["form"];

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
     * @param sampleType The sample's type, one of the {@link SampleTypes}.
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
        return this.storedForm === "vorbis";
    }

    /**
     * The form the sample stores its data in, see {@link BasicSample.getStoredData}.
     * A sample without data reports the form it had, or undefined if it never had data.
     */
    public get storedForm(): SampleStoredData["form"] | undefined {
        if (this.compressedData) {
            return "vorbis";
        }
        if (this.s16leData) {
            return "s16le";
        }
        if (this.audioData) {
            return "float32";
        }
        return this.releasedForm;
    }

    /**
     * Indicates if the sample holds any audio data.
     * A sample loaded with `sampleData: false` or released with {@link BasicSample.releaseData} does not.
     */
    public get hasData(): boolean {
        return (
            this.audioData !== undefined ||
            this.compressedData !== undefined ||
            this.s16leData !== undefined
        );
    }

    /**
     * The sample's length in sample points, known without decoding the data.
     * Samples without data keep the length they had.
     *
     * > **Note**
     * >
     * > For compressed samples, it is read from the Ogg page headers, which is exact for well-formed streams.
     * > A stream with gaps in its granule positions decodes shorter. Once it is decoded,
     * > the length is the decoded one.
     */
    public get sampleLength(): number {
        if (this.audioData) {
            return this.audioData.length;
        }
        if (this.s16leData) {
            return this.s16leData.length >> 1;
        }
        if (this.cachedLength !== undefined) {
            return this.cachedLength;
        }
        if (this.compressedData) {
            // Fall back to decoding if the stream has no valid page
            this.cachedLength =
                getVorbisLength(this.compressedData) ??
                this.getAudioData().length;
            return this.cachedLength;
        }
        return 0;
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

    // noinspection JSUnusedGlobalSymbols
    /**
     * If the decoded float data is currently held in memory.
     * Check it before {@link getAudioData} to know if the call has to decode,
     * then use {@link releaseDecoded} to drop the copy again.
     */
    public get isDecoded() {
        return this.audioData !== undefined;
    }

    /**
     * If the decoded float data can be made again from the stored data.
     * False for replaced data (set with {@link BasicSample.setAudioData}), which has nothing to decode from.
     * @internal
     */
    public get canRedecode() {
        return (
            !this.dataOverridden &&
            (this.compressedData !== undefined || this.s16leData !== undefined)
        );
    }

    /**
     * Get raw data for writing the file, either a compressed bit stream or signed 16-bit little endian PCM data.
     * @param allowVorbis if vorbis file data is allowed.
     * @return either s16le or vorbis data.
     */
    public getRawData(allowVorbis: boolean): Uint8Array {
        if (this.compressedData && allowVorbis && !this.dataOverridden) {
            return this.compressedData;
        }
        if (this.s16leData && !this.dataOverridden) {
            // Copy the smpl directly
            return this.s16leData;
        }
        return this.encodeS16LE();
    }

    /**
     * Gets the sample's data in the form it is stored, without decoding, encoding or copying it.
     * Use {@link BasicSample.setStoredData} to give it to another sample, for example in another thread.
     * @returns The stored form and its data.
     */
    public getStoredData(): SampleStoredData {
        if (this.compressedData) {
            return { form: "vorbis", data: this.compressedData };
        }
        if (this.s16leData) {
            return { form: "s16le", data: this.s16leData };
        }
        if (this.audioData) {
            return { form: "float32", data: this.audioData };
        }
        throw this.noDataError();
    }

    /**
     * Replaces the sample's data with data in a given stored form, without decoding or encoding it.
     * The sample rate and loop points are not changed.
     *
     * > **Note**
     * >
     * > s16le and vorbis data is written back unchanged when saving, float32 data is encoded.
     *
     * @param stored The stored form and its data, as returned by {@link BasicSample.getStoredData}.
     */
    public setStoredData(stored: SampleStoredData) {
        this.audioData = undefined;
        this.compressedData = undefined;
        this.s16leData = undefined;
        this.cachedLength = undefined;
        switch (stored.form) {
            case "s16le": {
                this.s16leData = stored.data;
                this.dataOverridden = false;
                break;
            }

            case "vorbis": {
                this.compressedData = stored.data;
                this.dataOverridden = false;
                break;
            }

            case "float32": {
                this.audioData = stored.data;
                this.dataOverridden = true;
            }
        }
    }

    /**
     * Drops all the sample's data. The parameters and {@link BasicSample.sampleLength} stay.
     * Reading the audio data afterward throws an error until {@link BasicSample.setStoredData} gives it new data.
     */
    public releaseData() {
        if (this.hasData) {
            this.releasedForm = this.storedForm;
        }
        this.cachedLength = this.sampleLength;
        this.audioData = undefined;
        this.compressedData = undefined;
        this.s16leData = undefined;
    }

    /**
     * Drops the decoded float data if the sample can decode it again from its stored s16le or vorbis data.
     * Replaced data (set with {@link BasicSample.setAudioData}) is kept.
     * @returns True if the decoded data was dropped.
     */
    public releaseDecoded() {
        if (this.audioData && this.canRedecode) {
            this.audioData = undefined;
            return true;
        }
        return false;
    }

    /**
     * Marks the sample as having no data, with a known length.
     * Used when loading without sample data.
     * @param length The length in sample points.
     * @param form The form the data is stored in the file.
     * @internal
     */
    public setLengthWithoutData(
        length: number,
        form: SampleStoredData["form"]
    ) {
        this.releaseData();
        this.cachedLength = length;
        this.releasedForm = form;
    }

    /**
     * Resamples the audio data _in-place_ to a given sample rate.
     * @param newSampleRate The new sample rate, in hertz.
     */
    public resampleData(newSampleRate: number) {
        const audioData = this.getAudioData();
        const ratio = newSampleRate / this.sampleRate;
        const resampled = new Float32Array(
            Math.floor(audioData.length * ratio)
        );
        for (let i = 0; i < resampled.length; i++) {
            resampled[i] = audioData[Math.floor(i * (1 / ratio))];
        }
        // Adjust loop points
        this.loopStart = Math.floor(this.loopStart * ratio);
        this.loopEnd = Math.floor(this.loopEnd * ratio);
        // Mark the data as overridden so the resampled data is written
        this.setAudioData(resampled, newSampleRate);
    }

    /**
     * Compresses the audio data.
     * @param encodeVorbis the compression function to use when compressing.
     * @returns True if the sample is compressed afterward, false if the encoder failed and it stays uncompressed.
     * @internal
     */
    public async compressSample(encodeVorbis: SampleEncodingFunction) {
        // No need to compress
        if (this.isCompressed) {
            return true;
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
            return true;
        } catch (error) {
            SpessaLog.warn(
                `Failed to compress ${this.name}. Leaving as uncompressed!`,
                error
            );
            this.compressedData = undefined;
            return false;
        }
    }

    /**
     * Sets the sample type and unlinks if needed.
     * @param type The type to set it to.
     */
    public setSampleType(type: SampleType) {
        // Validate before changing anything
        if ((type & 0x80_00) > 0) {
            throw new Error("ROM samples are not supported.");
        }
        this.sampleType = type;
        if (!this.isLinked) {
            // Unlink the other sample
            if (this.linkedSample) {
                this.linkedSample.linkedSample = undefined;
                this.linkedSample.sampleType = type;
            }

            this.linkedSample = undefined;
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
        // Validate before linking so an error does not leave the samples half-linked
        if (
            type !== SampleTypes.leftSample &&
            type !== SampleTypes.rightSample &&
            type !== SampleTypes.linkedSample
        )
            throw new Error("Invalid sample type: " + type);

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
            // Other types were rejected above
        }
    }

    /**
     * Links the sample to a given instrument.
     * @param instrument the instrument to link to.
     * @internal
     */
    public linkTo(instrument: BasicInstrument) {
        this.linkedTo.push(instrument);
    }

    /**
     * Unlinks the sample from a given instrument.
     * @param instrument the instrument to unlink from.
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
        if (this.compressedData) {
            // SF3
            // If compressed, decode
            this.audioData = this.decodeVorbis();
            return this.audioData;
        }
        if (this.s16leData) {
            this.audioData = this.decodeS16LE(this.s16leData);
            return this.audioData;
        }
        throw this.noDataError();
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
        this.s16leData = undefined;
        this.cachedLength = undefined;
    }

    /**
     * Replaces the audio with a compressed data sample and flags the sample as compressed.
     * @param data The new compressed data.
     */
    public setCompressedData(data: Uint8Array) {
        this.audioData = undefined;
        this.s16leData = undefined;
        this.cachedLength = undefined;
        this.compressedData = data;
        this.dataOverridden = false;
    }

    /**
     * The error for reading the data of a sample that has none.
     */
    protected noDataError() {
        return new Error(
            `Sample "${this.name}" has no audio data. It was loaded without sample data or its data was released.`
        );
    }

    /**
     * Decodes signed 16-bit little endian PCM into float.
     * @param data The s16le data. It may be a view at any offset.
     */
    protected decodeS16LE(data: Uint8Array) {
        const length = data.length >> 1;
        if (length === 0) {
            SpessaLog.warn(
                `Invalid sample ${this.name}! Invalid length: ${data.length}`
            );
            return new Float32Array(1);
        }
        const audioData = new Float32Array(length);
        // An odd offset cannot be an Int16Array view
        const aligned =
            data.byteOffset % 2 === 0 ? data : data.slice(0, length * 2);
        const s16 = new Int16Array(aligned.buffer, aligned.byteOffset, length);
        for (let i = 0; i < length; i++) {
            audioData[i] = s16[i] / 32_768;
        }
        return audioData;
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
