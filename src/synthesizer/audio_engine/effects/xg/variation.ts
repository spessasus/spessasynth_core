import {
    XGSystemEffectBlock,
    type XGSystemEffectBlockSnapshot
} from "./framework/xg_effect_block";
import { XGNoEffect } from "./dsp/no_effect";
import type { XGEffectProcessorConstructor } from "./framework/xg_effect_processor";
import { XGThru } from "./dsp/thru";

const VARIATION_MAP = new Map<number, XGEffectProcessorConstructor>([
    [0x00_00, XGNoEffect],
    [0x40_00, XGThru]
]);

/**
 * A snapshot of a {@link XGVariationBlock}.
 */
export interface XGVariationBlockSnapshot extends XGSystemEffectBlockSnapshot {
    /**
     * True if variation is in the insertion mode.
     *
     * The systems work as following:
     * - `system` routes all channels via sends (like reverb and chorus).
     * - `insertion` routes a single `partNumber` channel straight through. Note that variation is processed last, after all insertion effects.
     */
    insertionMode: boolean;
    /**
     * The channel routed through the effect in insertion mode
     * (0-63 parts, 127 OFF).
     * Ignored in system mode.
     */
    partNumber: number;
    /**
     * The amount of variation being sent to the reverb effect.
     */
    sendToReverb: number;
    /**
     * The amount of variation being sent to the chorus effect.
     */
    sendToChorus: number;
}

/**
 * Represents the XG Variation Effect block.
 * Unlike reverb and chorus, it can run either as a system effect
 * (all channels via sends) or as an insertion effect
 * (a single `partNumber` channel routed straight through it).
 */
export class XGVariationBlock extends XGSystemEffectBlock {
    /**
     * True if variation is in the insertion mode.
     *
     * The systems work as following:
     * - `system` routes all channels via sends (like reverb and chorus).
     * - `insertion` routes a single `partNumber` channel straight through. Note that variation is processed last, after all insertion effects.
     */
    public insertionMode = true;
    /**
     * The channel routed through the effect in insertion mode.
     * 127 (OFF) by default, so the block is disabled until assigned.
     * Note that any value which is not a valid channel number (for example 63 when there are only 16 channels) is also treated as OFF.
     */
    public partNumber = 127;
    /**
     * The amount of variation being sent to the reverb effect.
     *
     * 0 is none, 64 is 100% and 127 is 200%.
     */
    public sendToReverb = 0;
    /**
     * The amount of variation being sent to the chorus effect.
     *
     * 0 is none, 64 is 100% and 127 is 200%.
     */
    public sendToChorus = 0;

    public constructor(sampleRate: number, maxBufferSize: number) {
        super(VARIATION_MAP, XGThru, 0x05_00, sampleRate, maxBufferSize);
    }

    public reset() {
        super.reset();
        this.insertionMode = true;
        this.partNumber = 127;
        this.sendToReverb = 0;
        this.sendToChorus = 0;
    }

    /**
     * Process the effect in _system_ mode and **adds** it to the output.
     * Feeds the chorus and reverb buffers according to the send amounts.
     * The DSP's wet is fixed at 100% in this case.
     *
     * @param inputLeft The input buffer to process. It always starts at index 0.
     * @param inputRight The input buffer to process. It always starts at index 0.
     * @param outputLeft The left output buffer.
     * @param outputRight The right output buffer.
     * @param chorusLeft The left chorus send buffer. It always starts at index 0.
     * @param chorusRight The right chorus send buffer. It always starts at index 0.
     * @param reverbLeft The left reverb send buffer. It always starts at index 0.
     * @param reverbRight The right reverb send buffer. It always starts at index 0.
     * @param startIndex The index to start mixing at into the output buffers.
     * @param sampleCount The amount of samples to mix. This will never be larger than {@link SynthProcessorOptions.maxBufferSize} of the parent {@link SpessaSynthProcessor} instance.
     */
    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        chorusLeft: Float32Array,
        chorusRight: Float32Array,
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

        // Variation gets sent to chorus/reverb regardless of return,
        // For example, even at 0 and part having only variation applied,
        // The reverb still sounds with variation to reverb being 127.
        this.addSend(chorusLeft, chorusRight, sampleCount, this.sendToChorus);
        this.addSend(reverbLeft, reverbRight, sampleCount, this.sendToReverb);
    }

    /**
     * Process the effect in insertion mode and **overwrites** it to the input.
     * The DSP honors Dry/Wet in this case.
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
        // Variation in system mode ignores sends
        // See MU128 manual page 154
        inputLeft.set(this.outputLeft);
        inputRight.set(this.outputRight);
    }

    public getSnapshot(): XGVariationBlockSnapshot {
        return {
            ...super.getSnapshot(),
            insertionMode: this.insertionMode,
            partNumber: this.partNumber,
            sendToReverb: this.sendToReverb,
            sendToChorus: this.sendToChorus
        };
    }

    public applySnapshot(snapshot: XGVariationBlockSnapshot) {
        super.applySnapshot(snapshot);
        this.insertionMode = snapshot.insertionMode;
        this.partNumber = snapshot.partNumber;
        this.sendToReverb = snapshot.sendToReverb;
        this.sendToChorus = snapshot.sendToChorus;
    }
}
