import type { InsertionProcessorConstructor } from "./types";
import { ThruFX } from "./insertion/thru";
import { StereoEQFX } from "./insertion/stereo_eq";
import { PhaserFX } from "./insertion/phaser";

export const insertionList: InsertionProcessorConstructor[] = [
    ThruFX,
    StereoEQFX,
    PhaserFX
];
