import { IndexedByteArray } from "../../../utils/indexed_array";
import { readLittleEndianIndexed, signedInt8 } from "../../../utils/byte_functions/little_endian";
import { SpessaLog } from "../../../utils/loggin";
import { readBinaryString, decodeUtf8 } from "../../../utils/byte_functions/string";
import { BasicSample } from "../../basic_soundbank/basic_sample";
import { ConsoleColors } from "../../../utils/other";
import type { SampleType } from "../../enums";
import type { RIFFChunk } from "../../../utils/riff_chunk";

/**
 * Samples.ts
 * purpose: parses soundfont samples
 */

export const SF3_BIT_FLIT = 0x10;

export class SoundFontSample extends BasicSample {
    /**
     * Linked sample index for retrieving linked samples in sf2
     */
    public linkedSampleIndex: number;

    /**
     * The sliced sample from the smpl chunk.
     */
    protected s16leData?: Uint8Array;

    protected startByteOffset: number;

    protected endByteOffset: number;

    protected sampleID: number;

    /**
     * Creates a sample
     * @param sampleName
     * @param sampleStartIndex
     * @param sampleEndIndex
     * @param sampleLoopStartIndex
     * @param sampleLoopEndIndex
     * @param sampleRate
     * @param samplePitch
     * @param samplePitchCorrection
     * @param linkedSampleIndex
     * @param sampleType
     * @param sampleDataArray
     * @param sampleIndex initial sample index when loading the sfont
     * Used for SF2Pack support
     */
    public constructor(
        sampleName: string,
        sampleStartIndex: number,
        sampleEndIndex: number,
        sampleLoopStartIndex: number,
        sampleLoopEndIndex: number,
        sampleRate: number,
        samplePitch: number,
        samplePitchCorrection: number,
        linkedSampleIndex: number,
        sampleType: SampleType,
        sampleDataArray: IndexedByteArray | Float32Array,
        sampleIndex: number
    ) {
        // Read sf3
        // https://github.com/FluidSynth/fluidsynth/wiki/SoundFont3Format
        const compressed = (sampleType & SF3_BIT_FLIT) > 0;
        // Remove the compression flag
        sampleType &= ~SF3_BIT_FLIT;
        super(
            sampleName,
            sampleRate,
            samplePitch,
            samplePitchCorrection,
            sampleType as SampleType,
            sampleLoopStartIndex - sampleStartIndex / 2,
            sampleLoopEndIndex - sampleStartIndex / 2
        );
        this.dataOverridden = false;
        this.name = sampleName;
        // In bytes
        this.startByteOffset = sampleStartIndex;
        this.endByteOffset = sampleEndIndex;
        this.sampleID = sampleIndex;
        const smplStart =
            sampleDataArray instanceof IndexedByteArray
                ? sampleDataArray.currentIndex
                : 0;

        // Three data types in:
        // SF2 (s16le)
        // SF3 (vorbis)
        // SF2Pack (entire smpl vorbis)
        if (sampleDataArray instanceof IndexedByteArray) {
            if (compressed) {
                const sampleData: Uint8Array<ArrayBufferLike> = sampleDataArray.slice(
                    this.startByteOffset / 2 + smplStart,
                    this.endByteOffset / 2 + smplStart
                )
                // Read sample header. Currently only vorbis is supported.
                const sampleHeader: string = readBinaryString(sampleData, 4, 0);   

                switch(sampleHeader)
                {
                    default:
                        throw new Error(`Unsupported sample type: ${sampleHeader}`);
                    case "OggS": {
                        const hdr: string = readBinaryString(sampleData, 7, 29);
                        switch(hdr)
                        {
                            default:
                                throw new Error(`Unsupported sample type: ${hdr}`);
                                break;

                            case "pusHead":
                                // Opus
                                throw new Error(`Opus is currently unsupported. More information at https://github.com/SFe-Team-was-taken/SFeReferenceImplementation_Core/issues/1.`);
                                break;

                            case "vorbis":
                                // Vorbis - supported
                        }
                        break;
                    }
                    case "fLaC":
                        // FLAC
                        throw new Error(`FLAC is currently unsupported. More information at https://github.com/SFe-Team-was-taken/SFeReferenceImplementation_Core/issues/1.`);
                        break;
                    case "RIFF": {
                        const wave: string = readBinaryString(sampleData, 4, 8);
                        if(wave !== "WAVE"){
                            throw new Error(`Unsupported sample type: ${wave}`);
                        } else {
                            // WAV
                        }
                    }
                }
                
                // Correct loop points
                this.loopStart += this.startByteOffset / 2;
                this.loopEnd += this.startByteOffset / 2;

                // Copy the compressed/containerised data, it can be preserved during writing
                this.setCompressedData(
                    sampleData
                );
            } else {
                // Regular sf2 s16le 
                this.s16leData = sampleDataArray.slice(
                    smplStart + this.startByteOffset,
                    smplStart + this.endByteOffset
                );
            }
        } else {
            // Float32 array from SF2pack, copy directly
            this.setAudioData(
                sampleDataArray.slice(
                    this.startByteOffset / 2,
                    this.endByteOffset / 2
                ),
                sampleRate
            );
        }
        this.linkedSampleIndex = linkedSampleIndex;
    }

