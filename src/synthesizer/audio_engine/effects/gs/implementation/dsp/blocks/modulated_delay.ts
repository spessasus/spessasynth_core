import type { DelayMemory } from "./delay_memory";
import { Crossfade } from "./crossfade";
import type { DelayLine } from "./delay_line";
import { DC_BLOCKER_HZ, FirstOrderFilter } from "./first_order_filter";

/**
 * The step flanger's smoother after the held LFO: a one-pole of 3.2 ms (its pole per 32 kHz sample).
 */
const STEP_POLE = 8112 / 8192;

/**
 * The delay line of every chorus and flanger: the input plus the feedback through a DC blocker and a tone filter
 * into one line, read at several places that an LFO moves.
 *
 * Each read's delay is its pre delay plus its swing times the LFO curve. The curve is the triangle `t = |phase|`
 * (chorus) or `t^2` (flanger, which lingers near the pre delay). Each read has its own phase offset.
 * The feedback is read 0 one 32 kHz sample later, as on the hardware, where it is the previous sample's read.
 *
 * The hardware interpolates linearly between its 32 kHz samples, which cuts the highs of a moving read (-3.7 dB at
 * 12 kHz on average, measured on the SC-88Pro) but not of a still one. So the reads do the same: a mix of two
 * points one 32 kHz sample apart, each read band-limited from the line at the host rate.
 * @internal
 */
export class ModulatedDelay {
    /**
     * The reads of this sample.
     */
    public readonly output: Float64Array;
    /**
     * The tone filter in the loop (and the gain into the line), off by default.
     */
    public readonly tone: FirstOrderFilter;
    private readonly line: DelayLine;
    private readonly dcBlocker: FirstOrderFilter;
    /**
     * One 32 kHz sample in host samples.
     */
    private readonly step: number;
    private readonly stepSmoothing: number;
    /**
     * Each read's pre delay and swing in 32 kHz samples: the ones read, the ones set, and the ones read before them
     * while a change crossfades.
     */
    private readonly preDelays: Float64Array;
    private readonly swings: Float64Array;
    private readonly targetPreDelays: Float64Array;
    private readonly targetSwings: Float64Array;
    private readonly previousPreDelays: Float64Array;
    private readonly previousSwings: Float64Array;
    private readonly fade: Crossfade;
    private readonly offsets: Float64Array;
    /**
     * This sample's delay of each read in 32 kHz samples, and with the previous settings.
     */
    private readonly delays: Float64Array;
    private readonly previousDelays: Float64Array;
    /**
     * The smoothed triangle of each read.
     */
    private readonly smoothed: Float64Array;
    private smoothing = 1;
    private flanger = false;
    private feedback = 0;

    /**
     * @param sampleRate The sample rate.
     * @param memory The delay memory.
     * @param reads The number of reads.
     * @param maxDelay The longest delay of any read (pre delay plus swing), in ms.
     */
    public constructor(
        sampleRate: number,
        memory: DelayMemory,
        reads: number,
        maxDelay: number
    ) {
        this.step = sampleRate / 32_000;
        this.stepSmoothing = 1 - STEP_POLE ** (1 / this.step);
        // Two more 32 kHz samples for the feedback's points
        this.line = memory.line(
            Math.ceil((maxDelay * sampleRate) / 1000 + 2 * this.step)
        );
        this.dcBlocker = new FirstOrderFilter(sampleRate);
        this.dcBlocker.setHighPass(DC_BLOCKER_HZ);
        this.tone = new FirstOrderFilter(sampleRate);
        this.output = new Float64Array(reads);
        this.preDelays = new Float64Array(reads);
        this.swings = new Float64Array(reads);
        this.targetPreDelays = new Float64Array(reads);
        this.targetSwings = new Float64Array(reads);
        this.previousPreDelays = new Float64Array(reads);
        this.previousSwings = new Float64Array(reads);
        this.fade = new Crossfade(sampleRate);
        this.offsets = new Float64Array(reads);
        this.delays = new Float64Array(reads);
        this.previousDelays = new Float64Array(reads);
        this.smoothed = new Float64Array(reads);
    }

    /**
     * @param flanger The squared triangle instead of the triangle.
     */
    public setCurve(flanger: boolean) {
        this.flanger = flanger;
    }

    /**
     * @param on The DC blocker on the input, on by default (a cascaded line fed by another line's read has none).
     */
    public setDCBlocker(on: boolean) {
        if (on) this.dcBlocker.setHighPass(DC_BLOCKER_HZ);
        else this.dcBlocker.setOff();
    }

    /**
     * @param smooth Smooth the triangle of each read (the step flanger, whose LFO phase is held in steps).
     */
    public setStepSmoothing(smooth: boolean) {
        this.smoothing = smooth ? this.stepSmoothing : 1;
    }

    /**
     * @param read The read.
     * @param ms The delay at the bottom of the swing.
     */
    public setPreDelay(read: number, ms: number) {
        if (ms * 32 === this.targetPreDelays[read]) return;
        this.targetPreDelays[read] = ms * 32;
        this.fade.request();
    }

    /**
     * @param read The read.
     * @param ms The swing on top of the pre delay.
     */
    public setDepth(read: number, ms: number) {
        if (ms * 32 === this.targetSwings[read]) return;
        this.targetSwings[read] = ms * 32;
        this.fade.request();
    }

    /**
     * @param read The read.
     * @param degrees The LFO phase offset of the read.
     */
    public setPhase(read: number, degrees: number) {
        this.offsets[read] = degrees / 180;
    }

    /**
     * @param gain The feedback gain from read 0 (negative inverts).
     */
    public setFeedback(gain: number) {
        this.feedback = gain;
    }

    /**
     * @param x The input sample.
     * @param phase The LFO phase of this sample (-1 to 1).
     */
    public process(x: number, phase: number) {
        const { line, step, delays, previousDelays, smoothed, smoothing } =
            this;
        const { fade } = this;
        if (fade.tick()) {
            this.previousPreDelays.set(this.preDelays);
            this.previousSwings.set(this.swings);
            this.preDelays.set(this.targetPreDelays);
            this.swings.set(this.targetSwings);
        }
        for (let i = 0; i < delays.length; i++) {
            let p = phase + this.offsets[i];
            if (p >= 1) p -= 2;
            let t = (smoothed[i] += smoothing * (Math.abs(p) - smoothed[i]));
            if (this.flanger) t *= t;
            delays[i] = this.preDelays[i] + this.swings[i] * t;
            previousDelays[i] =
                this.previousPreDelays[i] + this.previousSwings[i] * t;
        }
        if (this.feedback !== 0) {
            // The feedback is read before the write, so one host sample less
            let y = line.readGrid(delays[0] + 1, step, 1);
            if (fade.active) {
                const old = line.readGrid(previousDelays[0] + 1, step, 1);
                y = old + fade.gain * (y - old);
            }
            x += this.feedback * y;
        }
        line.write(this.tone.process(this.dcBlocker.process(x)));
        const output = this.output;
        for (let i = 0; i < output.length; i++) {
            let y = line.readGrid(delays[i], step, 0);
            if (fade.active) {
                const old = line.readGrid(previousDelays[i], step, 0);
                y = old + fade.gain * (y - old);
            }
            output[i] = y;
        }
    }

    public clear() {
        this.line.clear();
        this.dcBlocker.clear();
        this.tone.clear();
        this.output.fill(0);
        this.smoothed.fill(0);
        this.fade.clear();
    }
}
