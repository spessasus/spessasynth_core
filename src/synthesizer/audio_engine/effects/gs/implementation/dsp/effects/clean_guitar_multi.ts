import type { DelayMemory } from "../blocks/delay_memory";
import { levelGain, MONO_INPUT, STAGE_GAIN, STAGE_OUTPUT } from "../glue";
import { Wah } from "../blocks/wah";
import { DC_BLOCKER_HZ, FirstOrderFilter } from "../blocks/first_order_filter";
import { modulationDepth, rate1 } from "../conversion";
import {
    GSMulti,
    MULTI_WAH_GAIN,
    MultiCompressor,
    MultiDelay,
    MultiEQ,
    MultiModulation
} from "./guitar_multi";

/**
 * Clean GTR Multi 2's chain input, only the mono mix's 127/128. Its chain is linear (no compressor), so the whole
 * output stage goes on the level (`STAGE_GAIN`) instead of being split around the chain like Clean GTR Multi 1's.
 */
const LINEAR_INPUT = 127 / 128;

/**
 * Clean GTR Multi 1 (`04 03`): `L+R -> compressor -> 3-band EQ -> chorus/flanger -> delay`.
 * Parameters: 1-4 compressor sustain, attack (the manuals swap these two names, see `GSCompressor`), level and
 * switch, 5 low gain, 6-8 mid-frequency, Q and gain, 9 high gain, 10 chorus or flanger, 11 rate (Rate2 column),
 * 12 depth, 13 flanger feedback, 14 chorus level, 15 delay time (Dly4 column), 16 feedback, 17 HF damp, 18 delay
 * level, 20 level. EFX control source 1 moves the chorus level, source 2 the delay level.
 * @internal
 */
export class GSCleanGuitarMulti1 extends GSMulti {
    public readonly type = 0x04_03;
    protected readonly defaults = new Uint8Array([
        0x32, 0x7f, 0x4b, 0x01, 0x4c, 0x00, 0x02, 0x45, 0x34, 0x00, 0x08, 0x28,
        0x4f, 0x64, 0x18, 0x28, 0x7f, 0x1e, 0x00, 0x5f
    ]);
    protected readonly limits = { 3: 1, 6: 4, 9: 1 };
    private readonly compressor: MultiCompressor;
    private readonly eq: MultiEQ;
    private readonly modulation: MultiModulation;
    private readonly delay: MultiDelay;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory);
        this.compressor = new MultiCompressor(sampleRate);
        this.eq = new MultiEQ(sampleRate);
        this.modulation = new MultiModulation(sampleRate, memory);
        this.delay = new MultiDelay(sampleRate, memory);
        this.reset();
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const { modulation, delay } = this;
        for (let i = 0; i < sampleCount; i++) {
            const x =
                this.mix.process(inputLeft[i], inputRight[i]) * MONO_INPUT;
            modulation.process(this.eq.process(this.compressor.process(x)));
            delay.process(modulation.left, modulation.right);
            this.output(delay.left, delay.right, outputLeft, outputRight, i);
        }
    }

    protected clear() {
        super.clear();
        this.compressor.clear();
        this.eq.clear();
        this.modulation.clear();
        this.delay.clear();
    }

    protected update() {
        const p = this.parameters;
        this.compressor.update(p);
        this.eq.setShelves(p[4], p[8]);
        this.eq.setMid(p[5], p[6], p[7]);
        this.modulation.update(
            p[9] === 1,
            p[10],
            p[11],
            p[12],
            this.controlled(0, 13)
        );
        this.delay.update(p[14], p[15], this.controlled(1, 17), p[16]);
        this.gain = levelGain(p[19]) * STAGE_OUTPUT;
    }
}

/**
 * Clean GTR Multi 2 (`04 04`): `L+R -> wah -> 3-band EQ -> chorus/flanger -> delay`. The wah is the Auto Wah's without
 * the envelope follower, its LFO raises the cutoff (polarity up).
 * Parameters: 1 wah filter type (LPF, BPF), 2 manual, 3 peak, 4 rate (Rate1 column), 5 depth, 6 wah switch (SC-VA's
 * code calls it the EQ switch, but it bypasses the wah), 7 low gain, 8-10 mid-frequency, Q and gain, 11 high gain,
 * 12 chorus or flanger, 13 rate (Rate2 column), 14 depth, 15 flanger feedback, 16 chorus level, 17 delay time (Dly4
 * column), 18 feedback, 19 delay level, 20 level. EFX control source 1 moves the wah manual, source 2 the delay
 * level.
 * @internal
 */
export class GSCleanGuitarMulti2 extends GSMulti {
    public readonly type = 0x04_04;
    protected readonly defaults = new Uint8Array([
        0x01, 0x37, 0x28, 0x1d, 0x50, 0x01, 0x4c, 0x48, 0x00, 0x40, 0x40, 0x00,
        0x08, 0x14, 0x66, 0x64, 0x06, 0x0f, 0x50, 0x4c
    ]);
    protected readonly limits = { 0: 1, 5: 1, 8: 4, 11: 1 };
    private readonly dcBlocker: FirstOrderFilter;
    private readonly wah: Wah;
    private readonly eq: MultiEQ;
    private readonly modulation: MultiModulation;
    private readonly delay: MultiDelay;
    private wahOn = false;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory);
        this.dcBlocker = new FirstOrderFilter(sampleRate);
        this.dcBlocker.setHighPass(DC_BLOCKER_HZ);
        this.wah = new Wah(sampleRate);
        this.wah.setEnvelope(false);
        this.wah.setPolarity(true);
        this.eq = new MultiEQ(sampleRate);
        this.modulation = new MultiModulation(sampleRate, memory);
        this.delay = new MultiDelay(sampleRate, memory);
        this.reset();
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const { modulation, delay } = this;
        for (let i = 0; i < sampleCount; i++) {
            let x =
                this.mix.process(inputLeft[i], inputRight[i]) * LINEAR_INPUT;
            // The wah runs when it is switched off too. Unlike the Auto Wah's, a DC blocker comes first
            const wah =
                MULTI_WAH_GAIN * this.wah.process(this.dcBlocker.process(x));
            if (this.wahOn) x = wah;
            modulation.process(this.eq.process(x));
            delay.process(modulation.left, modulation.right);
            this.output(delay.left, delay.right, outputLeft, outputRight, i);
        }
    }

    protected clear() {
        super.clear();
        this.dcBlocker.clear();
        this.wah.clear();
        this.eq.clear();
        this.modulation.clear();
        this.delay.clear();
    }

    protected update() {
        const p = this.parameters;
        const wah = this.wah;
        wah.setFilterType(p[0] === 1);
        wah.setPeak(p[2]);
        wah.setManual(levelGain(this.controlled(0, 1)));
        wah.setRate(rate1(p[3]));
        // The depth word is the chorus swing in ms over 16
        wah.setDepth(modulationDepth(p[4]) / 16);
        this.wahOn = p[5] === 1;
        this.eq.setShelves(p[6], p[10]);
        this.eq.setMid(p[7], p[8], p[9]);
        this.modulation.update(p[11] === 1, p[12], p[13], p[14], p[15]);
        this.delay.update(p[16], p[17], this.controlled(1, 18));
        this.gain = levelGain(p[19]) * STAGE_GAIN;
    }
}