    public getLinkedSample(samplesArray: BasicSample[]) {
        if (this.linkedSample || !this.isLinked) {
            return;
        }
        const linked = samplesArray[this.linkedSampleIndex];
        if (linked) {
            // Check for corrupted files (like FluidR3_GM.sf2 that link EVERYTHING to a single sample)
            if (linked.linkedSample) {
                SpessaLog.info(
                    `%cInvalid linked sample for ${this.name}: ${linked.name} is already linked to ${linked.linkedSample.name}`,
                    ConsoleColors.warn
                );
                this.unlinkSample();
            } else {
                this.setLinkedSample(linked, this.sampleType);
            }
        } else {
            // Log as info because it's common and not really dangerous
            SpessaLog.info(
                `%cInvalid linked sample for ${this.name}. Setting to mono.`,
                ConsoleColors.warn
            );
            this.unlinkSample();
        }
    }

    /**
     * Loads the audio data and stores it for reuse
     * @returns  The audio data
     */
    public getAudioData(): Float32Array {
        if (this.audioData) {
            return this.audioData;
        }
        // SF2Pack is decoded during load time
        // SF3 is decoded in BasicSample
        if (this.isCompressed) {
            return super.getAudioData();
        }
        if (!this.s16leData) {
            console.error(this);
            throw new Error("Unexpected lack of audio data.");
        }

        // Start loading data if it is not loaded
        const byteLength = this.endByteOffset - this.startByteOffset;
        if (byteLength < 1) {
            SpessaLog.warn(
                `Invalid sample ${this.name}! Invalid length: ${byteLength}`
            );
            return new Float32Array(1);
        }

        // SF2
        // Read the sample data
        const audioData = new Float32Array(byteLength / 2);
        const convertedSigned16 = new Int16Array(this.s16leData.buffer);

        // Convert to float
        const l = convertedSigned16.length;
        for (let i = 0; i < l; i++) {
            audioData[i] = convertedSigned16[i] / 32_768;
        }

        this.audioData = audioData;
        return audioData;
    }

    public getRawData(allowVorbis: boolean): Uint8Array {
        if (this.dataOverridden || this.compressedData) {
            // Return vorbis or encode manually
            return super.getRawData(allowVorbis);
        }
        // Copy the smpl directly
        return this.s16leData ?? new Uint8Array(0);
    }
}

/**
 * Reads the samples from the shdr chunk
 */
