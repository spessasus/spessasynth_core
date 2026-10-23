import { WavetableOscillator } from "./wavetable_oscillator";

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
                        // The mask lets the compiler skip the overflow checks below,
                        // The cursor is always positive and below 2^30 here
                        const y0 = (cursor | 0) & 0x3f_ff_ff_ff;
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

                // Slow path, a single sample near the loop points or the sample start
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
                        // The mask lets the compiler skip the overflow checks below,
                        // The cursor is always positive and below 2^30 here
                        const y0 = (cursor | 0) & 0x3f_ff_ff_ff;
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

                // Slow path, a single sample near the sample start or end
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
