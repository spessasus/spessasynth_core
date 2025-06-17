import { writeRIFFChunkParts } from "../riff_chunk.js";
import { writeIns } from "./ins.js";

/**
 * @this {BasicSoundBank}
 * @returns {IndexedByteArray}
 */
export function writeLins()
{
    return writeRIFFChunkParts(
        "lins",
        this.presets.map(p => writeIns.apply(this, [p])),
        true
    );
}