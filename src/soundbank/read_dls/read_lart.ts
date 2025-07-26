import { readRIFFChunk, RiffChunk } from "../basic_soundbank/riff_chunk";
import { readArticulation } from "./read_articulation";
import type { DownloadableSounds } from "./dls_soundfont";
import type { BasicZone } from "../basic_soundbank/basic_zone";

export function readLart(
    dls: DownloadableSounds,
    lartChunk: RiffChunk | undefined,
    lar2Chunk: RiffChunk | undefined,
    zone: BasicZone
) {
    if (lartChunk) {
        while (lartChunk.chunkData.currentIndex < lartChunk.chunkData.length) {
            const art1 = readRIFFChunk(lartChunk.chunkData);
            dls.verifyHeader(art1, "art1", "art2");
            const modsAndGens = readArticulation(art1, true);
            zone.addGenerators(...modsAndGens.generators);
            zone.addModulators(...modsAndGens.modulators);
        }
    }

    if (lar2Chunk) {
        while (lar2Chunk.chunkData.currentIndex < lar2Chunk.chunkData.length) {
            const art2 = readRIFFChunk(lar2Chunk.chunkData);
            dls.verifyHeader(art2, "art2", "art1");
            const modsAndGens = readArticulation(art2, false);
            zone.addGenerators(...modsAndGens.generators);
            zone.addModulators(...modsAndGens.modulators);
        }
    }
}
