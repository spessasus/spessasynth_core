import { BasicSample, sampleTypes } from "../basic_soundfont/basic_sample.js";
import { SpessaSynthWarn } from "../../utils/loggin.js";
import { readLittleEndian } from "../../utils/byte_functions/little_endian.js";
import { IndexedByteArray } from "../../utils/indexed_array.js";

const W_FORMAT_TAG = {
    PCM: 0x01,
    ALAW: 0x6
};


/**
 * @param data {IndexedByteArray}
 * @param bytesPerSample {number}
 * @returns {Float32Array}
 */
function readPCM(data, bytesPerSample)
{
    const maxSampleValue = Math.pow(2, bytesPerSample * 8 - 1); // Max value for the sample
    const maxUnsigned = Math.pow(2, bytesPerSample * 8);
    
    let normalizationFactor;
    let isUnsigned = false;
    
    if (bytesPerSample === 1)
    {
        normalizationFactor = 255; // For 8-bit normalize from 0-255
        isUnsigned = true;
    }
    else
    {
        normalizationFactor = maxSampleValue; // For 16-bit normalize from -32,768 to 32,767
    }
    const sampleLength = data.length / bytesPerSample;
    const sampleData = new Float32Array(sampleLength);
    if (bytesPerSample === 2)
    {
        // special optimized case for s16 (most common)
        const s16 = new Int16Array(data.buffer);
        for (let i = 0; i < s16.length; i++)
        {
            sampleData[i] = s16[i] / 32768;
        }
    }
    else
    {
        for (let i = 0; i < sampleData.length; i++)
        {
            // read
            let sample = readLittleEndian(data, bytesPerSample);
            // turn into signed
            if (isUnsigned)
            {
                // normalize unsigned 8-bit sample
                sampleData[i] = (sample / normalizationFactor) - 0.5;
            }
            else
            {
                // normalize signed sample
                if (sample >= maxSampleValue)
                {
                    sample -= maxUnsigned;
                }
                sampleData[i] = sample / normalizationFactor;
            }
        }
    }
    return sampleData;
}

/**
 * @param data {IndexedByteArray}
 * @param bytesPerSample {number}
 * @returns {Float32Array}
 */
function readALAW(data, bytesPerSample)
{
    const sampleLength = data.length / bytesPerSample;
    const sampleData = new Float32Array(sampleLength);
    for (let i = 0; i < sampleData.length; i++)
    {
        // read
        const input = readLittleEndian(data, bytesPerSample);
        
        // https://en.wikipedia.org/wiki/G.711#A-law
        // re-toggle toggled bits
        let sample = input ^ 0x55;
        
        // remove sign bit
        sample &= 0x7F;
        
        // extract exponent
        let exponent = sample >> 4;
        // extract mantissa
        let mantissa = sample & 0xF;
        if (exponent > 0)
        {
            mantissa += 16; // add leading '1', if exponent > 0
        }
        
        mantissa = (mantissa << 4) + 0x8;
        if (exponent > 1)
        {
            mantissa = mantissa << (exponent - 1);
        }
        
        const s16sample = input > 127 ? mantissa : -mantissa;
        
        // convert to float
        sampleData[i] = s16sample / 32678;
    }
    return sampleData;
}

export class DLSSample extends BasicSample
{
    /**
     * in decibels of attenuation, WITHOUT EMU CORRECTION
     * @type {number}
     */
    sampleDbAttenuation;
    /**
     * @type {Float32Array}
     */
    sampleData;
    
    /**
     * @type {number}
     */
    wFormatTag;
    
    /**
     * @type {number}
     */
    bytesPerSample;
    
    /**
     * Sample's raw data before decoding it, for faster writing
     * @type {IndexedByteArray}
     */
    rawData;
    
    /**
     * @param name {string}
     * @param rate {number}
     * @param pitch {number}
     * @param pitchCorrection {number}
     * @param loopStart {number} sample data points
     * @param loopEnd {number} sample data points
     * @param sampleDbAttenuation {number} in db
     * @param dataChunk {RiffChunk}
     * @param wFormatTag {number}
     * @param bytesPerSample {number}
     */
    constructor(
        name,
        rate,
        pitch,
        pitchCorrection,
        loopStart,
        loopEnd,
        sampleDbAttenuation,
        dataChunk,
        wFormatTag,
        bytesPerSample
    )
    {
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
        this.dataOverriden = false;
        /**
         * @type {IndexedByteArray}
         */
        this.rawData = dataChunk.chunkData;
        this.wFormatTag = wFormatTag;
        this.bytesPerSample = bytesPerSample;
    }
    
    getAudioData()
    {
        if (!(this.rawData instanceof Uint8Array))
        {
            return new Float32Array(0);
        }
        if (!this.sampleData)
        {
            let sampleData;
            switch (this.wFormatTag)
            {
                default:
                    SpessaSynthWarn(`Failed to decode sample. Unknown wFormatTag: ${this.wFormatTag}`);
                    sampleData = new Float32Array(this.rawData.length / this.bytesPerSample);
                    break;
                
                case W_FORMAT_TAG.PCM:
                    sampleData = readPCM(this.rawData, this.bytesPerSample);
                    break;
                
                case W_FORMAT_TAG.ALAW:
                    sampleData = readALAW(this.rawData, this.bytesPerSample);
                    break;
                
            }
            this.setAudioData(sampleData);
        }
        return this.sampleData;
    }
    
    /**
     * @param audioData {Float32Array}
     */
    setAudioData(audioData)
    {
        super.setAudioData(audioData);
    }
    
    getRawData(allowVorbis)
    {
        if (this.dataOverriden || this.isCompressed)
        {
            return super.getRawData(allowVorbis);
        }
        if (this.wFormatTag === W_FORMAT_TAG.PCM && this.bytesPerSample === 2)
        {
            // copy straight away
            return this.rawData;
        }
        return this.encodeS16LE();
    }
}