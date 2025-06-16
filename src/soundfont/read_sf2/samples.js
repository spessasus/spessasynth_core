import { RiffChunk } from "../basic_soundfont/riff_chunk.js";
import { IndexedByteArray } from "../../utils/indexed_array.js";
import { readLittleEndian, signedInt8 } from "../../utils/byte_functions/little_endian.js";
import { stbvorbis } from "../../externals/stbvorbis_sync/stbvorbis_sync.min.js";
import { SpessaSynthWarn } from "../../utils/loggin.js";
import { readBytesAsString } from "../../utils/byte_functions/string.js";
import { BasicSample, sampleTypes } from "../basic_soundfont/basic_sample.js";

export const SF3_BIT_FLIT = 0x10;

export class SoundFontSample extends BasicSample
{
    /**
     * Linked sample index for retrieving linked samples in sf2
     * @type {number}
     */
    linkedSampleIndex;
    
    /**
     * The handle to the core sf2 file for dynamic sample reading
     * @type {Uint8Array}
     */
    sf2FileArrayHandle;
    
    /**
     * Start index of the sample in the file byte array
     * @type {number}
     */
    s16leStart = 0;
    /**
     * End index of the sample in the file byte array
     * @type {number}
     */
    s16leEnd = 0;
    
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
        this.isCompressed = compressed;
        this.sampleName = sampleName;
        // in bytes
        this.sampleStartIndex = sampleStartIndex;
        this.sampleEndIndex = sampleEndIndex;
        this.sampleID = sampleIndex;
        // in bytes
        this.sampleLength = this.sampleEndIndex - this.sampleStartIndex;
        const smplStart = sampleDataArray.currentIndex;
        
        // three data types in:
        // SF2 (s16le)
        // SF3 (vorbis)
        // SF2Pack (
        if (this.isCompressed)
        {
            // correct loop points
            this.sampleLoopStartIndex += this.sampleStartIndex / 2;
            this.sampleLoopEndIndex += this.sampleStartIndex / 2;
            this.sampleLength = 99999999; // set to 999,999 before we decode it
            
            // copy the compressed data, it can be preserved during writing
            this.compressedData = sampleDataArray.slice(
                this.sampleStartIndex / 2 + smplStart,
                this.sampleEndIndex / 2 + smplStart
            );
        }
        else
        {
            if (sampleDataArray instanceof Float32Array)
            {
                // float32 array from SF2pack, copy directly
                this.sampleData = sampleDataArray.slice(
                    this.sampleStartIndex / 2,
                    this.sampleEndIndex / 2
                );
            }
            else
            {
                // regular sf2 s16le
                this.s16leStart = smplStart + this.sampleStartIndex;
                this.s16leEnd = smplStart + this.sampleEndIndex;
                this.sf2FileArrayHandle = sampleDataArray;
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
            SpessaSynthWarn(`Invalid linked sample for ${this.sampleName}. Setting to mono.`);
            this.setSampleType(sampleTypes.monoSample);
        }
        else
        {
            this.setLinkedSample(samplesArray[this.linkedSampleIndex], this.sampleType);
        }
    }
    
    /**
     * @private
     * Decode binary vorbis into a float32 pcm
     * @returns {Float32Array}
     */
    decodeVorbis()
    {
        if (this.sampleData)
        {
            return this.sampleData;
        }
        if (this.sampleLength < 1)
        {
            // eos, do not do anything
            return new Float32Array(0);
        }
        // get the compressed byte stream
        // reset array and being decoding
        try
        {
            /**
             * @type {{data: Float32Array[], error: (string|null), sampleRate: number, eof: boolean}}
             */
            const vorbis = stbvorbis.decode(this.compressedData);
            const decoded = vorbis.data[0];
            if (decoded === undefined)
            {
                SpessaSynthWarn(`Error decoding sample ${this.sampleName}: Vorbis decode returned undefined.`);
                return new Float32Array(0);
            }
            // clip
            // because vorbis can go above 1 sometimes
            for (let i = 0; i < decoded.length; i++)
            {
                // magic number is 32,767 / 32,768
                decoded[i] = Math.max(-1, Math.min(decoded[i], 0.999969482421875));
            }
            return decoded;
        }
        catch (e)
        {
            // do not error out, fill with silence
            SpessaSynthWarn(`Error decoding sample ${this.sampleName}: ${e}`);
            return new Float32Array(this.sampleLoopEndIndex + 1);
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
        
        // start loading data if it is not loaded
        if (this.sampleLength < 1)
        {
            SpessaSynthWarn(`Invalid sample ${this.sampleName}! Invalid length: ${this.sampleLength}`);
            return new Float32Array(1);
        }
        
        if (this.isCompressed)
        {
            // SF3
            // if compressed, decode
            this.sampleData = this.decodeVorbis();
            return this.sampleData;
        }
        // SF2
        // read the sample data
        let audioData = new Float32Array(this.sampleLength / 2);
        let convertedSigned16 = new Int16Array(
            this.sf2FileArrayHandle.buffer.slice(this.s16leStart, this.s16leEnd)
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
    getRawData(allowVorbis = true)
    {
        if (this.dataOverriden)
        {
            return this.encodeS16LE();
        }
        else
        {
            if (this.compressedData && allowVorbis)
            {
                return this.compressedData;
            }
            return this.sf2FileArrayHandle.slice(this.s16leStart, this.s16leEnd);
        }
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