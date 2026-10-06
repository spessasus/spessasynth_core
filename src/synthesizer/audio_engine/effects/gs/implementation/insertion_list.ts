import { ThruFX } from "./insertion/thru";
import { StereoEQFX } from "./insertion/stereo_eq";
import { PhaserFX } from "./insertion/phaser";
import { AutoPanFX } from "./insertion/auto_pan";
import { AutoWahFX } from "./insertion/auto_wah";
import { PhAutoWahFx } from "./insertion/ph_auto_wah";
import { TremoloFX } from "./insertion/tremolo";
import type { GSInsertionProcessorConstructor } from "../interface/gs_insertion_processor";

export const GS_INSERTION_EFFECT_LIST: GSInsertionProcessorConstructor[] = [
    ThruFX,
    StereoEQFX,
    PhaserFX,
    AutoPanFX,
    AutoWahFX,
    PhAutoWahFx,
    TremoloFX
];
