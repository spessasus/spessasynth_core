import { GSEffect } from "../gs_effect";
import {
    levelGain,
    MONO_INPUT,
    panLeft,
    panRight,
    saturate,
    saturateAt,
    SATURATED_INPUT,
    SATURATED_OUTPUT,
    shelfGain,
    STAGE_OUTPUT
} from "../glue";
import { MonoMix } from "../blocks/mono_mix";
import { Compressor, detectorGain, recoveryRate } from "../blocks/dynamics";
import { DC_BLOCKER_HZ, FirstOrderFilter } from "../blocks/first_order_filter";
import { LoFiQuantizer } from "../blocks/lofi_quantizer";
import { Biquad } from "../blocks/biquad";
import { DelayLine } from "../blocks/delay_line";
import { ShelfCorners, ShelfEQ } from "../blocks/shelf_eq";
import { MonoPan } from "../blocks/mono_pan";

/**
 * The gain after the compressor per pre-ilter (1 bypasses the compressor).
 */
const PRE_GAINS = [1, 2, 2, 4, 4, (2 * 127) / 32];

/**
 * The pre-filters' low pass: the hardware's bytes (b = 37/128, pole 53/128), 4.0 kHz with -0.11 dB at DC.
 */
const PRE_POLE = 53 / 128;
const PRE_HZ = (32_000 / Math.PI) * Math.atan((1 - PRE_POLE) / (1 + PRE_POLE));
const PRE_GAIN = (2 * 37) / 128 / (1 - PRE_POLE);

/**
 * The post filters (1-6): the high pass as its bytes (b0, pole) and the dip at 1 kHz (-12 dB), its poles and zeros
 * at one frequency with the Q of each.
 */
const POST_FILTERS = [
    null,
    { b0: 121, pole: 113, hz: 978.065, poleQ: 1.0018, zeroQ: 4.115_52 },
    { b0: 110, pole: 93, hz: 978.065, poleQ: 1.0018, zeroQ: 4.115_52 },
    { b0: 121, pole: 113, hz: 997.345, poleQ: 0.504_22, zeroQ: 1.961_36 },
    { b0: 110, pole: 93, hz: 997.345, poleQ: 0.504_22, zeroQ: 1.961_36 },
    { b0: 121, pole: 113, hz: 992.619, poleQ: 0.255_73, zeroQ: 1.022_92 }
];

/**
 * Lo-Fi 1 (`01 72`): `L+R -> compressor (pre-filter) -> low pass -> quantizer -> high pass and dip (post filter)`,
 * mixed with the mono input by the balance, then the EQ and the pan.
 * Parameters: 1 pre-filter (1 dry, 2-6 the compressor with a gain of 2 to 7.94, 3 and 5 with a 4 kHz low pass),
 * 2 lo-fi type (15 or 11 bits at 16000, 10667 or 8000 Hz), 3 post filter (high pass at 633 or 1595 Hz and a dip at
 * 1 kHz of Q 2, 1 or 0.5), 16 balance (the pan law), 17 low gain, 18 high gain, 19 pan, 20 level. EFX control source
 * 1 modulates the balance, source 2 the pan.
 * @internal
 */
export class GSLoFi1 extends GSEffect {
    public readonly type = 0x01_72;
    protected readonly defaults = new Uint8Array([
        0x01, 0x05, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x7f, 0x40, 0x40, 0x40, 0x7f
    ]);
    protected readonly limits = { 0: 5, 1: 8, 2: 5 };
    private readonly mix: MonoMix;
    private readonly compressor: Compressor;
    /**
     * The compressor's own DC blocker, for the dry path and the pre-filter that bypasses it.
     */
    private readonly dcBlocker: FirstOrderFilter;
    private readonly lowPass: FirstOrderFilter;
    private readonly quantizer: LoFiQuantizer;
    private readonly highPass: FirstOrderFilter;
    private readonly dip: Biquad;
    private readonly shelves: ShelfEQ;
    private readonly pan: MonoPan;
    private readonly dryLine: DelayLine;
    private compressed = false;
    private postOn = false;
    private dry = 0;
    private wet = 0;

