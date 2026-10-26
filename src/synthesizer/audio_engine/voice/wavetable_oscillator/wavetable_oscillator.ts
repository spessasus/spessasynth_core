/**
 * Wavetable_oscillator.ts
 * purpose: plays back raw audio data at an arbitrary playback rate
 */

export abstract class WavetableOscillator {
    /**
     * Is the loop on?
     */
    public isLooping = false;
    /**
     * Sample data of the voice.
     */
    public sampleData?: Float32Array;
    /**
     * Playback step (rate) for sample pitch correction.
     */
    public playbackStep = 0;
    /**
     * Start position of the loop.
     * Inclusive.
     */
    public loopStart = 0;
    /**
     * End position of the loop.
     * Exclusive.
     */
    public loopEnd = 0;
    /**
     * Length of the loop.
     * The oscillators wrap with `while (cursor >= loopEnd) cursor -= loopLength`,
     * so a looping voice must have a length of at least 1 sample.
     * `note_on.ts` disables the loop for shorter loops.
     */
    public loopLength = 0;
    /**
     * End position of the sample.
     * Exclusive
     */
    public end = 0;
    /**
     * The current cursor of the sample.
     */
    public cursor = 0;
    /**
     * If the cursor has wrapped around the loop at least once.
     * Needed for interpolations which use the point before the cursor:
     * before the first loop it's the sample data before loopStart, after it's the end of the loop.
     */
    public hasLooped = false;

    /**
     * Fills the output buffer with raw sample data using a given interpolation.
     * @param sampleCount The amount of samples to write into the buffer.
     * @param tuningRatio the tuning ratio to apply.
     * @param outputBuffer The output buffer to write to.
     */
    public abstract process(
        sampleCount: number,
        tuningRatio: number,
        outputBuffer: Float64Array
    ): boolean;
}
