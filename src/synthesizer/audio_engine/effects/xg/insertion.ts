import {
    XGEffectBlock,
    type XGEffectBlockSnapshot
} from "./framework/xg_effect_block";
import { XGNoEffect } from "./dsp/no_effect";
import type { XGEffectProcessorConstructor } from "./framework/xg_effect_processor";
import { XGThru } from "./dsp/thru";

const INSERTION_MAP = new Map<number, XGEffectProcessorConstructor>([
    [0x00_00, XGNoEffect]
]);

/**
 * A snapshot of a {@link XGInsertionBlock}.
 */
export interface XGInsertionBlockSnapshot extends XGEffectBlockSnapshot {
    /**
     * The channel routed through the insertion effect
     * (0-63 parts, 127 OFF).
     */
    partNumber: number;
}

/**
 * Represents a Yamaha XG Insertion Effect block (EFFECT 2).
 * Unlike variation, it has no return, pan or sends:
 * it always runs in insertion mode on a single `partNumber` channel.
 */
export class XGInsertionBlock extends XGEffectBlock {
    /**
     * The channel routed through the insertion effect.
     * 127 (OFF) by default, so the block is disabled until assigned.
     */
    public partNumber = 127;

    public constructor(sampleRate: number, maxBufferSize: number) {
        super(INSERTION_MAP, XGThru, 0x49_00, sampleRate, maxBufferSize);
    }

    public reset() {
        super.reset();
        this.partNumber = 127;
    }

    // Named like this to be consistent with variation
    /**
     * Process the effect and **overwrites the input**.
     * The DSP honors Dry/Wet.
     *
     * @param inputLeft The input buffer to process. It always starts at index 0.
     * @param inputRight The input buffer to process. It always starts at index 0.
     * @param sampleCount The amount of samples to mix. This will never be larger than {@link SynthProcessorOptions.maxBufferSize} of the parent {@link SpessaSynthProcessor} instance.
     */
    public processInsertion(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        sampleCount: number
    ) {
        this.processor.process(
            inputLeft,
            inputRight,
            this.outputLeft,
            this.outputRight,
            sampleCount,
            true
        );
        inputLeft.set(this.outputLeft);
        inputRight.set(this.outputRight);
    }

    public getSnapshot(): XGInsertionBlockSnapshot {
        return {
            ...super.getSnapshot(),
            partNumber: this.partNumber
        };
    }

    public applySnapshot(snapshot: XGInsertionBlockSnapshot) {
        super.applySnapshot(snapshot);
        this.partNumber = snapshot.partNumber;
    }
}
