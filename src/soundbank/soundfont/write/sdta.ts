import { SpessaSynthInfo } from "../../../utils/loggin";
import { consoleColors } from "../../../utils/other";
import type { BasicSoundBank } from "../../basic_soundbank/basic_soundbank";
import type { ProgressFunction } from "../../types";
import { RIFFChunk } from "../../../utils/riff_chunk";

/*
Sdta structure:

LIST chunk
- "sdta" ASCII string
- smpl chunk
- - raw data
 */

export function getSDTA(
    bank: BasicSoundBank,
    smplStartOffsets: number[],
    smplEndOffsets: number[],
    progressFunction?: ProgressFunction
) {
    // Write smpl: write int16 data of each sample linearly
    let writtenCount = 0;
    const sampleData: Uint8Array[] = [];
    const sampleSize: number[] = [];

    for (const s of bank.samples) {
        // Raw data: either copy s16le or encoded vorbis or encode manually if overridden
        // Use set timeout so the thread doesn't die
        const r = s.getRawData(true);
        writtenCount++;
        progressFunction?.(writtenCount / bank.samples.length);
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
        sampleData.push(r);
        sampleSize.push(r.length);
        if (!s.isCompressed) sampleData.push(new Uint8Array(92));
    }

    const smpl = RIFFChunk.getParts("smpl", sampleData);
    const sdta = RIFFChunk.getParts("sdta", smpl, true);

    let offset = 0;
    // Write out
    for (const [i, sample] of bank.samples.entries()) {
        const size = sampleSize[i];
        let startOffset;
        let endOffset;
        if (sample.isCompressed) {
            // Sf3 offset is in bytes
            startOffset = offset;
            endOffset = startOffset + size;
        } else {
            // Sf2 in sample data points
            startOffset = offset / 2; // Inclusive
            endOffset = startOffset + size / 2; // Exclusive
            offset += 92; // 46 sample data points
        }
        offset += size;
        smplStartOffsets.push(startOffset);

        smplEndOffsets.push(endOffset);
    }

    return sdta;
}
