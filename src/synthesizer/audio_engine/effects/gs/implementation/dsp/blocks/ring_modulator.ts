import { LFO, parabolicSine } from "./lfo";

/**
 * The ring modulator of Keyboard Multi: one sine carrier (the hardware's parabolic one) that the effect multiplies
 * the signal with. SC-VA adds the octave to the carrier, the hardware does not.
 * Call `process` once per sample, then read `carrier`.
 * @internal
 */
export class RingModulator {
    /**
     * The carrier of this sample, -1 to 1.
     */
    public carrier = 0;
    private readonly sampleRate: number;
    private readonly lfo: LFO;
    private frequency = 0;
    private startDelay = 0;
    private pending = true;

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.lfo = new LFO(sampleRate);
    }

    /**
     * @param hz The carrier frequency.
     */
    public setFrequency(hz: number) {
        this.frequency = hz;
        this.lfo.setRate(hz);
    }

    /**
     * Starts the carrier later after a clear, so it lines up with a delayed signal.
     * @param samples How much later, in host samples (fractions too).
     */
    public setStartDelay(samples: number) {
        this.startDelay = samples;
    }

    public process() {
        const lfo = this.lfo;
        if (this.pending) {
            // The first step after a clear: the phase starts back by the delay at the frequency set by now
            this.pending = false;
            lfo.phase -=
                (this.startDelay * 2 * this.frequency) / this.sampleRate;
            lfo.phase -= 2 * Math.floor((lfo.phase + 1) / 2);
        }
        this.carrier = parabolicSine(lfo.process());
    }

    public clear() {
        this.lfo.clear();
        this.pending = true;
        this.carrier = 0;
    }
}
