import { BasicSample } from "../basic_soundbank/basic_sample";
import { readLittleEndianIndexed } from "../../utils/byte_functions/little_endian";
import { IndexedByteArray } from "../../utils/indexed_array";
import type { RIFFChunk } from "../../utils/riff_chunk";
import type { SampleStoredData } from "../types";
import { SampleTypes } from "../enums";
import { SpessaLog } from "../../utils/loggin";

const W_FORMAT_TAG = {
    PCM: 0x01,
    ALAW: 0x6
} as const;

function readPCM(data: IndexedByteArray, bytesPerSample: number): Float32Array {
    const maxSampleValue = Math.pow(2, bytesPerSample * 8 - 1); // Max value for the sample
    const maxUnsigned = Math.pow(2, bytesPerSample * 8);

    let normalizationFactor;
    let isUnsigned = false;

    if (bytesPerSample === 1) {
        normalizationFactor = 128; // 8-bit is unsigned, 128 is the center
        isUnsigned = true;
    } else {
        normalizationFactor = maxSampleValue; // For 16-bit normalize from -32,768 to 32,767
    }
    const sampleLength = data.length / bytesPerSample;
    const sampleData = new Float32Array(sampleLength);
    // 16-bit PCM is decoded in BasicSample as s16le
    for (let i = 0; i < sampleData.length; i++) {
        // Read
        let sample = readLittleEndianIndexed(data, bytesPerSample);
        // Turn into signed
        if (isUnsigned) {
            // Normalize unsigned 8-bit sample
            sampleData[i] = (sample - 128) / normalizationFactor;
        } else {
            // Normalize signed sample
            if (sample >= maxSampleValue) {
                sample -= maxUnsigned;
            }
            sampleData[i] = sample / normalizationFactor;
        }
    }
    return sampleData;
}

function readALAW(
    data: IndexedByteArray,
    bytesPerSample: number
): Float32Array {
    const sampleLength = data.length / bytesPerSample;
    const sampleData = new Float32Array(sampleLength);
    for (let i = 0; i < sampleData.length; i++) {
        // Read
        const input = readLittleEndianIndexed(data, bytesPerSample);

        // https://en.wikipedia.org/wiki/G.711#A-law
        // Re-toggle toggled bits
        let sample = input ^ 0x55;

        // Remove sign bit
        sample &= 0x7f;

        // Extract exponent
        const exponent = sample >> 4;
        // Extract mantissa
        let mantissa = sample & 0xf;
        if (exponent > 0) {
            mantissa += 16; // Add leading '1', if exponent > 0
        }

        mantissa = (mantissa << 4) + 0x8;
        if (exponent > 1) {
            mantissa = mantissa << (exponent - 1);
        }

        const s16sample = input > 127 ? mantissa : -mantissa;

        // Convert to float
        sampleData[i] = s16sample / 32_768;
    }
    return sampleData;
}

export class DLSSample extends BasicSample {
    protected wFormatTag: number;
    protected bytesPerSample: number;

    /**
     * Sample's raw data before decoding it, for formats other than 16-bit PCM.
     * 16-bit PCM is stored as s16le data in BasicSample.
     */
    protected rawData?: IndexedByteArray;

    /**
     * @param name
     * @param rate
     * @param pitch
     * @param pitchCorrection
     * @param loopStart sample data points
     * @param loopEnd sample data points
     * @param dataChunk
     * @param wFormatTag
     * @param bytesPerSample
     */
    public constructor(
        name: string,
        rate: number,
        pitch: number,
        pitchCorrection: number,
        loopStart: number,
        loopEnd: number,
        dataChunk: RIFFChunk,
        wFormatTag: number,
        bytesPerSample: number
    ) {
        super(
            name,
            rate,
            pitch,
            pitchCorrection,
            SampleTypes.monoSample,
            loopStart,
            loopEnd
        );
        this.dataOverridden = false;
        this.wFormatTag = wFormatTag;
        this.bytesPerSample = bytesPerSample;
        if (wFormatTag === W_FORMAT_TAG.PCM && bytesPerSample === 2) {
            // Most common, copied back unchanged when writing
            this.s16leData = dataChunk.data;
        } else {
            this.rawData = dataChunk.data;
        }
    }

    public get hasData() {
        return super.hasData || this.rawData !== undefined;
    }

    public get sampleLength() {
        if (this.rawData && !this.audioData) {
            return Math.floor(this.rawData.length / this.bytesPerSample);
        }
        return super.sampleLength;
    }

    public get storedForm() {
        // Other formats than s16le are given out decoded
        if (this.rawData && !this.audioData) {
            return "float32";
        }
        return super.storedForm;
    }

    public getStoredData() {
        // Other formats than s16le have no stored form, decode them
        if (this.rawData && !this.audioData) {
            this.getAudioData();
        }
        return super.getStoredData();
    }

    public setStoredData(stored: SampleStoredData) {
        this.rawData = undefined;
        super.setStoredData(stored);
    }

    public releaseDecoded() {
        if (this.rawData && this.audioData && !this.dataOverridden) {
            this.audioData = undefined;
            return true;
        }
        return super.releaseDecoded();
    }

    public releaseData() {
        // Keep the length and form before the raw data is gone
        if (this.hasData) {
            this.releasedForm = this.storedForm;
        }
        this.cachedLength = this.sampleLength;
        this.rawData = undefined;
        super.releaseData();
    }

    public getAudioData(): Float32Array {
        if (this.audioData) {
            return this.audioData;
        }
        if (!this.rawData) {
            // S16le, replaced or no data
            return super.getAudioData();
        }
        let sampleData;
        switch (this.wFormatTag) {
            default: {
                SpessaLog.warn(
                    `Failed to decode sample. Unknown wFormatTag: ${this.wFormatTag}`
                );
                sampleData = new Float32Array(
                    this.rawData.length / this.bytesPerSample
                );
                break;
            }

            case W_FORMAT_TAG.PCM: {
                sampleData = readPCM(this.rawData, this.bytesPerSample);
                break;
            }

            case W_FORMAT_TAG.ALAW: {
                sampleData = readALAW(this.rawData, this.bytesPerSample);
                break;
            }
        }
        // Cache only, the data is not overridden
        this.audioData = sampleData;
        return sampleData;
    }

    public setAudioData(audioData: Float32Array, sampleRate: number) {
        this.rawData = undefined;
        super.setAudioData(audioData, sampleRate);
    }

    public setCompressedData(data: Uint8Array) {
        this.rawData = undefined;
        super.setCompressedData(data);
    }

    public getRawData(allowVorbis: boolean) {
        if (this.rawData) {
            // Not s16le, so it has to be encoded
            return this.encodeS16LE();
        }
        return super.getRawData(allowVorbis);
    }
}
