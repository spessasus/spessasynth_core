/**
 * samples.js
 * purpose: parses soundfont samples, resamples if needed.
 * loads sample data, handles async loading of sf3 compressed samples
 */
import { SpessaSynthWarn } from "../../utils/loggin.js";

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
     * The type of the sample, it can indicate an SF3 sample
     * @type {sampleTypes|number}
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
     * Indicates if the sample is compressed
     * @type {boolean}
     */
    isCompressed;
    
    /**
     * The compressed sample data if it was compressed by spessasynth
     * @type {Uint8Array}
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
     * The basic representation of a soundfont sample
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
        this.setSampleType(sampleType);
    }
    
    /**
     * If the sample is linked to another sample
     * @returns {boolean}
     */
    get isLinked()
    {
        return !this.isCompressed &&
            (this.sampleType === sampleTypes.rightSample ||
                this.sampleType === sampleTypes.leftSample ||
                this.sampleType === sampleTypes.linkedSample);
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
     * @returns {Uint8Array|IndexedByteArray}
     */
    getRawData()
    {
        const uint8 = new Uint8Array(this.sampleData.length * 2);
        for (let i = 0; i < this.sampleData.length; i++)
        {
            const sample = Math.floor(this.sampleData[i] * 32768);
            uint8[i * 2] = sample & 0xFF; // lower byte
            uint8[i * 2 + 1] = (sample >> 8) & 0xFF; // upper byte
        }
        return uint8;
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
            this.setSampleType(this.sampleType | 0x10);
        }
        catch (e)
        {
            SpessaSynthWarn(`Failed to compress ${this.sampleName}. Leaving as uncompressed!`);
            this.compressedData = undefined;
            // flag as uncompressed
            this.setSampleType(this.sampleType & 0xEF);
        }
        
    }
    
    /**
     * @param type {sampleTypes|number}
     */
    setSampleType(type)
    {
        this.sampleType = type;
        // https://github.com/FluidSynth/fluidsynth/wiki/SoundFont3Format
        this.isCompressed = (type & 0x10) > 0;
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
        if ((type & 0x8000) > 0 && this.linkedSample)
        {
            throw new Error("ROM samples cannot be linked.");
        }
        
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
     * @param sample {BasicSample}
     * @param type {sampleTypes}
     */
    setLinkedSample(sample, type)
    {
        if (this.isCompressed)
        {
            throw new Error("Cannot link a compressed sample.");
        }
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
    
    // noinspection JSUnusedGlobalSymbols
    /**
     * @param audioData {Float32Array}
     * @virtual
     */
    setAudioData(audioData)
    {
        this.isCompressed = false;
        delete this.compressedData;
        this.sampleData = audioData;
    }
}