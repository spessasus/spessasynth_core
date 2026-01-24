import { type InterpolationType, interpolationTypes } from "../../../enums";

/**
 * Wavetable_oscillator.ts
 * purpose: plays back raw audio data at an arbitrary playback rate
 */

export class WavetableOscillator {
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
     * @param tuningRatio the tuning ratio to apply.
     * @param outputBuffer The output buffer to write to.
     * @param interpolation The interpolation type.
     * @return true if the voice is still active.
     */
    public process(
        tuningRatio: number,
        outputBuffer: Float32Array,
        interpolation: InterpolationType
    ): boolean {
        const step = tuningRatio * this.playbackStep;
        switch (interpolation) {
            case interpolationTypes.hermite: {
                return this.getSampleHermite(outputBuffer, step);
            }

            case interpolationTypes.nearestNeighbor: {
                return this.getSampleNearest(outputBuffer, step);
            }

            default: {
                return this.getSampleLinear(outputBuffer, step);
            }
        }
    }

    /**
     * Fills the output buffer with raw sample data using linear interpolation.
     * @param outputBuffer The output buffer to write to.
     * @param step The step to advance every sample (playback rate).
     */
    public getSampleLinear(outputBuffer: Float32Array, step: number) {
        const data = this.sampleData!;
        const loopEnd = this.loopEnd;
        const end = this.end;
        const loopLength = this.loopLength;
        let cursor = this.cursor;

        if (this.isLooping) {
            for (let i = 0; i < outputBuffer.length; i++) {
                // Check for loop
                cursor -= cursor >= loopEnd ? loopLength : 0;

                // Grab the 2 nearest points
                const floor = Math.trunc(cursor);
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
            for (let i = 0; i < outputBuffer.length; i++) {
                // Linear interpolation
                const floor = Math.trunc(cursor);
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

    /**
     * Fills the output buffer with raw sample data using no interpolation (nearest neighbor).
     * @param outputBuffer The output buffer to write to.
     * @param step The step to advance every sample (playback rate).
     */
    public getSampleNearest(outputBuffer: Float32Array, step: number) {
        const sampleData = this.sampleData!;
        const loopEnd = this.loopEnd;
        const end = this.end;
        const loopLength = this.loopLength;
        let cursor = this.cursor;

        if (this.isLooping) {
            for (let i = 0; i < outputBuffer.length; i++) {
                // Check for loop
                cursor -= cursor >= loopEnd ? loopLength : 0;

                // Grab the nearest neighbor
                outputBuffer[i] = sampleData[Math.trunc(cursor)];
                cursor += step;
            }
        } else {
            for (let i = 0; i < outputBuffer.length; i++) {
                // Flag the voice as finished if needed
                if (cursor >= end) {
                    return false;
                }

                outputBuffer[i] = sampleData[Math.trunc(cursor)];
                cursor += step;
            }
        }
        this.cursor = cursor;
        return true;
    }

    /**
     * Fills the output buffer with raw sample data using Hermite interpolation.
     * @param outputBuffer The output buffer to write to.
     * @param step The step to advance every sample (playback rate).
     */
    public getSampleHermite(outputBuffer: Float32Array, step: number) {
        const sampleData = this.sampleData!;
        const loopEnd = this.loopEnd;
        const end = this.end;
        const loopLength = this.loopLength;
        let cursor = this.cursor;

        if (this.isLooping) {
            for (let i = 0; i < outputBuffer.length; i++) {
                // Check for loop
                cursor -= cursor >= loopEnd ? loopLength : 0;

                // Grab the 4 points
                const y0 = Math.trunc(cursor); // Point before the cursor.
                let y1 = y0 + 1; // Point after the cursor
                let y2 = y0 + 2; // Point 1 after the cursor
                let y3 = y0 + 3; // Point 2 after the cursor
                const t = cursor - y0; // The distance from y0 to cursor [0;1]
                // Y0 is not handled here
                // As it's math.trunc of cur which is handled above
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
                const t2 = t * t;
                const t3 = t2 * t;
                outputBuffer[i] = a * t3 - b * t2 + c * t + x0;

                cursor += step;
            }
        } else {
            for (let i = 0; i < outputBuffer.length; i++) {
                // Grab the 4 points
                const y0 = Math.trunc(cursor); // Point before the cursor.
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
                const t2 = t * t;
                const t3 = t2 * t;
                outputBuffer[i] = a * t3 - b * t2 + c * t + x0;

                cursor += step;
            }
        }
        this.cursor = cursor;
        return true;
    }
}
