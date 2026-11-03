import {
    chorusPhase,
    cutoff,
    feedbackGain,
    modulationDepth,
    preDelay,
    rate1
} from "../conversion";
import { GSStereoModulatedDelay } from "./stereo_modulated_delay";

/**
 * The line write's gain, inside the loop.
 */
const LINE_GAIN = 127 / 128;

/**
 * St. Chorus and St. Flanger: per channel `tone filter -> modulated delay`, then the balance and the 2-band EQ.
 * Parameters: 1 filter type (off, LPF, HPF), 2 cutoff (Cut column), 3 pre delay, 4 rate (Rate1 column), 5 depth,
 * 6 feedback (flanger), 7 phase, 16 balance, 17 low gain, 18 high gain, 20 level. EFX control source 1 modulates the
 * rate, source 2 the balance (chorus) or the feedback (flanger).
 * @internal
 */
export abstract class GSStereoChorusFlanger extends GSStereoModulatedDelay {
    protected readonly limits = { 0: 2 };
    protected abstract readonly flanger: boolean;

    protected update() {
        const p = this.parameters;
        this.lfo.setRate(rate1(this.controlled(0, 3)));
        const feedback = this.flanger ? feedbackGain(this.controlled(1, 5)) : 0;
        for (const delay of this.delays) {
            delay.setCurve(this.flanger);
            delay.setPreDelay(0, preDelay(p[2]));
            delay.setDepth(0, modulationDepth(p[4]));
            delay.setFeedback(feedback);
            // Off is one more 127/128
            if (p[0] === 0) delay.tone.setGain(LINE_GAIN * (127 / 128));
            else delay.tone.setTone(p[0] === 2, cutoff(p[1]), LINE_GAIN);
        }
        this.delayR.setPhase(0, chorusPhase(p[6]));
        this.setOutput(
            this.flanger ? p[15] : this.controlled(1, 15),
            p[16],
            p[17],
            p[19]
        );
    }
}
