import { type InterpolationType, interpolationTypes } from "../../../enums";
import type { Voice } from "../voice";

/**
 * Wavetable_oscillator.ts
 * purpose: plays back raw audio data at an arbitrary playback rate
 */

export class WavetableOscillator {
    /**
     * Fills the output buffer with raw sample data using a given interpolation.
     * @param voice The voice we're working on.
     * @param outputBuffer The output buffer to write to.
     * @param interpolation The interpolation type.
     */
    public static getSample(
        voice: Voice,
        outputBuffer: Float32Array,
        interpolation: InterpolationType
    ) {
        const step = voice.currentTuningCalculated * voice.sample.playbackStep;
        // Why not?
        if (step === 1) {
            WavetableOscillator.getSampleNearest(voice, outputBuffer, step);
            return;
        }
        switch (interpolation) {
            case interpolationTypes.hermite:
                this.getSampleHermite(voice, outputBuffer, step);
                return;

            case interpolationTypes.linear:
            default:
                this.getSampleLinear(voice, outputBuffer, step);
                return;

            case interpolationTypes.nearestNeighbor:
                WavetableOscillator.getSampleNearest(voice, outputBuffer, step);
                return;
        }
    }

    /**
     * Fills the output buffer with raw sample data using linear interpolation.
     * @param voice The voice we're working on.
     * @param outputBuffer The output buffer to write to.
     * @param step The step to advance every sample (playback rate).
     */
    public static getSampleLinear(
        voice: Voice,
        outputBuffer: Float32Array,
        step: number
    ) {
        const sample = voice.sample;
        let cur = sample.cursor;
        const sampleData = sample.sampleData;

        if (sample.isLooping) {
            const loopLength = sample.loopEnd - sample.loopStart;
            for (let i = 0; i < outputBuffer.length; i++) {
                // Check for loop
                while (cur >= sample.loopEnd) {
                    cur -= loopLength;
                }

                // Grab the 2 nearest points
                const floor = ~~cur;
                let ceil = floor + 1;

                while (ceil >= sample.loopEnd) {
                    ceil -= loopLength;
                }

                const fraction = cur - floor;

                // Grab the samples and interpolate
                const upper = sampleData[ceil];
                const lower = sampleData[floor];
                outputBuffer[i] = lower + (upper - lower) * fraction;

                cur += step;
            }
        } else {
            for (let i = 0; i < outputBuffer.length; i++) {
                // Linear interpolation
                const floor = ~~cur;
                const ceil = floor + 1;

                // Flag the voice as finished if needed
                if (ceil >= sample.end) {
                    voice.finished = true;
                    return;
                }

                const fraction = cur - floor;

                // Grab the samples and interpolate
                const upper = sampleData[ceil];
                const lower = sampleData[floor];
                outputBuffer[i] = lower + (upper - lower) * fraction;

                cur += step;
            }
        }
        voice.sample.cursor = cur;
    }

    /**
     * Fills the output buffer with raw sample data using no interpolation (nearest neighbor).
     * @param voice The voice we're working on.
     * @param outputBuffer The output buffer to write to.
     * @param step The step to advance every sample (playback rate).
     */
    public static getSampleNearest(
        voice: Voice,
        outputBuffer: Float32Array,
        step: number
    ) {
        const sample = voice.sample;
        let cur = sample.cursor;
        const sampleData = sample.sampleData;

        if (sample.isLooping) {
            const loopLength = sample.loopEnd - sample.loopStart;
            for (let i = 0; i < outputBuffer.length; i++) {
                // Check for loop
                while (cur >= sample.loopEnd) {
                    cur -= loopLength;
                }

                // Grab the nearest neighbor
                let ceil = ~~cur + 1;

                while (ceil >= sample.loopEnd) {
                    ceil -= loopLength;
                }

                outputBuffer[i] = sampleData[ceil];
                cur += step;
            }
        } else {
            for (let i = 0; i < outputBuffer.length; i++) {
                // Nearest neighbor
                const ceil = ~~cur + 1;

                // Flag the voice as finished if needed
                if (ceil >= sample.end) {
                    voice.finished = true;
                    return;
                }

                outputBuffer[i] = sampleData[ceil];
                cur += step;
            }
        }
        sample.cursor = cur;
    }

    /**
     * Fills the output buffer with raw sample data using Hermite interpolation.
     * @param voice The voice we're working on.
     * @param outputBuffer The output buffer to write to.
     * @param step The step to advance every sample (playback rate).
     */
    public static getSampleHermite(
        voice: Voice,
        outputBuffer: Float32Array,
        step: number
    ) {
        const sample = voice.sample;
        let cur = sample.cursor;
        const sampleData = sample.sampleData;

        if (sample.isLooping) {
            const loopLength = sample.loopEnd - sample.loopStart;
            for (let i = 0; i < outputBuffer.length; i++) {
                // Check for loop (it can exceed the end point multiple times)
                while (cur >= sample.loopEnd) {
                    cur -= loopLength;
                }

                // Grab the 4 points
                const y0 = ~~cur; // Point before the cursor. twice bitwise-not is just a faster Math.floor
                let y1 = y0 + 1; // Point after the cursor
                let y2 = y0 + 2; // Point 1 after the cursor
                let y3 = y0 + 3; // Point 2 after the cursor
                const t = cur - y0; // The distance from y0 to cursor [0;1]
                // Y0 is not handled here
                // As it's math.floor of cur which is handled above
                if (y1 >= sample.loopEnd) {
                    y1 -= loopLength;
                }
                if (y2 >= sample.loopEnd) {
                    y2 -= loopLength;
                }
                if (y3 >= sample.loopEnd) {
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

                cur += step;
            }
        } else {
            for (let i = 0; i < outputBuffer.length; i++) {
                // Grab the 4 points
                const y0 = ~~cur; // Point before the cursor. twice bitwise-not is just a faster Math.floor
                const y1 = y0 + 1; // Point after the cursor
                const y2 = y0 + 2; // Point 1 after the cursor
                const y3 = y0 + 3; // Point 2 after the cursor
                const t = cur - y0; // The distance from y0 to cursor [0;1]

                // Flag as finished if needed
                if (y1 >= sample.end || y2 >= sample.end || y3 >= sample.end) {
                    voice.finished = true;
                    return;
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

                cur += step;
            }
        }
        voice.sample.cursor = cur;
    }
}
