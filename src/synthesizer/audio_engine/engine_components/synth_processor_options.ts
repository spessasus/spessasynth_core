import type { SynthProcessorOptions } from "../../types";
import { SPESSA_BUFSIZE } from "./synth_constants";

export const DEFAULT_SYNTH_OPTIONS: SynthProcessorOptions = {
    enableEventSystem: true,
    maxBufferSize: SPESSA_BUFSIZE,
    initialTime: 0,
    enableEffects: true
};
