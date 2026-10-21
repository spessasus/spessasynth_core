import { WavetableOscillator } from "./wavetable_oscillator";

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
