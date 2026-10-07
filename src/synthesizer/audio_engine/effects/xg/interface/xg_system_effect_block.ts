import type { XGEffectBlock, XGEffectBlockSnapshot } from "./xg_effect_block";

/**
 * Parameters for an XG system effect.
 *
 * @group Synthesizer.XG Effects
 */
export interface XGSystemEffectParameter {
    /**
     * The return (level) of the effect.
     * 0 is silence (-Inf dB), 64 is normal (0 dB) and 127 is double the volume (+6 dB).
     */
    return: number;
    /**
     * The stereo panning of this effect.
     * 1 is hard left, 64 is center, 127 is hard right.
     */
    pan: number;
}

/**
 * A snapshot of a {@link XGSystemEffectBlock}.
 *
 * @group Synthesizer.XG Effects
 */
export interface XGSystemEffectBlockSnapshot
    extends XGSystemEffectParameter, XGEffectBlockSnapshot {}

/**
 * This interface represents a single XG system effect block.
 *
 * System effects are global and have a send level for each channel, always adding wet output into them.
 *
 * There are 3 System Effects:
 * - Reverb {@link XGReverbBlock}
 * - Chorus {@link XGChorusBlock}
 * - Variation (in system mode) {@link XGVariationBlock}
 *
 * @group Synthesizer.XG Effects
 */
export interface XGSystemEffectBlock
    extends XGEffectBlock, XGSystemEffectParameter {
    getSnapshot(): XGSystemEffectBlockSnapshot;

    applySnapshot(snapshot: XGSystemEffectBlockSnapshot): void;
}
