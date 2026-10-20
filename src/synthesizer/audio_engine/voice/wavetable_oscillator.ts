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
     * @private
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

export class LinearOscillator extends WavetableOscillator {
    public process(
        sampleCount: number,
        tuningRatio: number,
        outputBuffer: Float64Array
    ): boolean {
        const step = tuningRatio * this.playbackStep;
        const data = this.sampleData!;
        const { loopEnd, loopLength, end } = this;
        let cursor = this.cursor;

        if (this.isLooping) {
            // Below this cursor, both points are inside the loop, so no wrapping is needed
            const safeEnd = loopEnd - 1;
            let i = 0;
            while (i < sampleCount) {
                // Fast path, this is where almost all samples are rendered
                for (; i < sampleCount && cursor < safeEnd; i++) {
                    const floor = cursor | 0;
                    const fraction = cursor - floor;
                    const lower = data[floor];
                    outputBuffer[i] =
                        lower + (data[floor + 1] - lower) * fraction;
                    cursor += step;
                }
                if (i >= sampleCount) break;

                // Slow path: a single sample near the loop end
                // Check for loop first (end is exclusive so it's `<=` and not `<`)
                // Testcase: https://github.com/spessasus/spessasynth_core/issues/90
                // Extreme playback rates:
                // Sample can loop more than once per frame! (that's why this 'while' is here)
                // Testcase: saw_and_square_wave.sf2
                while (cursor >= loopEnd) cursor -= loopLength;

                // Grab the 2 nearest points
                const floor = cursor | 0;
                let ceil = floor + 1;

                // Ensure that the point above does not go over the loop
                if (ceil >= loopEnd) ceil -= loopLength;

                const fraction = cursor - floor;

                // Grab the samples and interpolate
                const upper = data[ceil];
                const lower = data[floor];
                outputBuffer[i] = lower + (upper - lower) * fraction;

                cursor += step;
                i++;
            }
        } else {
            for (let i = 0; i < sampleCount; i++) {
                // Linear interpolation
                const floor = cursor | 0;
                const ceil = floor + 1;

                // Flag the voice as finished if needed
                if (ceil >= end) {
                    // Fill the rest with zeros (testcase drum_spam_test.mid)
                    outputBuffer.fill(0, i, sampleCount);
                    return false;
                }

                const fraction = cursor - floor;

                // Grab the samples and interpolate
                const upper = data[ceil];
                const lower = data[floor];
                outputBuffer[i] = lower + (upper - lower) * fraction;

                cursor += step;
            }
        }
        this.cursor = cursor;
        return true;
    }
}

export class NearestOscillator extends WavetableOscillator {
    public process(
        sampleCount: number,
        tuningRatio: number,
        outputBuffer: Float64Array
    ): boolean {
        const step = tuningRatio * this.playbackStep;
        const sampleData = this.sampleData!;
        const { loopEnd, loopLength, end } = this;
        let cursor = this.cursor;

        if (this.isLooping) {
            for (let i = 0; i < sampleCount; i++) {
                // Check for loop first (end is exclusive so it's `<=` and not `<`)
                // Testcase: https://github.com/spessasus/spessasynth_core/issues/90
                // Testcase for this type of loop checking: LiveHQ Classical Guitar finger off
                // (5 long loop in mode 3)
                // Extreme playback rates:
                // Sample can loop more than once per frame! (that's why this 'while' is here)
                // Testcase: saw_and_square_wave.sf2
                while (cursor >= loopEnd) cursor -= loopLength;

                // Grab the nearest neighbor
                outputBuffer[i] = sampleData[cursor | 0];
                cursor += step;
            }
        } else {
            for (let i = 0; i < sampleCount; i++) {
                // Flag the voice as finished if needed
                if (cursor >= end) {
                    // Fill the rest with zeros (testcase drum_spam_test.mid)
                    outputBuffer.fill(0, i, sampleCount);
                    return false;
                }

                outputBuffer[i] = sampleData[cursor | 0];
                cursor += step;
            }
        }
        this.cursor = cursor;
        return true;
    }
}

