import { writeDLSSample } from "./wave.js";
import { writeRIFFChunkParts } from "../riff_chunk.js";
import type { BasicSoundBank } from "../basic_soundbank.ts";
import type { ProgressFunction } from "../../types.ts";
import type { IndexedByteArray } from "../../../utils/indexed_array.ts";

export async function writeWavePool(
    bank: BasicSoundBank,
    progressFunction: ProgressFunction | undefined
): Promise<{ data: IndexedByteArray; indexes: number[] }> {
    let currentIndex = 0;
    const offsets = [];
    const samples: IndexedByteArray[] = [];
    let written = 0;
    for (const s of bank.samples) {
        const out = writeDLSSample(s);
        await progressFunction?.(s.sampleName, written, bank.samples.length);
        offsets.push(currentIndex);
        currentIndex += out.length;
        samples.push(out);
        written++;
    }
    return {
        data: writeRIFFChunkParts("wvpl", samples, true),
        indexes: offsets
    };
}
