import { RiffChunk } from "../basic_soundfont/riff_chunk.js";
import { IndexedByteArray } from "../../utils/indexed_array.js";
import { readLittleEndian, signedInt8 } from "../../utils/byte_functions/little_endian.js";
import { SpessaSynthInfo, SpessaSynthWarn } from "../../utils/loggin.js";
import { readBytesAsString } from "../../utils/byte_functions/string.js";
import { BasicSample, sampleTypes } from "../basic_soundfont/basic_sample.js";
import { consoleColors } from "../../utils/other.js";

/**
 * samples.js
 * purpose: parses soundfont samples
 */

export const SF3_BIT_FLIT = 0x10;

export class SoundFontSample extends BasicSample
{
    /**
     * Linked sample index for retrieving linked samples in sf2
     * @type {number}
     */
    linkedSampleIndex;
    
    /**
     * The sliced sample from the smpl chunk
     * @type {Uint8Array}
     */
    s16leData;
    
    /**
     * Creates a sample
     * @param sampleName {string}
     * @param sampleStartIndex {number}
     * @param sampleEndIndex {number}
     * @param sampleLoopStartIndex {number}
     * @param sampleLoopEndIndex {number}
     * @param sampleRate {number}
     * @param samplePitch {number}
     * @param samplePitchCorrection {number}
     * @param linkedSampleIndex {number}
     * @param sampleType {number}
     * @param sampleDataArray {IndexedByteArray|Float32Array}
     * @param sampleIndex {number} initial sample index when loading the sfont
     * Used for SF2Pack support
     */
    constructor(
        sampleName,
        sampleStartIndex,
        sampleEndIndex,
        sampleLoopStartIndex,
        sampleLoopEndIndex,
        sampleRate,
        samplePitch,
        samplePitchCorrection,
        linkedSampleIndex,
        sampleType,
        sampleDataArray,
        sampleIndex
    )
    {
        // read sf3
        // https://github.com/FluidSynth/fluidsynth/wiki/SoundFont3Format
        const compressed = (sampleType & SF3_BIT_FLIT) > 0;
        // remove the compression flag
        sampleType &= ~SF3_BIT_FLIT;
        super(
            sampleName,
            sampleRate,
            samplePitch,
            samplePitchCorrection,
            sampleType,
            sampleLoopStartIndex - (sampleStartIndex / 2),
            sampleLoopEndIndex - (sampleStartIndex / 2)
        );
        this.dataOverriden = false;
        this.isCompressed = compressed;
        this.sampleName = sampleName;
        // in bytes
        this.startByteOffset = sampleStartIndex;
        this.endByteOffset = sampleEndIndex;
        this.sampleID = sampleIndex;
        const smplStart = sampleDataArray.currentIndex;
        
        // three data types in:
        // SF2 (s16le)
        // SF3 (vorbis)
        // SF2Pack (
        if (this.isCompressed)
        {
            // correct loop points
            this.sampleLoopStartIndex += this.startByteOffset / 2;
            this.sampleLoopEndIndex += this.startByteOffset / 2;
            
            // copy the compressed data, it can be preserved during writing
            this.compressedData = sampleDataArray.slice(
                this.startByteOffset / 2 + smplStart,
                this.endByteOffset / 2 + smplStart
            );
        }
        else
        {
            if (sampleDataArray instanceof Float32Array)
            {
                // float32 array from SF2pack, copy directly
                this.sampleData = sampleDataArray.slice(
                    this.startByteOffset / 2,
                    this.endByteOffset / 2
                );
                this.dataOverriden = true;
            }
            else
            {
                // regular sf2 s16le
                this.s16leData = sampleDataArray.slice(
                    smplStart + this.startByteOffset,
                    smplStart + this.endByteOffset
                );
            }
            
        }
        this.linkedSampleIndex = linkedSampleIndex;
    }
    
    /**
     * @param samplesArray {BasicSample[]}
     */
    getLinkedSample(samplesArray)
    {
        if (this.linkedSample || !this.isLinked)
        {
            return;
        }
        const linkedSample = samplesArray[this.linkedSampleIndex];
        if (!linkedSample)
        {
            // log as info because it's common and not really dangerous
            SpessaSynthInfo(`%cInvalid linked sample for ${this.sampleName}. Setting to mono.`, consoleColors.warn);
            this.setSampleType(sampleTypes.monoSample);
        }
        else
        {
            this.setLinkedSample(samplesArray[this.linkedSampleIndex], this.sampleType);
        }
    }
    
