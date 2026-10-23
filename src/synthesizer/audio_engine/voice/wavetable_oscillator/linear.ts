import { WavetableOscillator } from "./wavetable_oscillator";

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
                    const floor = (cursor | 0) & 0x3f_ff_ff_ff;
                    const fraction = cursor - floor;
                    const lower = data[floor];
                    outputBuffer[i] =
                        lower + (data[floor + 1] - lower) * fraction;
                    cursor += step;
                }
                if (i >= sampleCount) break;

                // Slow path, a single sample near the loop end
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
