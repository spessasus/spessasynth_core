import { HRTFPair, type HRTFSet } from "./hrtf_pair";
import { OutputMode3D } from "./output_mode_3d";

/**
 * The fixed set: a direction tuned for 90 degrees (between the positioner's 84 and 96, with its own far taps).
 */
const CROSSTALK: HRTFSet = {
    a: 1.531_25,
    b2: -0.445_312_5,
    b4: 0.281_25,
    f: 0.742_187_5,
    g: 0.109_375,
    d1: 22,
    h: 0.046_875,
    d2: 27
};

/**
 * The 3D stage of 3D Chorus and 3D Delay: two sources placed at left and right 90 degrees through the fixed near and
 * far ear pair (the first source's near ear is the left one, the second's the right one), then the output mode
 * (the speaker network with its 562.5 us numerator tap, switched hard).
 * @internal
 */
export class Crosstalk3D {
    public left = 0;
    public right = 0;
    private readonly first: HRTFPair;
    private readonly second: HRTFPair;
    private readonly output: OutputMode3D;

    public constructor(sampleRate: number) {
        this.first = new HRTFPair(sampleRate, CROSSTALK);
        this.second = new HRTFPair(sampleRate, CROSSTALK);
        this.output = new OutputMode3D(sampleRate, 18, false);
    }

    /**
     * @param phones Phones instead of speakers.
     */
    public setPhones(phones: boolean) {
        this.output.setPhones(phones);
    }

    /**
     * @param a The first (left) source.
     * @param b The second (right) source.
     */
    public process(a: number, b: number) {
        const { first, second, output } = this;
        first.process(a);
        second.process(b);
        output.process(first.near + second.far, first.far + second.near);
        this.left = output.left;
        this.right = output.right;
    }

    public clear() {
        this.first.clear();
        this.second.clear();
        this.output.clear();
        this.left = this.right = 0;
    }
}
