import { XGVariationProgram } from "./xg_variation_program";

/**
 * The category 3 coefficients that the original never writes.
 */
const UNWRITTEN_CATEGORY_3 = [0x7e, 0x7f, 0x8c, 0x8e, 0x99, 0x9b];

/**
 * The base for the S-YXG50 category 3 variation programs (auto wah, karaoke),
 * which run their own input filters.
 * 0x86 is scaled by 2^-19 and 0x87 by 8, 0x7e sets the LFO step and the frequency scale (0xbf).
 */
export abstract class XGFilterVariationProgram extends XGVariationProgram {
    protected override readonly unwrittenCoefficients = UNWRITTEN_CATEGORY_3;
    /**
     * The auto wah LFO step (coefficient 0x7e).
     */
    protected wahStep = 0;

    public constructor(
        sampleRate: number,
        maxBufferSize: number,
        memory: Float32Array
    ) {
        super(sampleRate, maxBufferSize, memory, 3);
    }

    protected override pushCoefficients(
        list: ArrayLike<number>,
        count = list.length,
        offset = 0
    ) {
        super.pushCoefficients(list, count, offset);
        if (!this.pushEnabled) return;
        const c = this.coefficients;
        for (let i = offset; i < offset + count; i++) {
            const k = list[i];
            switch (k) {
                case 0x86: {
                    c[k] = Math.fround(c[k] * 2 ** -19);
                    break;
                }
                case 0x87: {
                    c[k] = Math.fround(c[k] * 8);
                    break;
                }
                case 0x7e: {
                    // The LFO step and the rate-dependent frequency scale
                    this.wahStep = Math.trunc(
                        this.rawCoefficient(0x7e) *
                            this.rateInverse *
                            16_777_216
                    );
                    c[0xbf] = Math.fround(this.rateInverse / 256);
                    break;
                }
            }
        }
    }
}
