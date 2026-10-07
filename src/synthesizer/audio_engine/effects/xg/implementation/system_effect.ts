import { DefaultXGEffect } from "./effect";
import type {
    XGSystemEffectBlock,
    XGSystemEffectBlockSnapshot
} from "../interface/xg_system_effect_block";

const MIN_PAN = 1;
const MAX_PAN = 127;
const PAN_RESOLUTION = MAX_PAN - MIN_PAN;

// Initialize pan lookup tables
const panTableLeft = new Float32Array(PAN_RESOLUTION + 1);
const panTableRight = new Float32Array(PAN_RESOLUTION + 1);
for (let pan = MIN_PAN; pan <= MAX_PAN; pan++) {
    // Clamp to 0-1
    const realPan = (pan - MIN_PAN) / PAN_RESOLUTION;
    const tableIndex = pan - MIN_PAN;
    panTableLeft[tableIndex] = Math.cos((Math.PI / 2) * realPan);
    panTableRight[tableIndex] = Math.sin((Math.PI / 2) * realPan);
}

/**
 * The default implementation for {@link XGSystemEffectBlock}.
 *
 * System effects are global and have a send level for each channel, always adding wet output into them.
 */
export abstract class DefaultXGSystemEffect
    extends DefaultXGEffect
    implements XGSystemEffectBlock
{
    public return = 64;
    public pan = 64;

    public reset() {
        super.reset();
        this.return = 64;
        this.pan = 64;
    }

    public getSnapshot(): XGSystemEffectBlockSnapshot {
        return {
            ...super.getSnapshot(),
            return: this.return,
            pan: this.pan
        };
    }

    public applySnapshot(snapshot: XGSystemEffectBlockSnapshot) {
        super.applySnapshot(snapshot);
        this.return = snapshot.return;
        this.pan = snapshot.pan;
    }

    /**
     * Mixes the staged wet output into the system effect destination, applying return and pan.
     * @param outputLeft The left output buffer.
     * @param outputRight The right output buffer.
     * @param startIndex The index to start mixing at into the output buffers.
     * @param sampleCount The amount of samples to mix.
     */
    protected mixSystemEffect(
        outputLeft: Float32Array,
        outputRight: Float32Array,
        startIndex: number,
        sampleCount: number
    ) {
        const gain = this.return / 64;
        const panIndex =
            Math.min(MAX_PAN, Math.max(MIN_PAN, this.pan)) - MIN_PAN;
        const gainLeft = panTableLeft[panIndex] * gain;
        const gainRight = panTableRight[panIndex] * gain;

        for (let i = 0; i < sampleCount; i++) {
            const outIndex = startIndex + i;
            outputLeft[outIndex] += this.outputLeft[i] * gainLeft;
            outputRight[outIndex] += this.outputRight[i] * gainRight;
        }
    }
}
