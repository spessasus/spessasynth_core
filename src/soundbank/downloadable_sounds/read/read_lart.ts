import { readRIFFChunk, RIFFChunk } from "../../../utils/riff_chunk";
import { readArticulation } from "./read_articulation";
import type { DLSSoundBank } from "./downloadable_sounds";
import type { BasicZone } from "../../basic_soundbank/basic_zone";

export function readLart(
    this: DLSSoundBank,
    zone: BasicZone,
    lartChunk?: RIFFChunk,
    lar2Chunk?: RIFFChunk
) {
    if (lartChunk) {
        while (lartChunk.data.currentIndex < lartChunk.data.length) {
            const art1 = readRIFFChunk(lartChunk.data);
            this.verifyHeader(art1, "art1", "art2");
            const modsAndGens = readArticulation(art1, true);
            zone.addGenerators(...modsAndGens.generators);
            zone.addModulators(...modsAndGens.modulators);
        }
    }

    if (lar2Chunk) {
        while (lar2Chunk.data.currentIndex < lar2Chunk.data.length) {
            const art2 = readRIFFChunk(lar2Chunk.data);
            this.verifyHeader(art2, "art2", "art1");
            const modsAndGens = readArticulation(art2, false);
            zone.addGenerators(...modsAndGens.generators);
            zone.addModulators(...modsAndGens.modulators);
        }
    }
}
