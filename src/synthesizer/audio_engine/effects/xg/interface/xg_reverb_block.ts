import type { XGSystemEffectBlock } from "./xg_system_effect_block";

/**
 * Reverb is an effect that adds reverberation to a sound, as you would hear in a concert
 * hall.
 *
 * This is a Yamaha XG-compatible reverb interface.
 *
 * It is used when {@link GlobalMIDIParameter.system} is `xg`.
 *
 * {@link SpessaSynthProcessor} allows you to supply a custom reverb block.
 * A custom reverb block must implement this interface.
 *
 * ### Editing the parameters
 *
 * Editing the parameters can be done via XG system exclusive messages.
 *
 * > **Tip**
 * >
 * > Refer to [MU128 SOUND LIST & MIDI DATA](https://usa.yamaha.com/files/download/other_assets/1/318081/MU128E2.pdf) (p.40) for more information.
 *
 * @group Synthesizer.XG Effects
 */
export interface XGReverbBlock extends XGSystemEffectBlock {
    /**
     * Process the effect and **adds** it to the output.
     * @param inputLeft The input buffer to process. It always starts at index 0.
     * @param inputRight The input buffer to process. It always starts at index 0.
     * @param outputLeft The left output buffer.
     * @param outputRight The right output buffer.
     * @param startIndex The index to start mixing at into the output buffers.
     * @param sampleCount The amount of samples to mix. This will never be larger than {@link SynthProcessorOptions.maxBufferSize} of the parent {@link SpessaSynthProcessor} instance.
     */
    process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        startIndex: number,
        sampleCount: number
    ): void;
}
