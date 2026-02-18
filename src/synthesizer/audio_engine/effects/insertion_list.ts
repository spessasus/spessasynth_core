import type { InsertionProcessorConstructor } from "./types";
import { ThruEFX } from "./insertion/thru";
import { StereoEQEFX } from "./insertion/stereo_eq";

export const insertionList: InsertionProcessorConstructor[] = [
    ThruEFX,
    StereoEQEFX
];