export function readSamples(
    sampleHeadersChunk: RIFFChunk,
    smplChunkData: IndexedByteArray | Float32Array,
    linkSamples = true,
    useXdta = false,
    xdtaChunk: RIFFChunk | undefined = undefined,
    is64Bit = false,
    sfeMajorVersion = 4,
): SoundFontSample[] {
    const samples: SoundFontSample[] = [];
    let index = 0;
    let xdtaChunkData;
    let uncontainerisedSamples = false;
    let mixedSamples = false;
    if (useXdta && xdtaChunk) {
        xdtaChunkData = xdtaChunk.data;
    } else {
        xdtaChunkData = undefined;
    }
    while (
        sampleHeadersChunk.data.length > sampleHeadersChunk.data.currentIndex
    ) {
        const sample = readSample(
            index,
            sampleHeadersChunk.data,
            smplChunkData,
            useXdta,
            xdtaChunkData,
            is64Bit
        );
        if (!sample.isCompressed && sfeMajorVersion >= 4 && !uncontainerisedSamples) {
            uncontainerisedSamples = true;
        } else if (sample.isCompressed && sfeMajorVersion >= 4 && uncontainerisedSamples) {
            mixedSamples = true;
        }
        samples.push(sample);
        index++;
    }
    // Remove EOS
    samples.pop();

    // Link samples
    if (linkSamples) {
        for (const s of samples) s.getLinkedSample(samples);
    }

    if (uncontainerisedSamples) {
        SpessaLog.warn("This SFe bank contains uncontainerised samples. Future SFe sample features may not be usable.");
    }
    if (mixedSamples) {
        SpessaLog.warn("This SFe bank contains mixed sample containerisation, which has been deprecated.");
    }

    return samples;
}

/**
 * Reads it into a sample
 */
function readSample(
    index: number,
    sampleHeaderData: IndexedByteArray,
    smplArrayData: IndexedByteArray | Float32Array,
    useXdta: boolean,
    xdtaChunkData: IndexedByteArray | undefined,
    is64Bit: boolean
): SoundFontSample {
    // Read the sample name
    console.log(is64Bit);
    const sampleNameArray = new IndexedByteArray(40);
    sampleNameArray.set(sampleHeaderData.slice(sampleHeaderData.currentIndex, sampleHeaderData.currentIndex + 20), 0)
    sampleHeaderData.currentIndex += 20;
    if (useXdta && xdtaChunkData)
    {
        sampleNameArray.set(xdtaChunkData.slice(xdtaChunkData.currentIndex, xdtaChunkData.currentIndex + 20), 20)
        xdtaChunkData.currentIndex += 20;
    }
    const sampleName = decodeUtf8(sampleNameArray) ?? "Sample";

    // Read the sample start index
    const sampleStartIndex = readLittleEndianIndexed(sampleHeaderData, 4) * 2;

    // Read the sample end index
    const sampleEndIndex = readLittleEndianIndexed(sampleHeaderData, 4) * 2;

    // Read the sample looping start index
    const sampleLoopStartIndex = readLittleEndianIndexed(sampleHeaderData, 4);

    // Read the sample looping end index
    const sampleLoopEndIndex = readLittleEndianIndexed(sampleHeaderData, 4);

    // Read the sample rate
    const sampleRate = readLittleEndianIndexed(sampleHeaderData, 4);

    // Read the original sample pitch
    let samplePitch = sampleHeaderData[sampleHeaderData.currentIndex++];
    if (samplePitch > 127) {
        // If it's out of range, then default to 60
        samplePitch = 60;
    }

    // Read the sample pitch correction
    const samplePitchCorrection = signedInt8(
        sampleHeaderData[sampleHeaderData.currentIndex++]
    );

    // Skip 22 bytes on xdta for now 
    if (useXdta && xdtaChunkData) {
        xdtaChunkData.currentIndex += 22;
    }
    // Read the link to the other channel
    let sampleLink = readLittleEndianIndexed(sampleHeaderData, 2);
    if (useXdta && xdtaChunkData) {
       sampleLink += (readLittleEndianIndexed(xdtaChunkData, 2) << 16);
    }
    const sampleType = readLittleEndianIndexed(
        sampleHeaderData,
        2
    ) as SampleType;

    // Skip 2 bytes on xdta for now 
    if (useXdta && xdtaChunkData) {
        xdtaChunkData.currentIndex += 2;
    }
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
