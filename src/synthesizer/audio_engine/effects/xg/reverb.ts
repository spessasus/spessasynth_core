import { XGSystemEffectBlock } from "./framework/xg_effect_block";
import { XGNoEffect } from "./dsp/no_effect";
import type { XGEffectProcessorConstructor } from "./framework/xg_effect_processor";

const REVERB_MAP = new Map<number, XGEffectProcessorConstructor>([
    [0x00_00, XGNoEffect]
]);

/**
 * Represents the XG Reverb Effect block.
 */
export class XGReverbBlock extends XGSystemEffectBlock {
    public constructor(sampleRate: number, maxBufferSize: number) {
        super(REVERB_MAP, XGNoEffect, 0x01_00, sampleRate, maxBufferSize);
    }

    /**
     * Process the effect and **adds** it to the output.
     * @param inputLeft The input buffer to process. It always starts at index 0.
     * @param inputRight The input buffer to process. It always starts at index 0.
     * @param outputLeft The left output buffer.
     * @param outputRight The right output buffer.
     * @param startIndex The index to start mixing at into the output buffers.
     * @param sampleCount The amount of samples to mix. This will never be larger than {@link SynthProcessorOptions.maxBufferSize} of the parent {@link SpessaSynthProcessor} instance.
     */
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
