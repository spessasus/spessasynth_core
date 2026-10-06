import type { XGEffectBlock, XGEffectBlockSnapshot } from "./xg_effect_block";

/**
 * Parameters for the XG insertion effect.
 *
 * @group Synthesizer.XG Effects
 */
export interface XGInsertionParameter {
    /**
     * The channel routed through the insertion effect, 0-based.
     *
     * 127 or a value that's above the current channel count means OFF.
     */
    partNumber: number;
}

/**
 * A snapshot of a {@link XGInsertionBlock}.
 *
 * @group Synthesizer.XG Effects
 */
export interface XGInsertionBlockSnapshot
    extends XGInsertionParameter, XGEffectBlockSnapshot {}

/**
 * The Insertion effects provide additional effects for processing individual Parts.
 *
 * The Insertion effects are set up for Insertion routing and can be applied only
 * to a single selected Part.
 *
 * {@link SpessaSynthProcessor} currently has 4 insertion effects. More than one effect can be applied to a single Part (channel).
 *
 * This is a Yamaha XG-compatible insertion interface.
 *
 * It is used when {@link GlobalMIDIParameter.system} is `xg`.
 *
 * {@link SpessaSynthProcessor} allows you to supply a custom insertion block.
 * A custom insertion block must implement this interface.
 *
 * ### Editing the parameters
 *
 * Editing the parameters can be done via XG system exclusive messages.
 *
 * > **Tip**
 * >
 * > Refer to [MU128 SOUND LIST & MIDI DATA](https://usa.yamaha.com/files/download/other_assets/1/318081/MU128E2.pdf) (p.42-44) for more information.
 *
 * @group Synthesizer.XG Effects
 */
export interface XGInsertionBlock extends XGInsertionParameter, XGEffectBlock {
    /**
     * Process the effect in insertion mode and **overwrites** it to the input.
     * The DSP honors Dry/Wet in this case.
     *
     * @param inputLeft The input buffer to process. It always starts at index 0.
     * @param inputRight The input buffer to process. It always starts at index 0.
     * @param sampleCount The amount of samples to mix. This will never be larger than {@link SynthProcessorOptions.maxBufferSize} of the parent {@link SpessaSynthProcessor} instance.
     */
    processInsertion(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        sampleCount: number
    ): void;

    getSnapshot(): XGInsertionBlockSnapshot;

    applySnapshot(snapshot: XGInsertionBlockSnapshot): void;
}
