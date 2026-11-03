import { GSEffect } from "../gs_effect";
import { levelGain, LINE_INPUT, STAGE_GAIN } from "../glue";
import type { DelayMemory } from "../blocks/delay_memory";
import { LFO } from "../blocks/lfo";
import { ModulatedDelay } from "../blocks/modulated_delay";
import { StereoOutput } from "../blocks/stereo_output";
import { SWING_MS } from "../conversion";

/**
 * The longest read in ms: the 100 ms pre delay and the swing, with a ms to spare (Space D's right line reads up to
 * half a ms later).
 */
const LONGEST_MS = 101 + SWING_MS;

/**
 * The stereo choruses and flangers: per channel a modulated delay on its own line, one LFO for both (the right
 * read offset by the phase), then the balance and the 2-band EQ.
 * @internal
 */
export abstract class GSStereoModulatedDelay extends GSEffect {
    protected readonly lfo: LFO;
    protected readonly delayL: ModulatedDelay;
    protected readonly delayR: ModulatedDelay;
    /**
     * Both lines, for the settings they share.
     */
    protected readonly delays: readonly ModulatedDelay[];
    protected readonly output: StereoOutput;

    /**
     * @param sampleRate The sample rate.
     * @param memory The delay memory.
     * @param reads The reads on each line.
     */
    protected constructor(sampleRate: number, memory: DelayMemory, reads = 1) {
        super(sampleRate, memory);
        this.lfo = new LFO(sampleRate);
        this.delayL = new ModulatedDelay(sampleRate, memory, reads, LONGEST_MS);
        this.delayR = new ModulatedDelay(sampleRate, memory, reads, LONGEST_MS);
        this.delays = [this.delayL, this.delayR];
        this.output = new StereoOutput(sampleRate);
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const { delayL, delayR, output } = this;
        for (let i = 0; i < sampleCount; i++) {
            const phase = this.nextPhase();
            const l = inputLeft[i];
            const r = inputRight[i];
            delayL.process(l * LINE_INPUT, phase);
            delayR.process(r * LINE_INPUT, phase);
            output.process(l, delayL.output[0], r, delayR.output[0]);
            outputLeft[i] = output.left;
            outputRight[i] = output.right;
        }
    }

    protected clear() {
        this.lfo.clear();
        this.delayL.clear();
        this.delayR.clear();
        this.output.clear();
    }

    /**
     * The LFO phase of this sample (the step flanger holds it).
     */
    protected nextPhase() {
        return this.lfo.process();
    }

    /**
     * @param balance The balance parameter.
     * @param low The low gain parameter.
     * @param high The high gain parameter.
     * @param level The level parameter.
     */
    protected setOutput(
        balance: number,
        low: number,
        high: number,
        level: number
    ) {
        this.output.set(balance, low, high, levelGain(level) * STAGE_GAIN);
    }
}