    /**
     * @param audioData {Float32Array}
     */
    setAudioData(audioData)
    {
        super.setAudioData(audioData);
    }
    
    /**
     * Loads the audio data and stores it for reuse
     * @returns {Float32Array} The audioData
     */
    getAudioData()
    {
        if (this.sampleData)
        {
            return this.sampleData;
        }
        // SF2Pack is decoded during load time
        // SF3 is decoded in BasicSample
        if (this.isCompressed)
        {
            return super.getAudioData();
        }
        
        // start loading data if it is not loaded
        const byteLength = this.endByteOffset - this.startByteOffset;
        if (byteLength < 1)
        {
            SpessaSynthWarn(`Invalid sample ${this.sampleName}! Invalid length: ${byteLength}`);
            return new Float32Array(1);
        }
        
        
        // SF2
        // read the sample data
        let audioData = new Float32Array(byteLength / 2);
        let convertedSigned16 = new Int16Array(
            this.s16leData.buffer
        );
        
        // convert to float
        for (let i = 0; i < convertedSigned16.length; i++)
        {
            audioData[i] = convertedSigned16[i] / 32768;
        }
        
        this.sampleData = audioData;
        return audioData;
        
    }
    
    /**
     * @param allowVorbis
     * @returns {Uint8Array}
     */
    getRawData(allowVorbis)
    {
        if (this.dataOverriden || this.compressedData)
        {
            // return vorbis or encode manually
            return super.getRawData(allowVorbis);
        }
        // copy the smpl directly
        return this.s16leData;
    }
}

/**
 * Reads the generatorTranslator from the shdr read
 * @param sampleHeadersChunk {RiffChunk}
 * @param smplChunkData {IndexedByteArray|Float32Array}
 * @param linkSamples {boolean}
 * @returns {SoundFontSample[]}
 */
export function readSamples(sampleHeadersChunk, smplChunkData, linkSamples = true)
{
    /**
     * @type {SoundFontSample[]}
     */
    let samples = [];
    let index = 0;
    while (sampleHeadersChunk.chunkData.length > sampleHeadersChunk.chunkData.currentIndex)
    {
        const sample = readSample(index, sampleHeadersChunk.chunkData, smplChunkData);
        samples.push(sample);
        index++;
    }
    // remove EOS
    samples.pop();
    
    // link samples
    if (linkSamples)
    {
        samples.forEach(s => s.getLinkedSample(samples));
    }
    
    return samples;
}

/**
 * Reads it into a sample
 * @param index {number}
 * @param sampleHeaderData {IndexedByteArray}
 * @param smplArrayData {IndexedByteArray|Float32Array}
 * @returns {SoundFontSample}
 */
function readSample(index, sampleHeaderData, smplArrayData)
{
    
    // read the sample name
    let sampleName = readBytesAsString(sampleHeaderData, 20);
    
    // read the sample start index
    let sampleStartIndex = readLittleEndian(sampleHeaderData, 4) * 2;
    
    // read the sample end index
    let sampleEndIndex = readLittleEndian(sampleHeaderData, 4) * 2;
    
    // read the sample looping start index
    let sampleLoopStartIndex = readLittleEndian(sampleHeaderData, 4);
    
    // read the sample looping end index
    let sampleLoopEndIndex = readLittleEndian(sampleHeaderData, 4);
    
    // read the sample rate
    let sampleRate = readLittleEndian(sampleHeaderData, 4);
    
    // read the original sample pitch
    let samplePitch = sampleHeaderData[sampleHeaderData.currentIndex++];
    if (samplePitch > 127)
    {
        // if it's out of range, then default to 60
        samplePitch = 60;
    }
    
    // read the sample pitch correction
    let samplePitchCorrection = signedInt8(sampleHeaderData[sampleHeaderData.currentIndex++]);
    
    
    // read the link to the other channel
    let sampleLink = readLittleEndian(sampleHeaderData, 2);
    let sampleType = readLittleEndian(sampleHeaderData, 2);
    
    
    return new SoundFontSample(
        sampleName,
        sampleStartIndex,
        sampleEndIndex,
        sampleLoopStartIndex,
        sampleLoopEndIndex,
        sampleRate,
        samplePitch,
        samplePitchCorrection,
        sampleLink,
        sampleType,
        smplArrayData,
        index
    );
}