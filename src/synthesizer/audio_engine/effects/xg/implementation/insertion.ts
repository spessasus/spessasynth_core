import { XGNoEffect } from "./dsp/no_effect";
import type { DefaultXGEffectProcessorConstructor } from "./dsp/effect_processor";
import { XGThru } from "./dsp/thru";
import { DefaultXGEffect } from "./effect";
import type {
    XGInsertionBlock,
    XGInsertionBlockSnapshot
} from "../interface/xg_insertion_block";

const INSERTION_MAP = new Map<number, DefaultXGEffectProcessorConstructor>([
    [0x00_00, XGNoEffect]
]);

/**
 * The default implementation for {@link XGInsertionBlock}.
 *
 * @group Synthesizer.XG Effects
 * @sealed
 */
export class DefaultXGInsertion
    extends DefaultXGEffect
    implements XGInsertionBlock
{
    public partNumber = 127;
    /**
     * Constructs a new default XG insertion processor.
     * @param sampleRate The sample rate, in Hertz.
     * @param maxBufferSize The maximum buffer size the synthesizer can render at once.
     * Attempting to `.process()` more samples than this will result in an error.
     */
    public constructor(sampleRate: number, maxBufferSize: number) {
        super(INSERTION_MAP, XGThru, 0x49_00, sampleRate, maxBufferSize);
    }

    public reset() {
        super.reset();
        this.partNumber = 127;
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
        inputLeft.set(this.outputLeft);
        inputRight.set(this.outputRight);
    }

    public getSnapshot() {
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
