import type { InsertionProcessorConstructor } from "./types";
import { ThruEFX } from "./insertion/thru";

export const insertionList: InsertionProcessorConstructor[] = [ThruEFX];
