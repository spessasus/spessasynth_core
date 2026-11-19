import { DC_BLOCKER_HZ, FirstOrderFilter } from "./first_order_filter";

/**
 * The system effects' LEVEL is a gain over 64, so 64 is unity and 127 almost doubles.
 * @internal
 */
export const LEVEL_UNITY = 64;

/**
 * Their sends, tap levels and the chorus feedback are gain bytes over 128, so 127 never quite reaches unity.
 * @internal
 */
export const GAIN_SCALE = 128;

/**
 * The input of the system effects (reverb, chorus, delay): a DC blocker, then the PRE-LPF.
 *
 * The PRE-LPF is the hardware's one-pole `y = (1 - B) x + B y[n-1]` at 32 kHz with B = value / 8.
 * @internal
 */
export class SendInput {
    private readonly dcBlocker: FirstOrderFilter;
    private readonly lowPass: FirstOrderFilter;

    public constructor(sampleRate: number) {
        this.dcBlocker = new FirstOrderFilter(sampleRate);
        this.dcBlocker.setHighPass(DC_BLOCKER_HZ);
        this.lowPass = new FirstOrderFilter(sampleRate);
    }

    /**
     * @param value The PRE-LPF parameter, 0 (off) to 7.
     */
    public setPreLowPass(value: number) {
        if (value <= 0) this.lowPass.setOff();
        else this.lowPass.setDampPole(Math.min(value, 7) / 8);
    }

    public process(x: number) {
        return this.lowPass.process(this.dcBlocker.process(x));
    }

    public clear() {
        this.dcBlocker.clear();
        this.lowPass.clear();
    }
}
