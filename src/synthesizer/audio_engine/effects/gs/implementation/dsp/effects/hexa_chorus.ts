import { GSEffect } from "../gs_effect";
import { levelGain, LINE_INPUT, STAGE_GAIN } from "../glue";
import type { DelayMemory } from "../blocks/delay_memory";
import { LFO } from "../blocks/lfo";
import { ModulatedDelay } from "../blocks/modulated_delay";
import { MonoMix } from "../blocks/mono_mix";
import { StereoOutput } from "../blocks/stereo_output";
import {
    modulationDepth,
    preDelay,
    rate1,
    STEP_MS,
    SWING_MS
} from "../conversion";

const TAPS = 6;

/**
 * The pan of one deviation step: a word of 136 over 2^15, so the outer taps reach 0.249 at a pan deviation of 20.
 */
const PAN_STEP = 136 / 32_768;

/**
 * The pan spread of each tap, in steps of the pan deviation (the left side, the right is the mirror image).
 */
const SPREAD = [3, 2, 1, -1, -2, -3];

/**
 * Hexa Chorus (`01 40`): six chorus taps on one mono line, one LFO, the taps 60 degrees apart. The deviation
 * parameters spread the taps' pre delays, depths and pans.
 * The left output reads every tap one 32 kHz sample before the right output (the shared stage's timing).
 * Parameters: 1 pre delay, 2 rate (Rate1 column), 3 depth, 4 pre delay deviation (0-20 ms), 5 depth deviation
 * (-20 to +20), 6 pan deviation (0-20), 16 balance, 17 low gain, 18 high gain, 20 level. EFX control source 1
 * modulates the rate, source 2 the balance.
 * @internal
 */
export class GSHexaChorus extends GSEffect {
    public readonly type = 0x01_40;
    protected readonly defaults = new Uint8Array([
        0x18, 0x08, 0x7f, 0x05, 0x42, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x40, 0x40, 0x40, 0x00, 0x70
    ]);
    protected readonly limits = { 3: 20, 4: 84, 5: 20 };
    // The depth deviation is -20 to +20 (44-84)
    protected readonly minimums = { 4: 44 };
    private readonly mix: MonoMix;
    private readonly lfo: LFO;
    /**
     * Reads 0-5 are the taps for the left output, 6-11 the same taps for the right.
     */
    private readonly delay: ModulatedDelay;
    private readonly output: StereoOutput;
    private readonly pansL = new Float64Array(TAPS);
    private readonly pansR = new Float64Array(TAPS);

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory);
        this.mix = new MonoMix(sampleRate);
        this.lfo = new LFO(sampleRate);
        // 100 ms of pre delay plus 5 x 20 ms of deviation
        this.delay = new ModulatedDelay(
            sampleRate,
            memory,
            2 * TAPS,
            200 + SWING_MS
        );
        for (let tap = 0; tap < TAPS; tap++) {
            this.delay.setPhase(tap, tap * 60);
            this.delay.setPhase(tap + TAPS, tap * 60);
        }
        this.output = new StereoOutput(sampleRate);
        this.reset();
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const { delay, pansL, pansR, output } = this;
        const taps = delay.output;
        for (let i = 0; i < sampleCount; i++) {
            const l = inputLeft[i];
            const r = inputRight[i];
            delay.process(
                this.mix.process(l, r) * LINE_INPUT,
                this.lfo.process()
            );
            let left = 0;
            let right = 0;
            for (let tap = 0; tap < TAPS; tap++) {
                left += pansL[tap] * taps[tap];
                right += pansR[tap] * taps[tap + TAPS];
            }
            output.process(l, left, r, right);
            outputLeft[i] = output.left;
            outputRight[i] = output.right;
        }
    }

    protected clear() {
        this.mix.clear();
        this.lfo.clear();
        this.delay.clear();
        this.output.clear();
    }

    protected update() {
        const p = this.parameters;
        this.lfo.setRate(rate1(this.controlled(0, 1)));
        for (let tap = 0; tap < TAPS; tap++) {
            const pre = preDelay(p[0]) + tap * p[3];
            const depth = modulationDepth(
                Math.max(0, Math.min(127, p[2] + tap * (p[4] - 64)))
            );
            // The left output's read is one 32 kHz sample earlier
            this.delay.setPreDelay(tap, pre - STEP_MS);
            this.delay.setPreDelay(tap + TAPS, pre);
            this.delay.setDepth(tap, depth);
            this.delay.setDepth(tap + TAPS, depth);
            // Each tap's pans add up to 0.5
            const pan = p[5] * SPREAD[tap] * PAN_STEP;
            this.pansL[tap] = 0.25 + pan;
            this.pansR[tap] = 0.25 - pan;
        }
        this.output.set(
            this.controlled(1, 15),
            p[16],
            p[17],
            levelGain(p[19]) * STAGE_GAIN
        );
    }
}
