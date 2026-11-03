import { GSEffect } from "../gs_effect";
import { levelGain, shelfGain, STAGE_GAIN } from "../glue";
import { ShelfCorners, ShelfEQ } from "../blocks/shelf_eq";
import { PeakingBand } from "../blocks/peaking_band";

/**
 * Equalizer (`01 00`): a stereo 4-band EQ. Each channel runs the low and high shelves and two peaking bands.
 * Parameters: 1 low frequency (200/400 Hz), 2 low gain, 3 high frequency (4k/8k Hz), 4 high gain, 5-7 mid 1
 * frequency, Q and gain, 8-10 mid 2, 20 level. EFX control source 1 modulates the level.
 * @internal
 */
export class GSEqualizer extends GSEffect {
    public readonly type = 0x01_00;
    protected readonly defaults = new Uint8Array([
        0x01, 0x45, 0x01, 0x34, 0x48, 0x00, 0x48, 0x38, 0x00, 0x38, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7f
    ]);
    protected readonly limits = { 0: 1, 2: 1, 5: 4, 8: 4 };
    private readonly shelvesL: ShelfEQ;
    private readonly shelvesR: ShelfEQ;
    private readonly mid1L: PeakingBand;
    private readonly mid1R: PeakingBand;
    private readonly mid2L: PeakingBand;
    private readonly mid2R: PeakingBand;
    private gain = 0;

    public constructor(sampleRate: number) {
        super(sampleRate);
        this.shelvesL = new ShelfEQ(sampleRate);
        this.shelvesR = new ShelfEQ(sampleRate);
        this.mid1L = new PeakingBand(sampleRate);
        this.mid1R = new PeakingBand(sampleRate);
        this.mid2L = new PeakingBand(sampleRate);
        this.mid2R = new PeakingBand(sampleRate);
        this.reset();
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const gain = this.gain;
        for (let i = 0; i < sampleCount; i++) {
            const l = this.mid2L.process(
                this.mid1L.process(this.shelvesL.process(inputLeft[i]))
            );
            const r = this.mid2R.process(
                this.mid1R.process(this.shelvesR.process(inputRight[i]))
            );
            outputLeft[i] = l * gain;
            outputRight[i] = r * gain;
        }
    }

    protected clear() {
        this.shelvesL.clear();
        this.shelvesR.clear();
        this.mid1L.clear();
        this.mid1R.clear();
        this.mid2L.clear();
        this.mid2R.clear();
    }

    protected update() {
        const p = this.parameters;
        const low = p[0] ? ShelfCorners.low400 : ShelfCorners.low200;
        const high = p[2] ? ShelfCorners.high8k : ShelfCorners.high4k;
        this.shelvesL.setLow(low, shelfGain(p[1]));
        this.shelvesL.setHigh(high, shelfGain(p[3]));
        this.shelvesR.setLow(low, shelfGain(p[1]));
        this.shelvesR.setHigh(high, shelfGain(p[3]));
        this.mid1L.setParameters(p[4], p[5], p[6]);
        this.mid1R.setParameters(p[4], p[5], p[6]);
        this.mid2L.setParameters(p[7], p[8], p[9]);
        this.mid2R.setParameters(p[7], p[8], p[9]);
        // The EQ input has one more 127/128 than the output stage
        this.gain =
            (levelGain(this.controlled(0, 19)) * STAGE_GAIN * 127) / 128;
    }
}
