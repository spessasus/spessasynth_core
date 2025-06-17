/**
 * samples.js
 * purpose: parses soundfont samples, resamples if needed.
 * loads sample data, handles async loading of sf3 compressed samples
 */
import { SpessaSynthWarn } from "../../utils/loggin.js";
import { IndexedByteArray } from "../../utils/indexed_array.js";

// should be reasonable for most cases
const RESAMPLE_RATE = 48000;

/**
 * @enum {number}
 */
export const sampleTypes = {
    monoSample: 1,
    rightSample: 2,
    leftSample: 4,
    linkedSample: 8,
    romMonoSample: 32769,
    romRightSample: 32770,
    romLeftSample: 32772,
    romLinkedSample: 32776
};

/**
 * @typedef {function} EncodeVorbisFunction
 * @param channelAudioData {Float32Array[]}
 * @param sampleRate {number}
 * @param channels {number}
 * @param quality {number} -0.1 to 1
 * @returns {Uint8Array}
 */

export class BasicSample
{
    
    /**
     * The sample's name
     * @type {string}
     */
    sampleName;
    
    /**
     * Sample rate in Hz
     * @type {number}
     */
    sampleRate;
    
    /**
     * Original pitch of the sample as a MIDI note number
     * @type {number}
     */
    samplePitch;
    
    /**
     * Pitch correction, in cents. Can be negative
     * @type {number}
     */
    samplePitchCorrection;
    
    /**
     * Linked sample, unused if mono
     * @type {BasicSample|undefined}
     */
    linkedSample;
    
    /**
     * The type of the sample
     * @type {sampleTypes}
     */
    sampleType;
    
    /**
     * Relative to the start of the sample in sample points
     * @type {number}
     */
    sampleLoopStartIndex;
    
    /**
     * Relative to the start of the sample in sample points
     * @type {number}
     */
    sampleLoopEndIndex;
    
    /**
     * Indicates if the sample is compressed using vorbis SF3
     * @type {boolean}
     */
    isCompressed;
    
    /**
     * The compressed sample data if the sample has been compressed
     * @type {Uint8Array|undefined}
     */
    compressedData = undefined;
    /**
     * Sample's linked instruments (the instruments that use it)
     * note that duplicates are allowed since one instrument can use the same sample multople times
     * @type {BasicInstrument[]}
     */
    linkedInstruments = [];
    /**
     * The sample's audio data
     * @type {Float32Array}
     */
    sampleData = undefined;
    
    /**
     * Indicates if the data was overriden, so it cannot be copied back unchanged
     * @type {boolean}
     */
    dataOverriden = false;
    
    /**
     * The basic representation of a sample
     * @param sampleName {string} The sample's name
     * @param sampleRate {number} The sample's rate in Hz
     * @param samplePitch {number} The sample's pitch as a MIDI note number
     * @param samplePitchCorrection {number} The sample's pitch correction in cents
     * @param sampleType {sampleTypes|number} The sample's type, an enum that can indicate SF3
     * @param loopStart {number} The sample's loop start relative to the sample start in sample points
     * @param loopEnd {number} The sample's loop end relative to the sample start in sample points
     */
    constructor(
        sampleName,
        sampleRate,
        samplePitch,
        samplePitchCorrection,
        sampleType,
        loopStart,
        loopEnd
    )
    {
        this.sampleName = sampleName;
        this.sampleRate = sampleRate;
        this.samplePitch = samplePitch;
        this.samplePitchCorrection = samplePitchCorrection;
        this.sampleLoopStartIndex = loopStart;
        this.sampleLoopEndIndex = loopEnd;
        this.sampleType = sampleType;
    }
    
    /**
     * If the sample is linked to another sample
     * @returns {boolean}
     */
    get isLinked()
    {
        return this.sampleType === sampleTypes.rightSample ||
            this.sampleType === sampleTypes.leftSample ||
            this.sampleType === sampleTypes.linkedSample;
    }
    
    /**
     * The sample's use count
     * @type {number}
     */
    get useCount()
    {
        return this.linkedInstruments.length;
    }
    
    /**
     * Get raw data for writing the file
     * @param allowVorbis {boolean}
     * @return {Uint8Array} either s16 or vorbis data
     * @virtual
     */
    getRawData(allowVorbis = true)
    {
        return this.encodeS16LE();
    }
    
    resampleData(newSampleRate)
    {
        let audioData = this.getAudioData();
        const ratio = newSampleRate / this.sampleRate;
        const resampled = new Float32Array(Math.floor(audioData.length * ratio));
        for (let i = 0; i < resampled.length; i++)
        {
            resampled[i] = audioData[Math.floor(i * (1 / ratio))];
        }
        audioData = resampled;
        this.sampleRate = newSampleRate;
        // adjust loop points
        this.sampleLoopStartIndex = Math.floor(this.sampleLoopStartIndex * ratio);
        this.sampleLoopEndIndex = Math.floor(this.sampleLoopEndIndex * ratio);
        this.sampleData = audioData;
    }
    
