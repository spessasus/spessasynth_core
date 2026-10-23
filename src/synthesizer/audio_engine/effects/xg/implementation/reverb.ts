import { XGNoEffect } from "./dsp/no_effect";
import type { DefaultXGEffectProcessorConstructor } from "./dsp/effect_processor";
import type { XGReverbBlock } from "../interface/xg_reverb_block";
import { DefaultXGSystemEffect } from "./system_effect";

const REVERB_MAP = new Map<number, DefaultXGEffectProcessorConstructor>([
    [0x00_00, XGNoEffect]
]);

/**
 * The default implementation for {@link XGReverbBlock}.
 *
 * @group Synthesizer.XG Effects
 * @sealed
 */
export class DefaultXGReverb
    extends DefaultXGSystemEffect
    implements XGReverbBlock
{
    /**
     * Constructs a new default XG reverb processor.
     * @param sampleRate The sample rate, in Hertz.
     * @param maxBufferSize The maximum buffer size the synthesizer can render at once.
     * Attempting to `.process()` more samples than this will result in an error.
     */
    public constructor(sampleRate: number, maxBufferSize: number) {
        super(REVERB_MAP, XGNoEffect, 0x01_00, sampleRate, maxBufferSize);
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        startIndex: number,
        sampleCount: number
    ) {
        this.processor.process(
            inputLeft,
            inputRight,
            this.outputLeft,
            this.outputRight,
            sampleCount,
            false
        );
        this.mixSystemEffect(outputLeft, outputRight, startIndex, sampleCount);
    }
}
