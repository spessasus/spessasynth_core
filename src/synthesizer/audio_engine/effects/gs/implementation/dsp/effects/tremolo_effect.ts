import { GSEffect } from "../gs_effect";
import { levelGain, shelfGain, STAGE_GAIN } from "../glue";
import { DC_BLOCKER_HZ, FirstOrderFilter } from "../blocks/first_order_filter";
import { Tremolo } from "../blocks/tremolo";
import { ShelfCorners, ShelfEQ } from "../blocks/shelf_eq";
import { rate1 } from "../conversion";

/**
 * Tremolo and Auto Pan: per channel `DC blocker -> LFO gain -> EQ`.
 * Parameters: 1 wave, 2 rate (Rate1 column), 3 depth, 17 low gain, 18 high gain, 20 level. EFX control source 1
 * modulates the rate, source 2 the depth.
 * @internal
 */
export abstract class GSTremoloEffect extends GSEffect {
    protected readonly limits = { 0: 4 };
    private readonly tremolo: Tremolo;
    private readonly dcBlockerL: FirstOrderFilter;
    private readonly dcBlockerR: FirstOrderFilter;
    private readonly shelvesL: ShelfEQ;
    private readonly shelvesR: ShelfEQ;
    private gain = 0;

    /**
     * @param sampleRate The sample rate.
     * @param pan True for auto pan.
     */
    protected constructor(sampleRate: number, pan: boolean) {
        super(sampleRate);
        this.tremolo = new Tremolo(sampleRate);
        this.tremolo.setPan(pan);
        this.dcBlockerL = new FirstOrderFilter(sampleRate);
        this.dcBlockerL.setHighPass(DC_BLOCKER_HZ);
        this.dcBlockerR = new FirstOrderFilter(sampleRate);
        this.dcBlockerR.setHighPass(DC_BLOCKER_HZ);
        this.shelvesL = new ShelfEQ(sampleRate);
        this.shelvesR = new ShelfEQ(sampleRate);
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const tremolo = this.tremolo;
        const gain = this.gain;
        for (let i = 0; i < sampleCount; i++) {
            tremolo.process();
            const l = this.dcBlockerL.process(inputLeft[i]) * tremolo.left;
            const r = this.dcBlockerR.process(inputRight[i]) * tremolo.right;
            outputLeft[i] = this.shelvesL.process(l) * gain;
            outputRight[i] = this.shelvesR.process(r) * gain;
        }
    }

    protected clear() {
        this.tremolo.clear();
        this.dcBlockerL.clear();
        this.dcBlockerR.clear();
        this.shelvesL.clear();
        this.shelvesR.clear();
    }

    protected update() {
        const p = this.parameters;
        this.tremolo.setWave(p[0]);
        this.tremolo.setRate(rate1(this.controlled(0, 1)));
        this.tremolo.setDepth(levelGain(this.controlled(1, 2)));
        this.shelvesL.setLow(ShelfCorners.low200, shelfGain(p[16]));
        this.shelvesL.setHigh(ShelfCorners.high4k, shelfGain(p[17]));
        this.shelvesR.setLow(ShelfCorners.low200, shelfGain(p[16]));
        this.shelvesR.setHigh(ShelfCorners.high4k, shelfGain(p[17]));
        // The input and the gain stage each have one more 127/128 than the output stage
        this.gain = levelGain(p[19]) * STAGE_GAIN * (127 / 128) ** 2;
    }
}
