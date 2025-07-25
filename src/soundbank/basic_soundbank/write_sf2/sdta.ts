import { IndexedByteArray } from "../../../utils/indexed_array.js";
import { writeStringAsBytes } from "../../../utils/byte_functions/string.js";
import { writeLittleEndian } from "../../../utils/byte_functions/little_endian.js";
import { SpessaSynthInfo } from "../../../utils/loggin.js";
import { consoleColors } from "../../../utils/other.js";

/*
Sdta structure:

LIST chunk
- "sdta" ASCII string
- smpl chunk
- - raw data
 */

// in bytes, from the start of sdta-LIST to the first actual sample
const SDTA_TO_DATA_OFFSET =
    4 + // "LIST"
    4 + // sdta size
    4 + // "sdta"
    4 + // "smpl"
    4;  // smpl size

/**
 * @this {BasicSoundBank}
 * @param smplStartOffsets {number[]}
 * @param smplEndOffsets {number[]}
 * @param compress {boolean}
 * @param decompress {boolean}
 * @param vorbisFunc {SampleEncodingFunction}
 * @param progressFunc {ProgressFunction|undefined}
 * @returns {Uint8Array}
 */
export async function getSDTA(smplStartOffsets,
                              smplEndOffsets,
                              compress,
                              decompress,
                              vorbisFunc,
                              progressFunc
)
{
    // write smpl: write int16 data of each sample linearly
    // get size (calling getAudioData twice doesn't matter since it gets cached)
    let writtenCount = 0;
    let smplChunkSize = 0;
    const sampleDatas = [];
    
    // linear async is faster here as the writing function usually uses a single wasm instance
    for (const s of this.samples)
    {
        if (compress)
        {
            await s.compressSample(vorbisFunc);
        }
        if (decompress)
        {
            s.setAudioData(s.getAudioData());
        }
        
        // raw data: either copy s16le or encoded vorbis or encode manually if overridden
        // use set timeout so the thread doesn't die
        const r = s.getRawData(true);
        writtenCount++;
        progressFunc?.(s.sampleName, writtenCount, this.samples.length);
        
        SpessaSynthInfo(
            `%cEncoded sample %c${writtenCount}. ${s.sampleName}%c of %c${this.samples.length}%c. Compressed: %c${s.isCompressed}%c.`,
            consoleColors.info,
            consoleColors.recognized,
            consoleColors.info,
            consoleColors.recognized,
            consoleColors.info,
            s.isCompressed ? consoleColors.recognized : consoleColors.unrecognized,
            consoleColors.info
        );
        
        /* 6.1 Sample Data Format in the smpl Sub-chunk
        Each sample is followed by a minimum of forty-six zero
        valued sample data points. These zero valued data points are necessary to guarantee that any reasonable upward pitch shift
        using any reasonable interpolator can loop on zero data at the end of the sound.
        This doesn't apply to sf3 tho
         */
        smplChunkSize += r.length + (s.isCompressed ? 0 : 92);
        sampleDatas.push(r);
    }
    
    if (smplChunkSize % 2 !== 0)
    {
        smplChunkSize++;
    }
    
    const sdta = new IndexedByteArray(smplChunkSize + SDTA_TO_DATA_OFFSET);
    
    // avoid using writeRIFFChunk for performance
    // sdta chunk
    writeStringAsBytes(sdta, "LIST");
    // "sdta" + full smpl length
    writeLittleEndian(sdta, smplChunkSize + SDTA_TO_DATA_OFFSET - 8, 4);
    writeStringAsBytes(sdta, "sdta");
    writeStringAsBytes(sdta, "smpl");
    writeLittleEndian(sdta, smplChunkSize, 4);
    
    let offset = 0;
    // write out
    this.samples.forEach((sample, i) =>
    {
        const data = sampleDatas[i];
        sdta.set(data, offset + SDTA_TO_DATA_OFFSET);
        let startOffset;
        let endOffset;
        if (sample.isCompressed)
        {
            // sf3 offset is in bytes
            startOffset = offset;
            endOffset = startOffset + data.length;
        }
        else
        {
            // sf2 in sample data points
            startOffset = offset / 2; // inclusive
            endOffset = startOffset + data.length / 2; // exclusive
            offset += 92; // 46 sample data points
        }
        offset += data.length;
        smplStartOffsets.push(startOffset);
        
        smplEndOffsets.push(endOffset);
    });
    
    return sdta;
}