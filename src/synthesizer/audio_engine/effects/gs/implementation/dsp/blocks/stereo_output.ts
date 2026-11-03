import { ShelfCorners, ShelfEQ } from "./shelf_eq";
import { balanceDry, balanceWet, shelfGain } from "../glue";

/**
 * The output of most stereo types: dry and wet mixed by the balance, then the 2-band EQ (200 Hz and 4 kHz shelves)
 * per side and the output gain.
 * @internal
 */
export class StereoOutput {
    public left = 0;
    public right = 0;
    private readonly shelvesL: ShelfEQ;
    private readonly shelvesR: ShelfEQ;
    private dry = 0;
    private wet = 0;
    private gain = 0;

    public constructor(sampleRate: number) {
        this.shelvesL = new ShelfEQ(sampleRate);
        this.shelvesR = new ShelfEQ(sampleRate);
    }

    /**
     * @param balance The balance parameter (0 dry, 127 wet).
     * @param low The low gain parameter.
     * @param high The high gain parameter.
     * @param gain The output gain (the level and the stage's gains).
     */
    public set(balance: number, low: number, high: number, gain: number) {
        this.dry = balanceDry(balance);
        this.wet = balanceWet(balance);
        this.shelvesL.setLow(ShelfCorners.low200, shelfGain(low));
        this.shelvesL.setHigh(ShelfCorners.high4k, shelfGain(high));
        this.shelvesR.setLow(ShelfCorners.low200, shelfGain(low));
        this.shelvesR.setHigh(ShelfCorners.high4k, shelfGain(high));
        this.gain = gain;
    }

    /**
     * Mixes one sample into `left` and `right`.
     * @param dryL The left dry signal.
     * @param wetL The left wet signal.
     * @param dryR The right dry signal.
     * @param wetR The right wet signal.
     */
    public process(dryL: number, wetL: number, dryR: number, wetR: number) {
        const { dry, wet, gain } = this;
        this.left = this.shelvesL.process(dry * dryL + wet * wetL) * gain;
        this.right = this.shelvesR.process(dry * dryR + wet * wetR) * gain;
    }

    public clear() {
        this.shelvesL.clear();
        this.shelvesR.clear();
        this.left = this.right = 0;
    }
}
