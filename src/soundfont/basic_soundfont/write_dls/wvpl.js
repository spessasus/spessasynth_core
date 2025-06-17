import { writeDLSSample } from "./wave.js";
import { writeRIFFChunkParts } from "../riff_chunk.js";

/**
 * @this {BasicSoundBank}
 * @returns {{data: IndexedByteArray, indexes: number[] }}
 */
export function writeWavePool()
{
    let currentIndex = 0;
    const offsets = [];
    /**
     * @type {IndexedByteArray[]}
     */
    const samples = this.samples.map(s =>
    {
        const out = writeDLSSample(s);
        offsets.push(currentIndex);
        currentIndex += out.length;
        return out;
    });
    return {
        data: writeRIFFChunkParts(
            "wvpl",
            samples,
            true
        ),
        indexes: offsets
    };
}