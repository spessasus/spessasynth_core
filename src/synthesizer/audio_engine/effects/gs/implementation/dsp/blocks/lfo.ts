/**
 * The hardware's parabolic sine of an LFO phase.
 * @param phase The phase, -1 to 1.
 * @internal
 */
export function parabolicSine(phase: number) {
    return 4 * phase * (1 - Math.abs(phase));
}

/**
 * The LFO phase of the choruses, flangers, delays, tremolos and the ring modulator: a ramp over -1 to 1 per cycle. The blocks take what they need
 * from it (the triangle is its absolute value).
 * @internal
 */
export class LFO {
    /**
     * The phase of this sample, -1 to 1.
     */
    public phase = 0;
    private readonly sampleRate: number;
    private increment = 0;

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
    }

    /**
     * @param hz The rate.
     */
    public setRate(hz: number) {
        this.increment = (2 * hz) / this.sampleRate;
    }

    public process() {
        let phase = this.phase + this.increment;
        if (phase >= 1) phase -= 2;
        this.phase = phase;
        return phase;
    }

    public clear() {
        this.phase = 0;
    }
}
