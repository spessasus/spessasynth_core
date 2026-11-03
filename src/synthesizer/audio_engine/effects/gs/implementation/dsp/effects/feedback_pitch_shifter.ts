import type { DelayMemory } from "../blocks/delay_memory";
import { panLeft, panRight } from "../glue";
import { feedbackGain, pitchRatio, pitchWindow, preDelay } from "../conversion";
import { GSPitchShifterEffect } from "./pitch_shifter_effect";

/**
 * Fb P.Shifter (`01 61`): one shifted voice whose output feeds back into its input (the 20 Hz DC blocker in the
 * loop), so the pitch steps up or down with every pass.
 * Parameters: 1 coarse, 2 fine, 3 feedback, 4 pre delay, 5 mode, 6 pan, 16 balance, 17 low gain, 18 high gain,
 * 20 level. EFX control source 1 modulates the coarse pitch, source 2 the feedback.
 * @internal
 */
export class GSFeedbackPitchShifter extends GSPitchShifterEffect {
    public readonly type = 0x01_61;
    protected readonly defaults = new Uint8Array([
        0x47, 0x40, 0x54, 0x5f, 0x02, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x40, 0x40, 0x3a, 0x00, 0x7f
    ]);
    // The coarse pitch is 40-76 (-24 to +12 semitones)
    protected readonly limits = { 0: 76, 4: 4 };
    protected readonly minimums = { 0: 40 };
    protected readonly fineParameters = [1];
    protected readonly inputGain = 127 / 128;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory, 1);
        this.reset();
    }

    protected update() {
        const p = this.parameters;
        const coarse = Math.max(40, Math.min(76, this.controlled(0, 0)));
        this.shifter.setVoice(0, pitchRatio(coarse, p[1]), pitchWindow(p[4]));
        this.shifter.setFeedback(feedbackGain(this.controlled(1, 2)));
        this.shifter.setPreDelay(0, preDelay(p[3]));
        this.gainsL[0] = panLeft(p[5]);
        this.gainsR[0] = panRight(p[5]);
        this.updateOutput();
    }
}
