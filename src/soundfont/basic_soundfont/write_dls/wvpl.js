import { writeDLSSample } from "./wave.js";
import { writeRIFFChunkParts } from "../riff_chunk.js";

/**
 * @this {BasicSoundBank}
 * @param {ProgressFunction|undefined} progressFunction
 * @returns {Promise<{data: IndexedByteArray, indexes: number[] }>}
 */
export async function writeWavePool(progressFunction)
{
    let currentIndex = 0;
    const offsets = [];
    /**
     * @type {IndexedByteArray[]}
     */
    const samples = [];
    let written = 0;
    for (const s of this.samples)
    {
        const out = writeDLSSample(s);
        await progressFunction?.(s.sampleName, written, this.samples.length);
        offsets.push(currentIndex);
        currentIndex += out.length;
        samples.push(out);
        written++;
    }
    return {
        data: writeRIFFChunkParts(
            "wvpl",
            samples,
            true
        ),
        indexes: offsets
    };
}