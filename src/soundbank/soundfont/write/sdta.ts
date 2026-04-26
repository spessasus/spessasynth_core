import { IndexedByteArray } from "../../../utils/indexed_array";
import { writeBinaryStringIndexed } from "../../../utils/byte_functions/string";
import { writeLittleEndianIndexed } from "../../../utils/byte_functions/little_endian";
import { SpessaSynthInfo } from "../../../utils/loggin";
import { consoleColors } from "../../../utils/other";
import type { BasicSoundBank } from "../../basic_soundbank/basic_soundbank";

/*
Sdta structure:

LIST chunk
- "sdta" ASCII string
- smpl chunk
- - raw data
 */

// In bytes, from the start of sdta-LIST to the first actual sample
const SDTA_TO_DATA_OFFSET =
    4 + // "LIST"
    4 + // Sdta size
    4 + // "sdta"
    4 + // "smpl"
    4; // Smpl size

export function getSDTA(
    bank: BasicSoundBank,
    smplStartOffsets: number[],
    smplEndOffsets: number[]
) {
    // Write smpl: write int16 data of each sample linearly
    // Get size (calling getAudioData twice doesn't matter since it gets cached)
    let writtenCount = 0;
    let smplChunkSize = 0;
    const sampleData: Uint8Array[] = [];

    for (const s of bank.samples) {
        // Raw data: either copy s16le or encoded vorbis or encode manually if overridden
        // Use set timeout so the thread doesn't die
        const r = s.getRawData(true);
        writtenCount++;
        SpessaSynthInfo(
            `%cWrote sample %c${writtenCount}. ${s.name}%c of %c${bank.samples.length}.`,
            consoleColors.info,
            consoleColors.recognized,
            consoleColors.info,
            consoleColors.recognized
        );

        /* 6.1 Sample Data Format in the smpl Sub-chunk
        Each sample is followed by a minimum of forty-six zero
        valued sample data points. These zero valued data points are necessary to guarantee that any reasonable upward pitch shift
        using any reasonable interpolator can loop on zero data at the end of the sound.
        This doesn't apply to sf3 tho
         */
        smplChunkSize += r.length + (s.isCompressed ? 0 : 92);
        sampleData.push(r);
    }

    if (smplChunkSize % 2 !== 0) {
        smplChunkSize++;
    }

    const sdta = new IndexedByteArray(smplChunkSize + SDTA_TO_DATA_OFFSET);

    // Avoid using writeRIFFChunk for performance
    // Sdta chunk
    writeBinaryStringIndexed(sdta, "LIST");
    // "sdta" + full smpl length
    writeLittleEndianIndexed(sdta, smplChunkSize + SDTA_TO_DATA_OFFSET - 8, 4);
    writeBinaryStringIndexed(sdta, "sdta");
    writeBinaryStringIndexed(sdta, "smpl");
    writeLittleEndianIndexed(sdta, smplChunkSize, 4);

    let offset = 0;
    // Write out
    for (const [i, sample] of bank.samples.entries()) {
        const data = sampleData[i];
        sdta.set(data, offset + SDTA_TO_DATA_OFFSET);
        let startOffset;
        let endOffset;
        if (sample.isCompressed) {
            // Sf3 offset is in bytes
            startOffset = offset;
            endOffset = startOffset + data.length;
        } else {
            // Sf2 in sample data points
            startOffset = offset / 2; // Inclusive
            endOffset = startOffset + data.length / 2; // Exclusive
            offset += 92; // 46 sample data points
        }
        offset += data.length;
        smplStartOffsets.push(startOffset);

        smplEndOffsets.push(endOffset);
    }

    return sdta;
}
