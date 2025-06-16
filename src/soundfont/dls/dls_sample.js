import { BasicSample, sampleTypes } from "../basic_soundfont/basic_sample.js";
import { SpessaSynthWarn } from "../../utils/loggin.js";
import { readLittleEndian } from "../../utils/byte_functions/little_endian.js";

const W_FORMAT_TAG = {
    PCM: 0x01,
    ALAW: 0x6
};


/**
 * @param dataChunk {RiffChunk}
 * @param bytesPerSample {number}
 * @returns {Float32Array}
 */
function readPCM(dataChunk, bytesPerSample)
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
    const sampleLength = dataChunk.size / bytesPerSample;
    const sampleData = new Float32Array(sampleLength);
    if (bytesPerSample === 2)
    {
        // special optimized case for s16 (most common)
        const s16 = new Int16Array(dataChunk.chunkData.buffer);
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
            let sample = readLittleEndian(dataChunk.chunkData, bytesPerSample);
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
 * @param dataChunk {RiffChunk}
 * @param bytesPerSample {number}
 * @returns {Float32Array}
 */
function readALAW(dataChunk, bytesPerSample)
{
    const sampleLength = dataChunk.size / bytesPerSample;
    const sampleData = new Float32Array(sampleLength);
    for (let i = 0; i < sampleData.length; i++)
    {
        // read
        const input = readLittleEndian(dataChunk.chunkData, bytesPerSample);
        
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
    
    isLoaded = false;
    
    /**
     * @type {RiffChunk}
     */
    sampleDataChunk;
    
    /**
     * @type {number}
     */
    wFormatTag;
    
    /**
     * @type {number}
     */
    bytesPerSample;
    
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
        this.sampleDataChunk = dataChunk;
        this.wFormatTag = wFormatTag;
        this.bytesPerSample = bytesPerSample;
    }
    
    getAudioData()
    {
        if (!this.isLoaded)
        {
            let sampleData;
            switch (this.wFormatTag)
            {
                default:
                    SpessaSynthWarn(`Failed to decode sample. Unknown wFormatTag: ${this.wFormatTag}`);
                    sampleData = new Float32Array(this.sampleDataChunk.size / this.bytesPerSample);
                    break;
                
                case W_FORMAT_TAG.PCM:
                    sampleData = readPCM(this.sampleDataChunk, this.bytesPerSample);
                    break;
                
                case W_FORMAT_TAG.ALAW:
                    sampleData = readALAW(this.sampleDataChunk, this.bytesPerSample);
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
        this.isLoaded = true;
        super.setAudioData(audioData);
    }
    
    getRawData()
    {
        if (this.isCompressed)
        {
            if (!this.compressedData)
            {
                throw new Error("Compressed but no data?? This shouldn't happen!!");
            }
            return this.compressedData;
        }
        // turn into s16
        return super.getRawData();
    }
}