import { detectorGain, Limiter } from "../blocks/dynamics";
import { GSDynamicsEffect } from "./dynamics_effect";

/**
 * Limiter (`01 31`).
 * Parameters: 1 threshold, 2 ratio, 3 release, 4 post gain, then the EQ, pan and level.
 * @internal
 */
export class GSLimiter extends GSDynamicsEffect {
    public readonly type = 0x01_31;
    protected readonly defaults = new Uint8Array([
        0x55, 0x03, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x40, 0x40, 0x40, 0x7f
    ]);
    protected readonly limits = { 1: 3, 3: 3 };
    protected readonly dynamics: Limiter;
    protected readonly preGain = 127 / 128;

    public constructor(sampleRate: number) {
        super(sampleRate);
        this.dynamics = new Limiter(sampleRate);
        this.reset();
    }

    protected updateDynamics() {
        const p = this.parameters;
        // The threshold runs the other way: 0 is the highest detector gain (-59.8 dBFS)
        this.dynamics.setThreshold(detectorGain(127 - p[0]));
        this.dynamics.setRatio(p[1]);
        // The gain grows by e in 63 ms (0) to 4.1 s (127): 4.98e-4 x the release word per 32 kHz sample
        // That is 2% more than the word says (SC-VA's float seed, kept like the floor since it sets the fade-in)
        const release = 2 ** (14.975 - p[2] / 21.16) / 32_768;
        this.dynamics.setRelease(1 / (32_000 * 4.9828e-4 * release));
        return p[3];
    }
}