export class HermiteOscillator extends WavetableOscillator {
    /*
     * The interpolation happens between floor (x0) and floor + 1 (x1),
     * so the 4 points used are floor - 1, floor, floor + 1 and floor + 2.
     */
    public process(
        sampleCount: number,
        tuningRatio: number,
        outputBuffer: Float64Array
    ): boolean {
        const step = tuningRatio * this.playbackStep;
        const sampleData = this.sampleData!;
        const { loopStart, loopEnd, loopLength, end } = this;
        let cursor = this.cursor;

        if (this.isLooping) {
            let hasLooped = this.hasLooped;
            // Below this cursor, the points after the cursor are inside the loop, so no wrapping is needed
            const safeEnd = loopEnd - 2;
            let i = 0;
            while (i < sampleCount) {
                // Above this cursor, the point before the cursor is valid without wrapping
                // (after the first loop it must be inside the loop)
                if (cursor >= (hasLooped ? loopStart + 1 : 1)) {
                    // Fast path, this is where almost all samples are rendered
                    for (; i < sampleCount && cursor < safeEnd; i++) {
                        const y0 = cursor | 0;
                        const t = cursor - y0;
                        const xm1 = sampleData[y0 - 1];
                        const x0 = sampleData[y0];
                        const x1 = sampleData[y0 + 1];
                        const x2 = sampleData[y0 + 2];

                        const c = (x1 - xm1) * 0.5;
                        const v = x0 - x1;
                        const w = c + v;
                        const a = w + v + (x2 - x0) * 0.5;
                        const b = w + a;
                        outputBuffer[i] = ((a * t - b) * t + c) * t + x0;

                        cursor += step;
                    }
                    if (i >= sampleCount) break;
                }

                // Slow path: a single sample near the loop points or the sample start
                // Check for loop first (end is exclusive so it's `<=` and not `<`)
                // Testcase: https://github.com/spessasus/spessasynth_core/issues/90
                // Extreme playback rates:
                // Sample can loop more than once per frame! (that's why this 'while' is here)
                // Testcase: saw_and_square_wave.sf2
                if (cursor >= loopEnd) {
                    hasLooped = true;
                    while (cursor >= loopEnd) cursor -= loopLength;
                }

                // Grab the 4 points
                const y0 = cursor | 0; // Point before the cursor.
                let ym1 = y0 - 1; // Point before y0
                let y1 = y0 + 1; // Point after the cursor
                let y2 = y0 + 2; // Point after y1
                const t = cursor - y0; // The distance from y0 to cursor [0;1]

                // The point before y0:
                // After looping, the point before the loop start is the last point of the loop.
                // Before that, the sample data before the loop start is played.
                // There is no point before the first one, so it is duplicated.
                if (hasLooped) {
                    if (ym1 < loopStart) ym1 += loopLength;
                } else if (ym1 < 0) {
                    ym1 = 0;
                }

                // Ensure that the points above do not go over the loop.
                // Use while here:
                // When the loop is very short (or the cursor wraps near the loop end),
                // A single loop is not enough to bring
                // The points back into the loop range.
                // Note: Only applies to this interpolator (for using more than 2 samples)
                // Testcase: OmegaGMGS2.sf2 drum kit,
                // Crash Cymbal (loop length 1, shortest valid)
                while (y1 >= loopEnd) y1 -= loopLength;
                while (y2 >= loopEnd) y2 -= loopLength;

                // Grab the samples
                const xm1 = sampleData[ym1];
                const x0 = sampleData[y0];
                const x1 = sampleData[y1];
                const x2 = sampleData[y2];

                // Interpolate
                // https://www.musicdsp.org/en/latest/Other/93-hermite-interpollation.html
                const c = (x1 - xm1) * 0.5;
                const v = x0 - x1;
                const w = c + v;
                const a = w + v + (x2 - x0) * 0.5;
                const b = w + a;
                outputBuffer[i] = ((a * t - b) * t + c) * t + x0;

                cursor += step;
                i++;
            }
            this.hasLooped = hasLooped;
        } else {
            // Below this cursor, the last point is inside the sample
            const safeEnd = end - 2;
            let i = 0;
            while (i < sampleCount) {
                // Above this cursor, the point before the cursor exists
                if (cursor >= 1) {
                    // Fast path, this is where almost all samples are rendered
                    for (; i < sampleCount && cursor < safeEnd; i++) {
                        const y0 = cursor | 0;
                        const t = cursor - y0;
                        const xm1 = sampleData[y0 - 1];
                        const x0 = sampleData[y0];
                        const x1 = sampleData[y0 + 1];
                        const x2 = sampleData[y0 + 2];

                        const c = (x1 - xm1) * 0.5;
                        const v = x0 - x1;
                        const w = c + v;
                        const a = w + v + (x2 - x0) * 0.5;
                        const b = w + a;
                        outputBuffer[i] = ((a * t - b) * t + c) * t + x0;

                        cursor += step;
                    }
                    if (i >= sampleCount) break;
                }

                // Slow path: a single sample near the sample start or end
                const y0 = cursor | 0; // Point before the cursor
                const t = cursor - y0; // The distance from y0 to cursor [0;1]

                // Flag as finished if needed
                if (y0 + 1 >= end) {
                    // Fill the rest with zeros (testcase drum_spam_test.mid)
                    outputBuffer.fill(0, i, sampleCount);
                    return false;
                }

                // Grab the samples
                // There is no point before the first one or after the last one, so they are duplicated
                const xm1 = sampleData[y0 > 0 ? y0 - 1 : 0];
                const x0 = sampleData[y0];
                const x1 = sampleData[y0 + 1];
                const x2 = sampleData[y0 + 2 < end ? y0 + 2 : end - 1];

                // Interpolate
                // https://www.musicdsp.org/en/latest/Other/93-hermite-interpollation.html
                const c = (x1 - xm1) * 0.5;
                const v = x0 - x1;
                const w = c + v;
                const a = w + v + (x2 - x0) * 0.5;
                const b = w + a;
                outputBuffer[i] = ((a * t - b) * t + c) * t + x0;

                cursor += step;
                i++;
            }
        }
        this.cursor = cursor;
        return true;
    }
}
