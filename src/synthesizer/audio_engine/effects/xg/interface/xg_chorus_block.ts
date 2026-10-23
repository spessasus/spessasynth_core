import type {
    XGSystemEffectBlock,
    XGSystemEffectBlockSnapshot,
    XGSystemEffectParameter
} from "./xg_system_effect_block";

/**
 * Parameters for the XG chorus effect.
 *
 * @group Synthesizer.XG Effects
 */
export interface XGChorusParameter extends XGSystemEffectParameter {
    /**
     * The amount of chorus being sent to the reverb effect.
     *
     * 0 is none, 64 is 100% and 127 is 200%.
     */
    sendToReverb: number;
}

/**
 * A snapshot of a {@link XGChorusBlock}.
 *
 * @group Synthesizer.XG Effects
 */
export interface XGChorusBlockSnapshot
    extends XGChorusParameter, XGSystemEffectBlockSnapshot {}

/**
 * Chorus broadens the spatial image of the sound, adding depth and richness.
 *
 * This is a Yamaha XG-compatible chorus interface.
 *
 * It is used when {@link GlobalMIDIParameter.system} is `xg`.
 *
 * {@link SpessaSynthProcessor} allows you to supply a custom chorus block.
 * A custom chorus block must implement this interface.
 *
 * ### Editing the parameters
 *
 * Editing the parameters can be done via XG system exclusive messages.
 *
 * > **Tip**
 * >
 * > Refer to [MU128 SOUND LIST & MIDI DATA](https://usa.yamaha.com/files/download/other_assets/1/318081/MU128E2.pdf) (p.40-41) for more information.
 *
 * @group Synthesizer.XG Effects
 */
export interface XGChorusBlock extends XGSystemEffectBlock, XGChorusParameter {
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
    process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        reverbLeft: Float32Array,
        reverbRight: Float32Array,
        startIndex: number,
        sampleCount: number
    ): void;

    getSnapshot(): XGChorusBlockSnapshot;

    applySnapshot(snapshot: XGChorusBlockSnapshot): void;
}
