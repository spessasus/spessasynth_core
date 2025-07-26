import { writeDLSSample } from "./wave";
import { writeRIFFChunkParts } from "../riff_chunk";
import type { BasicSoundBank } from "../basic_soundbank";
import type { ProgressFunction } from "../../types";
import type { IndexedByteArray } from "../../../utils/indexed_array";

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
