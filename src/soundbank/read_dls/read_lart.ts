import { readRIFFChunk, RIFFChunk } from "../basic_soundbank/riff_chunk";
import { readArticulation } from "./read_articulation";
import type { DownloadableSounds } from "./downloadable_sounds";
import type { BasicZone } from "../basic_soundbank/basic_zone";

export function readLart(
    this: DownloadableSounds,
    lartChunk: RIFFChunk | undefined,
    lar2Chunk: RIFFChunk | undefined,
    zone: BasicZone
) {
    if (lartChunk) {
        while (lartChunk.chunkData.currentIndex < lartChunk.chunkData.length) {
            const art1 = readRIFFChunk(lartChunk.chunkData);
            this.verifyHeader(art1, "art1", "art2");
            const modsAndGens = readArticulation(art1, true);
            zone.addGenerators(...modsAndGens.generators);
            zone.addModulators(...modsAndGens.modulators);
        }
    }

    if (lar2Chunk) {
        while (lar2Chunk.chunkData.currentIndex < lar2Chunk.chunkData.length) {
            const art2 = readRIFFChunk(lar2Chunk.chunkData);
            this.verifyHeader(art2, "art2", "art1");
            const modsAndGens = readArticulation(art2, false);
            zone.addGenerators(...modsAndGens.generators);
            zone.addModulators(...modsAndGens.modulators);
        }
    }
}