    public constructor(sampleRate: number) {
        super(sampleRate);
        this.mix = new MonoMix(sampleRate);
        this.compressor = new Compressor(sampleRate);
        // The Compressor's defaults: sustain 72, attack 100 (parameters 1 and 2, see GSCompressor for the names)
        this.compressor.setRecoveryRate(recoveryRate(72));
        this.compressor.setMakeup(detectorGain(100));
        this.dcBlocker = new FirstOrderFilter(sampleRate);
        this.dcBlocker.setHighPass(DC_BLOCKER_HZ);
        this.lowPass = new FirstOrderFilter(sampleRate);
        this.quantizer = new LoFiQuantizer(sampleRate);
        this.highPass = new FirstOrderFilter(sampleRate);
        this.dip = new Biquad(sampleRate);
        this.shelves = new ShelfEQ(sampleRate);
        this.pan = new MonoPan(sampleRate);
        this.dryLine = new DelayLine(this.quantizer.latency);
        this.reset();
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        for (let i = 0; i < sampleCount; i++) {
            // The program saturates its stage like the Compressor and the Limiter
            const x =
                this.mix.process(
                    saturateAt(inputLeft[i], SATURATED_INPUT),
                    saturateAt(inputRight[i], SATURATED_INPUT)
                ) * MONO_INPUT;
            const now = this.dcBlocker.process(x);
            // The dry path waits for the quantizer's latency
            this.dryLine.write(now);
            const h = this.dryLine.read(this.quantizer.latency);
            // Both paths run, so a pre-filter change does not click
            const c = this.compressor.process(x);
            let y = this.quantizer.process(
                (127 / 128) * this.lowPass.process(this.compressed ? c : now)
            );
            if (this.postOn) {
                // Every operation saturates: after pre-filter 6 the dip clips
                y = saturate(
                    this.dip.process(saturate(this.highPass.process(y)))
                );
            }
            this.pan.process(this.shelves.process(this.wet * y + this.dry * h));
            outputLeft[i] = saturateAt(this.pan.left, SATURATED_OUTPUT);
            outputRight[i] = saturateAt(this.pan.right, SATURATED_OUTPUT);
        }
    }

    protected clear() {
        this.mix.clear();
        this.compressor.clear();
        this.dcBlocker.clear();
        this.dryLine.clear();
        this.lowPass.clear();
        this.quantizer.clear();
        this.highPass.clear();
        this.dip.clear();
        this.shelves.clear();
        this.pan.clear();
    }

    protected update() {
        const p = this.parameters;
        this.compressed = p[0] > 0;
        this.compressor.setPostGain(PRE_GAINS[p[0]]);
        if (p[0] === 2 || p[0] === 4) this.lowPass.setLowPass(PRE_HZ, PRE_GAIN);
        else this.lowPass.setGain(127 / 128);
        this.quantizer.setType(p[1]);
        const post = POST_FILTERS[p[2]];
        this.postOn = post !== null;
        if (post) {
            const pole = post.pole / 128;
            this.highPass.setHighPass(
                (32_000 / Math.PI) * Math.atan((1 - pole) / (1 + pole)),
                (2 * post.b0) / 128 / (1 + pole)
            );
            this.dip.setPoleZero(post.hz, post.poleQ, post.hz, post.zeroQ);
        }
        const balance = this.controlled(0, 15);
        this.dry = panLeft(balance);
        this.wet = panRight(balance);
        this.shelves.setLow(ShelfCorners.low200, shelfGain(p[16]));
        this.shelves.setHigh(ShelfCorners.high4k, shelfGain(p[17]));
        this.pan.set(this.controlled(1, 18), levelGain(p[19]) * STAGE_OUTPUT);
    }
}
