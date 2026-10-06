import { XGNoEffect } from "./dsp/no_effect";
import type { DefaultXGEffectProcessorConstructor } from "./dsp/effect_processor";
import { XGThru } from "./dsp/thru";
import { DefaultXGSystemEffect } from "./system_effect";
import type {
    XGVariationBlock,
    XGVariationBlockSnapshot
} from "../interface/xg_variation_block";

const VARIATION_MAP = new Map<number, DefaultXGEffectProcessorConstructor>([
    [0x00_00, XGNoEffect],
    [0x40_00, XGThru]
]);

/**
 * The default implementation for {@link XGVariationBlock}.
 *
 * @group Synthesizer.XG Effects
 * @sealed
 */
export class DefaultXGVariation
    extends DefaultXGSystemEffect
    implements XGVariationBlock
{
    public insertionMode = true;

    public partNumber = 127;

    public sendToReverb = 0;

    public sendToChorus = 0;

    /**
     * Constructs a new default XG variation processor.
     * @param sampleRate The sample rate, in Hertz.
     * @param maxBufferSize The maximum buffer size the synthesizer can render at once.
     * Attempting to `.process()` more samples than this will result in an error.
     */
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

        // Common scenario
        if (this.sendToReverb > 0) {
            const gain = this.sendToReverb / 64;

            for (let i = 0; i < sampleCount; i++) {
                reverbLeft[i] += this.outputLeft[i] * gain;
                reverbRight[i] += this.outputRight[i] * gain;
            }
        }
        if (this.sendToChorus > 0) {
            const gain = this.sendToChorus / 64;

            for (let i = 0; i < sampleCount; i++) {
                chorusLeft[i] += this.outputLeft[i] * gain;
                chorusRight[i] += this.outputRight[i] * gain;
            }
        }
    }

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

    public getSnapshot() {
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
