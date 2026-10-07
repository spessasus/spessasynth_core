import type {
    XGSystemEffectBlock,
    XGSystemEffectBlockSnapshot,
    XGSystemEffectParameter
} from "./xg_system_effect_block";
import type {
    XGInsertionBlock,
    XGInsertionBlockSnapshot,
    XGInsertionParameter
} from "./xg_insertion_block";

/**
 * Parameters for the XG variation effect.
 *
 * @group Synthesizer.XG Effects
 */
export interface XGVariationParameter
    extends XGSystemEffectParameter, XGInsertionParameter {
    /**
     * Indicates if variation is in the insertion mode (CONNECTION).
     * If `false`, then variation is in the `system` mode.
     *
     * The two connection modes work as following:
     * - `system` routes all channels via sends (like reverb and chorus).
     * - `insertion` routes a single `partNumber` channel straight through. Note that variation is processed last, after all insertion effects.
     */
    insertionMode: boolean;

    /**
     * The amount of variation being sent to the reverb effect.
     *
     * 0 is none, 64 is 100% and 127 is 200%.
     *
     * > **Note**
     * >
     * > This is only active in the `system` mode.
     */
    sendToReverb: number;

    /**
     * The amount of variation being sent to the chorus effect.
     *
     * 0 is none, 64 is 100% and 127 is 200%.
     *
     * > **Note**
     * >
     * > This is only active in the `system` mode.
     */
    sendToChorus: number;
}

/**
 * A snapshot of a {@link XGVariationBlock}.
 *
 * @group Synthesizer.XG Effects
 */
export interface XGVariationBlockSnapshot
    extends
        XGVariationParameter,
        XGSystemEffectBlockSnapshot,
        XGInsertionBlockSnapshot {}

/**
 * The Variation section provides a wealth of additional effects.
 * It features some of the same effects found in the
 * Reverb, Chorus and Insertion sections. This is not mere redundancy; it allows you to use two types of Reverb, Chorus or other effects on different
 * Voices.
 *
 * The Variation section of effects can be applied either to a single selected
 * Part or to all Parts, depending on the connection setting: Insertion or System.
 *
 * This is a Yamaha XG-compatible variation interface.
 *
 * It is used when {@link GlobalMIDIParameter.system} is `xg`.
 *
 * {@link SpessaSynthProcessor} allows you to supply a custom variation block.
 * A custom variation block must implement this interface.
 *
 * ### Editing the parameters
 *
 * Editing the parameters can be done via XG system exclusive messages.
 *
 * > **Tip**
 * >
 * > Refer to [MU128 SOUND LIST & MIDI DATA](https://usa.yamaha.com/files/download/other_assets/1/318081/MU128E2.pdf) (p.41-42) for more information.
 *
 * @group Synthesizer.XG Effects
 */
export interface XGVariationBlock
    extends XGVariationParameter, XGSystemEffectBlock, XGInsertionBlock {
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
    process(
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
    ): void;

    getSnapshot(): XGVariationBlockSnapshot;

    applySnapshot(snapshot: XGVariationBlockSnapshot): void;
}
