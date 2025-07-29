import { BasicSample } from "../basic_soundbank/basic_sample";
import { SpessaSynthWarn } from "../../utils/loggin";
import { readLittleEndian } from "../../utils/byte_functions/little_endian";
import { IndexedByteArray } from "../../utils/indexed_array";
import type { RIFFChunk } from "../basic_soundbank/riff_chunk";
import { sampleTypes } from "../enums";

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
        // special optimized case for s16 (most common)
        const s16 = new Int16Array(data.buffer);
        for (let i = 0; i < s16.length; i++) {
            sampleData[i] = s16[i] / 32768;
        }
    } else {
        for (let i = 0; i < sampleData.length; i++) {
            // read
            let sample = readLittleEndian(data, bytesPerSample);
            // turn into signed
            if (isUnsigned) {
                // normalize unsigned 8-bit sample
                sampleData[i] = sample / normalizationFactor - 0.5;
            } else {
                // normalize signed sample
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
        // read
        const input = readLittleEndian(data, bytesPerSample);

        // https://en.wikipedia.org/wiki/G.711#A-law
        // re-toggle toggled bits
        let sample = input ^ 0x55;

        // remove sign bit
        sample &= 0x7f;

        // extract exponent
        const exponent = sample >> 4;
        // extract mantissa
        let mantissa = sample & 0xf;
        if (exponent > 0) {
            mantissa += 16; // add leading '1', if exponent > 0
        }

        mantissa = (mantissa << 4) + 0x8;
        if (exponent > 1) {
            mantissa = mantissa << (exponent - 1);
        }

        const s16sample = input > 127 ? mantissa : -mantissa;

        // convert to float
        sampleData[i] = s16sample / 32678;
    }
    return sampleData;
}

export class DLSSample extends BasicSample {
    /**
     * in decibels of attenuation, WITHOUT E-MU CORRECTION
     */
    public sampleDbAttenuation: number;
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
     * @param sampleDbAttenuation in db
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
        sampleDbAttenuation: number,
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
        this.sampleDbAttenuation = sampleDbAttenuation;
        this.dataOverridden = false;
        this.rawData = dataChunk.chunkData;
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
            // copy straight away
            return this.rawData;
        }
        return this.encodeS16LE();
    }
}