    /**
     * @param quality {number}
     * @param encodeVorbis {EncodeVorbisFunction}
     */
    compressSample(quality, encodeVorbis)
    {
        // no need to compress
        if (this.isCompressed)
        {
            return;
        }
        // compress, always mono!
        try
        {
            // if the sample rate is too low or too high, resample
            let audioData = this.getAudioData();
            if (this.sampleRate < 8000 || this.sampleRate > 96000)
            {
                this.resampleData(RESAMPLE_RATE);
                audioData = this.getAudioData();
            }
            this.compressedData = encodeVorbis([audioData], 1, this.sampleRate, quality);
            // flag as compressed
            this.isCompressed = true;
            // allow the data to be copied from the compressedData chunk during the write operation
            this.dataOverriden = false;
        }
        catch (e)
        {
            SpessaSynthWarn(`Failed to compress ${this.sampleName}. Leaving as uncompressed!`);
            delete this.compressedData;
            // flag as uncompressed
            this.isCompressed = false;
        }
        
    }
    
    /**
     * @param type {sampleTypes|number}
     */
    setSampleType(type)
    {
        this.sampleType = type;
        if (!this.isLinked)
        {
            // unlink the other sample
            if (this.linkedSample)
            {
                this.linkedSample.linkedSample = undefined;
                this.linkedSample.sampleType = type;
            }
            
            this.linkedSample = undefined;
        }
        if ((type & 0x8000) > 0)
        {
            throw new Error("ROM samples are not supported.");
        }
        
    }
    
    deleteSample()
    {
        if (this.useCount > 0)
        {
            throw new Error(`Cannot delete sample that has ${this.useCount} usages.`);
        }
        this.unlinkSample();
    }
    
    // noinspection JSUnusedGlobalSymbols
    /**
     * Unlinks a sample link
     */
    unlinkSample()
    {
        this.setSampleType(sampleTypes.monoSample);
    }
    
    // noinspection JSUnusedGlobalSymbols
    /**
     * Links a stereo sample
     * @param sample {BasicSample} the sample to link to
     * @param type {sampleTypes} either left, right or linked
     */
    setLinkedSample(sample, type)
    {
        this.linkedSample = sample;
        sample.linkedSample = this;
        if (type === sampleTypes.leftSample)
        {
            this.setSampleType(sampleTypes.leftSample);
            sample.setSampleType(sampleTypes.rightSample);
        }
        else if (type === sampleTypes.rightSample)
        {
            this.setSampleType(sampleTypes.rightSample);
            sample.setSampleType(sampleTypes.leftSample);
        }
        else if (type === sampleTypes.linkedSample)
        {
            this.setSampleType(sampleTypes.linkedSample);
            sample.setSampleType(sampleTypes.linkedSample);
        }
        else
        {
            throw new Error("Invalid sample type: " + type);
        }
    }
    
    /**
     * @param instrument {BasicInstrument}
     */
    linkTo(instrument)
    {
        this.linkedInstruments.push(instrument);
    }
    
    /**
     * @param instrument {BasicInstrument}
     */
    unlinkFrom(instrument)
    {
        const index = this.linkedInstruments.indexOf(instrument);
        if (index < 0)
        {
            throw new Error(`Cannot unlink ${instrument.instrumentName} from ${this.sampleName}: not linked.`);
        }
        this.linkedInstruments.splice(index, 1);
    }
    
    /**
     * @returns {Float32Array}
     * @virtual
     */
    getAudioData()
    {
        if (!this.sampleData)
        {
            throw new Error("Error! Sample data is undefined. Is the method overriden properly?");
        }
        return this.sampleData;
    }
    
    /**
     * Encodes s16le sample
     * @return {IndexedByteArray}
     */
    encodeS16LE()
    {
        const data = this.getAudioData();
        const data16 = new Int16Array(data.length);
        const len = data.length;
        for (let i = 0; i < len; i++)
        {
            let sample = data[i] * 32768;
            // Clamp for safety (do not use Math.max/Math.min here)
            if (sample > 32767)
            {
                sample = 32767;
            }
            else if (sample < -32768)
            {
                sample = -32768;
            }
            data16[i] = sample;
        }
        return new IndexedByteArray(data16.buffer);
    }
    
    // noinspection JSUnusedGlobalSymbols
    /**
     * REPLACES the audio data
     * @param audioData {Float32Array}
     * @virtual
     */
    setAudioData(audioData)
    {
        this.isCompressed = false;
        delete this.compressedData;
        this.sampleData = audioData;
        this.dataOverriden = true;
    }
}