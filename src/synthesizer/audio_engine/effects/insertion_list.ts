import type { InsertionProcessorConstructor } from "./types";
import { ThruEFX } from "./insertion/thru";
import { StereoEQEFX } from "./insertion/stereo_eq";
import { PhaserEFX } from "./insertion/phaser";

export const insertionList: InsertionProcessorConstructor[] = [
    ThruEFX,
    StereoEQEFX,
    PhaserEFX
];
