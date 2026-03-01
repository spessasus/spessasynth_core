import type { SynthProcessorOptions } from "../../types";
import { SpessaSynthReverb } from "../effects/reverb/reverb";
import SpessaSynthChorus from "../effects/chorus/chorus";
import { SpessaSynthDelay } from "../effects/delay/delay";

export function getDefaultSynthOptions(
    sampleRate: number
): SynthProcessorOptions {
    return {
        ...DEFAULT_SYNTH_OPTIONS,
        reverbProcessor: new SpessaSynthReverb(sampleRate),
        chorusProcessor: new SpessaSynthChorus(sampleRate),
        delayProcessor: new SpessaSynthDelay(sampleRate)
    };
}

const DEFAULT_SYNTH_OPTIONS: Omit<
    SynthProcessorOptions,
    "reverbProcessor" | "chorusProcessor" | "delayProcessor"
> = {
    enableEventSystem: true,
    initialTime: 0,
    enableEffects: true
};
