import type { DelayMemory } from "./delay_memory";
import type { DelayLine } from "./delay_line";
import { DC_BLOCKER_HZ, FirstOrderFilter } from "./first_order_filter";
import { Crossfade } from "./crossfade";

/**
 * The line of the delays: the input (with the feedback the effect adds to it) through a DC blocker into one line,
 * read at several taps. One tap feeds back through the HF damp.
 *
 * On the hardware the feedback is the damped tap of the previous sample. Here it is the tap read one 32 kHz sample
 * further back through its own copy of the damp, which is the same signal at every rate.
 * The taps the columns give are whole 32 kHz samples. A tap between them (Time Ctrl Delay's slewing one) mixes the
 * two neighbors linearly like the hardware, each read band-limited at the host rate. A tap change crossfades
 * (`Crossfade`) unless `setCrossfade` turned it off.
 * @internal
 */
export class Delay {
    /**
     * The reads of this sample, through the damp when `setDampTaps` is on.
     */
    public readonly output: Float64Array;
    private readonly line: DelayLine;
    private readonly dcBlocker: FirstOrderFilter;
    private readonly dampTaps: FirstOrderFilter[];
    private readonly dampFeedback: FirstOrderFilter;
    /**
     * One 32 kHz sample in host samples.
     */
    private readonly step: number;
    /**
     * The taps in 32 kHz samples: the ones read, the ones set, and the ones read before them while fading.
     */
    private readonly taps: Float64Array;
    private readonly targets: Float64Array;
    private readonly previous: Float64Array;
    private readonly fade: Crossfade;
    private fading = true;
    private feedbackTap = 0;
    private damped = false;

    /**
     * @param sampleRate The sample rate.
     * @param memory The delay memory.
     * @param taps The number of taps.
     * @param maxDelay The longest tap in ms.
     */
    public constructor(
        sampleRate: number,
        memory: DelayMemory,
        taps: number,
        maxDelay: number
    ) {
        this.step = sampleRate / 32_000;
        this.line = memory.line(
            Math.ceil((maxDelay * sampleRate) / 1000 + 3 * this.step)
        );
        this.dcBlocker = new FirstOrderFilter(sampleRate);
        this.dcBlocker.setHighPass(DC_BLOCKER_HZ);
        this.dampTaps = new Array<FirstOrderFilter>();
        for (let i = 0; i < taps; i++) {
            this.dampTaps.push(new FirstOrderFilter(sampleRate));
        }
        this.dampFeedback = new FirstOrderFilter(sampleRate);
        this.output = new Float64Array(taps);
        this.taps = new Float64Array(taps);
        this.targets = new Float64Array(taps);
        this.previous = new Float64Array(taps);
        this.fade = new Crossfade(sampleRate);
    }

    /**
     * @param tap The tap.
     * @param ms Its delay.
     */
    public setTap(tap: number, ms: number) {
        const samples = ms * 32;
        if (!this.fading) {
            this.taps[tap] = this.targets[tap] = samples;
        } else if (samples !== this.targets[tap]) {
            this.targets[tap] = samples;
            this.fade.request();
        }
    }

    /**
     * @param on Crossfade tap changes (on by default). Off for a tap that slews by itself.
     */
    public setCrossfade(on: boolean) {
        this.fading = on;
    }

    /**
     * @param tap The tap that feeds back through the damp (tap 0 if never set).
     */
    public setFeedbackTap(tap: number) {
        this.feedbackTap = tap;
    }

    /**
     * @param on Damp every output tap (a single tap delay's echo is the damped one), not only the feedback.
     */
    public setDampTaps(on: boolean) {
        this.damped = on;
    }

    /**
     * @param frequency The HF damp corner in Hz, infinite for Bypass.
     */
    public setHFDamp(frequency: number) {
        for (const damp of this.dampTaps) {
            if (frequency === Infinity) damp.setOff();
            else damp.setDamp(frequency);
        }
        if (frequency === Infinity) this.dampFeedback.setOff();
        else this.dampFeedback.setDamp(frequency);
    }

    /**
     * The damped feedback tap some 32 kHz samples ago. Call it once per sample, before `process`.
     * @param samples How many 32 kHz samples back (the hardware's loop takes one).
     */
    public feedback(samples = 1) {
        // Before the write, so one host sample less
        const { fade, line, step } = this;
        let y = line.readGrid(this.taps[this.feedbackTap] + samples, step, 1);
        if (fade.active) {
            const old = line.readGrid(
                this.previous[this.feedbackTap] + samples,
                step,
                1
            );
            y = old + fade.gain * (y - old);
        }
        return this.dampFeedback.process(y);
    }

    /**
     * @param x The input sample, the feedback included.
     */
    public process(x: number) {
        const { taps, output, fade, line, step } = this;
        if (fade.tick()) {
            this.previous.set(taps);
            taps.set(this.targets);
        }
        line.write(this.dcBlocker.process(x));
        for (let i = 0; i < output.length; i++) {
            let y = line.readGrid(taps[i], step, 0);
            if (fade.active) {
                const old = line.readGrid(this.previous[i], step, 0);
                y = old + fade.gain * (y - old);
            }
            output[i] = this.damped ? this.dampTaps[i].process(y) : y;
        }
    }

    public clear() {
        this.line.clear();
        this.dcBlocker.clear();
        for (const damp of this.dampTaps) damp.clear();
        this.dampFeedback.clear();
        this.fade.clear();
        this.output.fill(0);
    }
}
