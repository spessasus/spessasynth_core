import { OutputLag } from "./output_lag";

/**
 * The mono input of the mono wet types: `0.5 L + 0.5 R`, with the left input one 32 kHz sample late.
 * Both hardware units have this skew, a centered source hears it as `(1 + z^-1) / 2` at 32 kHz (-3 dB at 8 kHz).
 *
 * At rates that are not a multiple of 32 kHz the left side goes through the allpass of `OutputLag`.
 * @internal
 */
export class MonoMix {
    /**
     * The two inputs of the last `process` as the mix takes them: the left one 32 kHz sample late. For the types
     * that keep both channels and mix them into each output (the keyboard multis).
     */
    public skewedLeft = 0;
    public skewedRight = 0;
    private readonly left: OutputLag;

    public constructor(sampleRate: number) {
        this.left = new OutputLag(sampleRate);
    }

    public process(left: number, right: number) {
        const delayed = this.left.process(left);
        this.skewedLeft = delayed;
        this.skewedRight = right;
        return 0.5 * (delayed + right);
    }

    public clear() {
        this.left.clear();
    }
}
