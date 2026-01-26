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
     */
    public loopStart = 0;
    /**
     * End position of the loop.
     */
    public loopEnd = 0;
    /**
     * Length of the loop.
     * @private
     */
    public loopLength = 0;
    /**
     * End position of the sample.
     */
    public end = 0;
    /**
     * The current cursor of the sample.
     */
    public cursor = 0;

    /**
     * Fills the output buffer with raw sample data using a given interpolation.
     * @param sampleCount The amount of samples to write into the buffer.
     * @param tuningRatio the tuning ratio to apply.
     * @param outputBuffer The output buffer to write to.
     */
    public abstract process(
        sampleCount: number,
        tuningRatio: number,
        outputBuffer: Float32Array
    ): boolean;
}

export class NearestOscillator extends WavetableOscillator {
    public process(
        sampleCount: number,
        tuningRatio: number,
        outputBuffer: Float32Array
    ): boolean {
        const step = tuningRatio * this.playbackStep;
        const data = this.sampleData!;
        const { loopEnd, loopLength, loopStart, end } = this;
        let cursor = this.cursor;

        if (this.isLooping) {
            for (let i = 0; i < sampleCount; i++) {
                // Check for loop
                if (cursor > loopStart)
                    cursor = loopStart + ((cursor - loopStart) % loopLength);

                // Grab the 2 nearest points
                const floor = cursor | 0;
                let ceil = floor + 1;

                if (ceil >= loopEnd) {
                    ceil -= loopLength;
                }

                const fraction = cursor - floor;

                // Grab the samples and interpolate
                const upper = data[ceil];
                const lower = data[floor];
                outputBuffer[i] = lower + (upper - lower) * fraction;

                cursor += step;
            }
        } else {
            for (let i = 0; i < sampleCount; i++) {
                // Linear interpolation
                const floor = cursor | 0;
                const ceil = floor + 1;

                // Flag the voice as finished if needed
                if (ceil >= end) {
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

export class LinearOscillator extends WavetableOscillator {
    public process(
        sampleCount: number,
        tuningRatio: number,
        outputBuffer: Float32Array
    ): boolean {
        const step = tuningRatio * this.playbackStep;
        const sampleData = this.sampleData!;
        const { loopLength, loopStart, end } = this;
        let cursor = this.cursor;

        if (this.isLooping) {
            for (let i = 0; i < sampleCount; i++) {
                // Check for loop
                // Testcase for this type of loop checking: LiveHQ Classical Guitar finger off
                // (5 long loop in mode 3)
                if (cursor > loopStart)
                    cursor = loopStart + ((cursor - loopStart) % loopLength);

                // Grab the nearest neighbor
                outputBuffer[i] = sampleData[cursor | 0];
                cursor += step;
            }
        } else {
            for (let i = 0; i < sampleCount; i++) {
                // Flag the voice as finished if needed
                if (cursor >= end) {
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
    public process(
        sampleCount: number,
        tuningRatio: number,
        outputBuffer: Float32Array
    ): boolean {
        const step = tuningRatio * this.playbackStep;
        const sampleData = this.sampleData!;
        const { loopEnd, loopLength, loopStart, end } = this;
        let cursor = this.cursor;

        if (this.isLooping) {
            for (let i = 0; i < sampleCount; i++) {
                // Check for loop
                if (cursor > loopStart)
                    cursor = loopStart + ((cursor - loopStart) % loopLength);

                // Grab the 4 points
                const y0 = cursor | 0; // Point before the cursor.
                let y1 = y0 + 1; // Point after the cursor
                let y2 = y0 + 2; // Point 1 after the cursor
                let y3 = y0 + 3; // Point 2 after the cursor
                const t = cursor - y0; // The distance from y0 to cursor [0;1]
                // Y0 is not handled here
                // As it's floor of cur which is handled above
                if (y1 >= loopEnd) {
                    y1 -= loopLength;
                }
                if (y2 >= loopEnd) {
                    y2 -= loopLength;
                }
                if (y3 >= loopEnd) {
                    y3 -= loopLength;
                }

                // Grab the samples
                const xm1 = sampleData[y0];
                const x0 = sampleData[y1];
                const x1 = sampleData[y2];
                const x2 = sampleData[y3];

                // Interpolate
                // https://www.musicdsp.org/en/latest/Other/93-hermite-interpollation.html
                const c = (x1 - xm1) * 0.5;
                const v = x0 - x1;
                const w = c + v;
                const a = w + v + (x2 - x0) * 0.5;
                const b = w + a;
                outputBuffer[i] = ((a * t - b) * t + c) * t + x0;

                cursor += step;
            }
        } else {
            for (let i = 0; i < sampleCount; i++) {
                // Grab the 4 points
                const y0 = cursor | 0; // Point before the cursor.
                const y1 = y0 + 1; // Point after the cursor
                const y2 = y0 + 2; // Point 1 after the cursor
                const y3 = y0 + 3; // Point 2 after the cursor
                const t = cursor - y0; // The distance from y0 to cursor [0;1]

                // Flag as finished if needed
                if (y3 >= end) {
                    return false;
                }

                // Grab the samples
                const xm1 = sampleData[y0];
                const x0 = sampleData[y1];
                const x1 = sampleData[y2];
                const x2 = sampleData[y3];

                // Interpolate
                // https://www.musicdsp.org/en/latest/Other/93-hermite-interpollation.html
                const c = (x1 - xm1) * 0.5;
                const v = x0 - x1;
                const w = c + v;
                const a = w + v + (x2 - x0) * 0.5;
                const b = w + a;
                outputBuffer[i] = ((a * t - b) * t + c) * t + x0;

                cursor += step;
            }
        }
        this.cursor = cursor;
        return true;
    }
}
