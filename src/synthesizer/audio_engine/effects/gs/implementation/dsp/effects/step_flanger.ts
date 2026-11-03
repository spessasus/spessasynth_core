import type { DelayMemory } from "../blocks/delay_memory";
import {
    chorusPhase,
    feedbackGain,
    modulationDepth,
    preDelay,
    rate1
} from "../conversion";
import { GSStereoModulatedDelay } from "./stereo_modulated_delay";

/**
 * Step Flanger (`01 24`): St. Flanger without the tone filter, whose LFO phase is held in steps (twice per cycle of
 * the step rate) and smoothed.
 * Parameters: 1 pre delay, 2 rate (Rate1 column), 3 depth, 4 feedback, 5 phase, 6 step rate (Rate1 column),
 * 16 balance, 17 low gain, 18 high gain, 20 level. EFX control source 1 modulates the feedback, source 2 the step
 * rate.
 * @internal
 */
export class GSStepFlanger extends GSStereoModulatedDelay {
    public readonly type = 0x01_24;
    protected readonly defaults = new Uint8Array([
        0x0a, 0x05, 0x5f, 0x4f, 0x5a, 0x36, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x40, 0x40, 0x40, 0x00, 0x60
    ]);

    /**
     * The step clock: it climbs from -1 and takes a new LFO phase at 0.
     */
    private stepIncrement = 0;
    private stepClock = 0;
    private heldPhase = 0;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory);
        this.delayL.setCurve(true);
        this.delayR.setCurve(true);
        this.delayL.setStepSmoothing(true);
        this.delayR.setStepSmoothing(true);
        this.reset();
    }

    protected clear() {
        super.clear();
        this.stepClock = 0;
        this.heldPhase = 0;
    }

    /**
     * Holds the LFO phase twice per cycle of the step rate.
     */
    protected nextPhase() {
        const phase = this.lfo.process();
        this.stepClock += this.stepIncrement;
        if (this.stepClock >= 0) {
            this.heldPhase = phase;
            this.stepClock = -1;
        }
        return this.heldPhase;
    }

    protected update() {
        const p = this.parameters;
        this.lfo.setRate(rate1(p[1]));
        this.stepIncrement =
            (2 * rate1(this.controlled(1, 5))) / this.sampleRate;
        const feedback = feedbackGain(this.controlled(0, 3));
        for (const delay of this.delays) {
            delay.setPreDelay(0, preDelay(p[0]));
            delay.setDepth(0, modulationDepth(p[2]));
            delay.setFeedback(feedback);
        }
        this.delayR.setPhase(0, chorusPhase(p[4]));
        this.setOutput(p[15], p[16], p[17], p[19]);
    }
}
