import { GSEffect } from "../gs_effect";
import { levelGain, LINE_INPUT, STAGE_GAIN } from "../glue";
import type { DelayMemory } from "../blocks/delay_memory";
import { Delay } from "../blocks/delay";
import { LFO } from "../blocks/lfo";
import { ModulatedDelay } from "../blocks/modulated_delay";
import { StereoOutput } from "../blocks/stereo_output";
import {
    chorusPhase,
    delay3,
    feedbackGain,
    hfDamp,
    modulationDepth,
    rate1,
    SWING_MS
} from "../conversion";

/**
 * The modulation swings four times as far as a chorus.
 */
const DEPTH_SCALE = 4;

/**
 * Mod Delay (`01 51`): Stereo Delay's lines (feedback normal or cross, HF damp in the loop), each damped tap written
 * into a modulation line that an LFO reads (the right one offset by the phase). True stereo, as on the SC-88Pro.
 * Parameters: 1 delay left, 2 delay right (Dly3 column), 3 feedback, 4 feedback mode (normal, cross), 5 rate (Rate1
 * column), 6 depth, 7 phase, 8 HF damp, 16 balance, 17 low gain, 18 high gain, 20 level. EFX control source 1
 * modulates the rate, source 2 the balance.
 * @internal
 */
export class GSModulationDelay extends GSEffect {
    public readonly type = 0x01_51;
    protected readonly defaults = new Uint8Array([
        0x5a, 0x6c, 0x58, 0x01, 0x0c, 0x15, 0x5a, 0x7f, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x28, 0x40, 0x40, 0x00, 0x7f
    ]);
    protected readonly limits = { 3: 1 };
    private readonly delayL: Delay;
    private readonly delayR: Delay;
    private readonly lfo: LFO;
    private readonly modulationL: ModulatedDelay;
    private readonly modulationR: ModulatedDelay;
    private readonly output: StereoOutput;
    private cross = false;
    private feedback = 0;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory);
        this.delayL = new Delay(sampleRate, memory, 1, 500);
        this.delayR = new Delay(sampleRate, memory, 1, 500);
        this.delayL.setDampTaps(true);
        this.delayR.setDampTaps(true);
        this.lfo = new LFO(sampleRate);
        this.modulationL = new ModulatedDelay(
            sampleRate,
            memory,
            1,
            DEPTH_SCALE * SWING_MS
        );
        this.modulationR = new ModulatedDelay(
            sampleRate,
            memory,
            1,
            DEPTH_SCALE * SWING_MS
        );
        this.modulationL.setDCBlocker(false);
        this.modulationR.setDCBlocker(false);
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
        const { delayL, delayR, modulationL, modulationR, feedback, output } =
            this;
        for (let i = 0; i < sampleCount; i++) {
            const l = inputLeft[i];
            const r = inputRight[i];
            if (this.cross) {
                // The left echo reaches the right line two 32 kHz samples later, as in Stereo Delay
                // The right echo reaches the left line in the same sample
                delayR.process(r * LINE_INPUT + delayL.feedback(2) * feedback);
                delayL.process(l * LINE_INPUT + delayR.output[0] * feedback);
            } else {
                delayL.process(l * LINE_INPUT + delayL.feedback() * feedback);
                delayR.process(r * LINE_INPUT + delayR.feedback() * feedback);
            }
            const phase = this.lfo.process();
            modulationL.process(delayL.output[0], phase);
            modulationR.process(delayR.output[0], phase);
            output.process(l, modulationL.output[0], r, modulationR.output[0]);
            outputLeft[i] = output.left;
            outputRight[i] = output.right;
        }
    }

    protected clear() {
        this.delayL.clear();
        this.delayR.clear();
        this.lfo.clear();
        this.modulationL.clear();
        this.modulationR.clear();
        this.output.clear();
    }

    protected update() {
        const p = this.parameters;
        this.delayL.setTap(0, delay3(p[0]));
        this.delayR.setTap(0, delay3(p[1]));
        this.feedback = feedbackGain(p[2]);
        this.cross = p[3] === 1;
        this.lfo.setRate(rate1(this.controlled(0, 4)));
        const depth = DEPTH_SCALE * modulationDepth(p[5]);
        this.modulationL.setDepth(0, depth);
        this.modulationR.setDepth(0, depth);
        this.modulationR.setPhase(0, chorusPhase(p[6]));
        this.delayL.setHFDamp(hfDamp(p[7]));
        this.delayR.setHFDamp(hfDamp(p[7]));
        this.output.set(
            this.controlled(1, 15),
            p[16],
            p[17],
            levelGain(p[19]) * STAGE_GAIN
        );
    }
}
