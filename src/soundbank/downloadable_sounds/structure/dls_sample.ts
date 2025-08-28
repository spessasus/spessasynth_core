import { BasicSample } from "../../basic_soundbank/basic_sample";
import { SpessaSynthWarn } from "../../../utils/loggin";
import { readLittleEndianIndexed } from "../../../utils/byte_functions/little_endian";
import { IndexedByteArray } from "../../../utils/indexed_array";
import type { RIFFChunk } from "../../../utils/riff_chunk";
import { sampleTypes } from "../../enums";

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
        normalizationFactor = 255; // For 8-bit normalize from 0-255
        isUnsigned = true;
    } else {
        normalizationFactor = maxSampleValue; // For 16-bit normalize from -32,768 to 32,767
    }
    const sampleLength = data.length / bytesPerSample;
    const sampleData = new Float32Array(sampleLength);
    if (bytesPerSample === 2) {
        // Special optimized case for s16 (most common)
        const s16 = new Int16Array(data.buffer);
        for (let i = 0; i < s16.length; i++) {
            sampleData[i] = s16[i] / 32768;
        }
    } else {
        for (let i = 0; i < sampleData.length; i++) {
            // Read
            let sample = readLittleEndianIndexed(data, bytesPerSample);
            // Turn into signed
            if (isUnsigned) {
                // Normalize unsigned 8-bit sample
                sampleData[i] = sample / normalizationFactor - 0.5;
            } else {
                // Normalize signed sample
                if (sample >= maxSampleValue) {
                    sample -= maxUnsigned;
                }
                sampleData[i] = sample / normalizationFactor;
            }
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
        sampleData[i] = s16sample / 32678;
    }
    return sampleData;
}

export class DLSSample extends BasicSample {
    protected wFormatTag: number;
    protected bytesPerSample: number;

    /**
     * Sample's raw data before decoding it, for faster writing
     */
    protected rawData: IndexedByteArray;

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
            sampleTypes.monoSample,
            loopStart,
            loopEnd
        );
        this.dataOverridden = false;
        this.rawData = dataChunk.data;
        this.wFormatTag = wFormatTag;
        this.bytesPerSample = bytesPerSample;
    }

    public getAudioData(): Float32Array {
        if (!this.rawData) {
            return new Float32Array(0);
        }
        if (!this.audioData) {
            let sampleData;
            switch (this.wFormatTag) {
                default:
                    SpessaSynthWarn(
                        `Failed to decode sample. Unknown wFormatTag: ${this.wFormatTag}`
                    );
                    sampleData = new Float32Array(
                        this.rawData.length / this.bytesPerSample
                    );
                    break;

                case W_FORMAT_TAG.PCM:
                    sampleData = readPCM(this.rawData, this.bytesPerSample);
                    break;

                case W_FORMAT_TAG.ALAW:
                    sampleData = readALAW(this.rawData, this.bytesPerSample);
                    break;
            }
            this.setAudioData(sampleData, this.sampleRate);
        }
        return this.audioData ?? new Float32Array(0);
    }

    public getRawData(allowVorbis: boolean) {
        if (this.dataOverridden || this.isCompressed) {
            return super.getRawData(allowVorbis);
        }
        if (this.wFormatTag === W_FORMAT_TAG.PCM && this.bytesPerSample === 2) {
            // Copy straight away
            return this.rawData;
        }
        return this.encodeS16LE();
    }
}
