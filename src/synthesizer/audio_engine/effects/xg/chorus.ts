import {
    XGSystemEffectBlock,
    type XGSystemEffectBlockSnapshot
} from "./framework/xg_effect_block";
import { XGNoEffect } from "./dsp/no_effect";
import type { XGEffectProcessorConstructor } from "./framework/xg_effect_processor";

const CHORUS_MAP = new Map<number, XGEffectProcessorConstructor>([
    [0x00_00, XGNoEffect]
]);

/**
 * A snapshot of a {@link XGChorusBlock}.
 */
export interface XGChorusBlockSnapshot extends XGSystemEffectBlockSnapshot {
    /**
     * The amount of chorus being sent to the reverb effect.
     */
    sendToReverb: number;
}

/**
 * Represents the XG Chorus Effect block.
 */
export class XGChorusBlock extends XGSystemEffectBlock {
    /**
     * The amount of chorus being sent to the reverb effect.
     *
     * 0 is none, 64 is 100% and 127 is 200%.
     */
    public sendToReverb = 0;

    public constructor(sampleRate: number, maxBufferSize: number) {
        super(CHORUS_MAP, XGNoEffect, 0x41_00, sampleRate, maxBufferSize);
    }

    public reset() {
        super.reset();
        this.sendToReverb = 0;
    }

    /**
     * Process the effect and **adds** it to the output.
     * @param inputLeft The input buffer to process. It always starts at index 0.
     * @param inputRight The input buffer to process. It always starts at index 0.
     * @param outputLeft The left output buffer.
     * @param outputRight The right output buffer.
     * @param reverbLeft The left reverb send buffer.
     * @param reverbRight The right reverb send buffer.
     * @param startIndex The index to start mixing at into the output buffers.
     * @param sampleCount The amount of samples to mix. This will never be larger than {@link SynthProcessorOptions.maxBufferSize} of the parent {@link SpessaSynthProcessor} instance.
     */
    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        reverbLeft: Float32Array,
        reverbRight: Float32Array,
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
        // Chorus gets sent to reverb regardless of return,
        // Even at 0 and part having only chorus applied,
        // The reverb still sounds with chorus to reverb being 127.
        // Tested on MU2K
        this.addSend(reverbLeft, reverbRight, sampleCount, this.sendToReverb);
    }

    public getSnapshot(): XGChorusBlockSnapshot {
        return {
            ...super.getSnapshot(),
            sendToReverb: this.sendToReverb
        };
    }

    public applySnapshot(snapshot: XGChorusBlockSnapshot) {
        super.applySnapshot(snapshot);
        this.sendToReverb = snapshot.sendToReverb;
    }
}
