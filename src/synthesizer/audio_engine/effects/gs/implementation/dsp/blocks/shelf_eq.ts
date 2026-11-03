import { FirstOrderFilter } from "./first_order_filter";

/**
 * The corners of the shelves. The labels are what the manuals print, the values are where the hardware's corners
 * really are (the low shelves sit above their labels).
 * @internal
 */
export const ShelfCorners = {
    low200: 224.5,
    low400: 425,
    high4k: 3969,
    high8k: 8012
} as const;

/**
 * The "EQ" box of the manuals: a first order low shelf, then a first order high shelf, each -12 to +12 dB.
 * At 0 dB both are exactly unity.
 * @internal
 */
export class ShelfEQ {
    private readonly low: FirstOrderFilter;
    private readonly high: FirstOrderFilter;

    public constructor(sampleRate: number) {
        this.low = new FirstOrderFilter(sampleRate);
        this.high = new FirstOrderFilter(sampleRate);
    }

    /**
     * @param frequency The corner in Hz (`ShelfCorners`).
     * @param gainDb The gain in dB.
     */
    public setLow(frequency: number, gainDb: number) {
        this.low.setLowShelf(frequency, gainDb);
    }

    /**
     * @param frequency The corner in Hz (`ShelfCorners`).
     * @param gainDb The gain in dB.
     */
    public setHigh(frequency: number, gainDb: number) {
        this.high.setHighShelf(frequency, gainDb);
    }

    public process(x: number) {
        return this.high.process(this.low.process(x));
    }

    public clear() {
        this.low.clear();
        this.high.clear();
    }
}
