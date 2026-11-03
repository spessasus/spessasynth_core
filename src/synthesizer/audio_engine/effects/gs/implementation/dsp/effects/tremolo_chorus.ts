import { GSEffect } from "../gs_effect";
import { levelGain, LINE_INPUT, STAGE_GAIN } from "../glue";
import type { DelayMemory } from "../blocks/delay_memory";
import { LFO } from "../blocks/lfo";
import { ModulatedDelay } from "../blocks/modulated_delay";
import { MonoMix } from "../blocks/mono_mix";
import { StereoOutput } from "../blocks/stereo_output";
import { tremoloRest } from "../blocks/tremolo";
import {
    chorusPhase,
    modulationDepth,
    preDelay,
    rate1,
    STEP_MS,
    SWING_MS
} from "../conversion";

/**
 * Tremolo Chorus (`01 41`): a cascaded chorus, then a tremolo. Taps 1 and 2 read the mono line half a cycle apart.
 * Tap 1 with the left input feeds a second line, tap 2 with the right input a third, and taps 3 and 4 read those
 * (90 and 270 degrees). Left is 2 x tap 1 + tap 3, right 2 x tap 2 + tap 4, each through its tremolo (triangle,
 * the right one offset by the tremolo phase). The first taps count twice on the SC-88Pro too (its wet level agrees
 * within 0.4 dB, with them once it would be 5 dB lower).
 * The left chain runs one 32 kHz sample before the right one (the shared stage's timing).
 * Parameters: 1 pre delay, 2 chorus rate (Rate1 column), 3 chorus depth, 4 tremolo phase, 5 tremolo rate (Rate1
 * column), 6 tremolo depth, 16 balance, 17 low gain, 18 high gain, 20 level. EFX control source 1 modulates the
 * tremolo rate, source 2 the balance.
 * @internal
 */
export class GSTremoloChorus extends GSEffect {
    public readonly type = 0x01_41;
    protected readonly defaults = new Uint8Array([
        0x10, 0x08, 0x28, 0x28, 0x3c, 0x60, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x7f, 0x40, 0x40, 0x00, 0x7f
    ]);
    private readonly mix: MonoMix;
    private readonly chorusLFO: LFO;
    private readonly tremoloLFO: LFO;
    /**
     * Taps 1 (for the left chain) and 2.
     */
    private readonly line1: ModulatedDelay;
    /**
     * Tap 3.
     */
    private readonly line2: ModulatedDelay;
    /**
     * Tap 4.
     */
    private readonly line3: ModulatedDelay;
    private readonly output: StereoOutput;
    private tremoloOffset = 0;
    private depth = 0;
    private rest = 0;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory);
        this.mix = new MonoMix(sampleRate);
        this.chorusLFO = new LFO(sampleRate);
        this.tremoloLFO = new LFO(sampleRate);
        this.line1 = new ModulatedDelay(sampleRate, memory, 2, 100 + SWING_MS);
        this.line1.setPhase(1, 180);
        this.line2 = new ModulatedDelay(sampleRate, memory, 1, SWING_MS);
        this.line2.setDCBlocker(false);
        this.line2.setPhase(0, 90);
        this.line3 = new ModulatedDelay(sampleRate, memory, 1, SWING_MS);
        this.line3.setDCBlocker(false);
        this.line3.setPhase(0, 270);
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
        const { line1, line2, line3, depth, rest, output } = this;
        for (let i = 0; i < sampleCount; i++) {
            const l = inputLeft[i];
            const r = inputRight[i];
            const phase = this.chorusLFO.process();
            line1.process(this.mix.process(l, r) * LINE_INPUT, phase);
            const tap1 = line1.output[0];
            const tap2 = line1.output[1];
            line2.process(0.25 * (tap1 + l), phase);
            line3.process(0.25 * (tap2 + r), phase);
            const tremolo = this.tremoloLFO.process();
            let right = tremolo + this.tremoloOffset;
            if (right >= 1) right -= 2;
            const gainL = depth * Math.abs(tremolo) + rest;
            const gainR = depth * Math.abs(right) + rest;
            output.process(
                l,
                gainL * (2 * tap1 + line2.output[0]),
                r,
                gainR * (2 * tap2 + line3.output[0])
            );
            outputLeft[i] = output.left;
            outputRight[i] = output.right;
        }
    }

    protected clear() {
        this.mix.clear();
        this.chorusLFO.clear();
        this.tremoloLFO.clear();
        this.line1.clear();
        this.line2.clear();
        this.line3.clear();
        this.output.clear();
    }

    protected update() {
        const p = this.parameters;
        this.chorusLFO.setRate(rate1(p[1]));
        const pre = preDelay(p[0]);
        const depth = modulationDepth(p[2]);
        // The left chain's tap is one 32 kHz sample earlier
        this.line1.setPreDelay(0, pre - STEP_MS);
        this.line1.setPreDelay(1, pre);
        this.line1.setDepth(0, depth);
        this.line1.setDepth(1, depth);
        this.line2.setDepth(0, depth);
        this.line3.setDepth(0, depth);
        this.tremoloLFO.setRate(rate1(this.controlled(0, 4)));
        this.tremoloOffset = chorusPhase(p[3]) / 180;
        this.depth = levelGain(p[5]);
        this.rest = tremoloRest(this.depth);
        this.output.set(
            this.controlled(1, 15),
            p[16],
            p[17],
            levelGain(p[19]) * STAGE_GAIN
        );
    }
}
