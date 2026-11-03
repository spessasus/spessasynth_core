import { DC_BLOCKER_HZ, FirstOrderFilter } from "./first_order_filter";

/**
 * The corners of the two high passes in the wet path.
 */
const HIGH_PASS_A_HZ = 6577;
const HIGH_PASS_B_HZ = 7523;

/**
 * One channel of the Enhancer. Despite the name it has no nonlinearity: the input gets a copy of itself added,
 * high passed twice (second order in total), so the top end rises with the sensitivity and the mix.
 * @internal
 */
export class Enhancer {
    private readonly dcBlocker: FirstOrderFilter;
    private readonly highPassA: FirstOrderFilter;
    private readonly highPassB: FirstOrderFilter;
    private wet = 0;

    public constructor(sampleRate: number) {
        this.dcBlocker = new FirstOrderFilter(sampleRate);
        this.dcBlocker.setHighPass(DC_BLOCKER_HZ);
        this.highPassA = new FirstOrderFilter(sampleRate);
        this.highPassA.setHighPass(HIGH_PASS_A_HZ);
        this.highPassB = new FirstOrderFilter(sampleRate);
        this.highPassB.setHighPass(HIGH_PASS_B_HZ);
    }

    /**
     * @param sensitivity The gain of the wet path, 1 is 0 dB.
     * @param mix The mix gain of the wet path.
     */
    public set(sensitivity: number, mix: number) {
        this.wet = sensitivity * mix;
    }

    public process(x: number) {
        const dry = this.dcBlocker.process(x);
        return (
            dry + this.wet * this.highPassB.process(this.highPassA.process(dry))
        );
    }

    public clear() {
        this.dcBlocker.clear();
        this.highPassA.clear();
        this.highPassB.clear();
    }
}
