import type { DelayMemory } from "./delay_memory";
import { Crossfade } from "./crossfade";
import type { DelayLine } from "./delay_line";
import { DC_BLOCKER_HZ, FirstOrderFilter } from "./first_order_filter";

/**
 * The longest window (mode 4) in ms.
 */
const MAX_WINDOW_MS = 256;

/**
 * The pitch shifters: one line, one or more voices. Each voice is a ramp through a window: two reads half a window
 * apart move at `1 - ratio` samples per sample (down for a higher pitch) and jump back by a window at its end.
 * Each read's gain is a triangle of its window position (0 where it jumps), so the two crossfade linearly.
 * Every voice has a second pair of reads one 32 kHz sample earlier, for an output that runs ahead of the line (the
 * shared stage's left output of the mono types). Voice 0 can feed back.
 * @internal
 */
export class PitchShifter {
    /**
     * Each voice's output this sample, at the line's timing.
     */
    public readonly output: Float64Array;
    /**
     * Each voice's output one 32 kHz sample ahead.
     */
    public readonly early: Float64Array;
    private readonly line: DelayLine;
    private readonly dcBlocker: FirstOrderFilter;
    /**
     * One 32 kHz sample in host samples.
     */
    private readonly step: number;
    /**
     * Per voice: the window position (0-1) of its first read, its step per host sample, the window and the pre delay
     * in 32 kHz samples.
     */
    private readonly phases: Float64Array;
    private readonly increments: Float64Array;
    private readonly windows: Float64Array;
    /**
     * The pre delays in 32 kHz samples: the ones read, the ones set, and the ones read before them while a change
     * crossfades.
     */
    private readonly preDelays: Float64Array;
    private readonly targetPreDelays: Float64Array;
    private readonly previousPreDelays: Float64Array;
    private readonly fade: Crossfade;
    private feedback = 0;

    /**
     * @param sampleRate The sample rate.
     * @param memory The delay memory.
     * @param voices The number of voices.
     */
    public constructor(
        sampleRate: number,
        memory: DelayMemory,
        voices: number
    ) {
        this.step = sampleRate / 32_000;
        // 100 ms of pre delay plus the window, read past 256 ms too (SC-VA wraps there)
        this.line = memory.line(
            Math.ceil(
                ((100 + MAX_WINDOW_MS) * sampleRate) / 1000 + 3 * this.step
            )
        );
        this.dcBlocker = new FirstOrderFilter(sampleRate);
        this.dcBlocker.setHighPass(DC_BLOCKER_HZ);
        this.output = new Float64Array(voices);
        this.early = new Float64Array(voices);
        this.phases = new Float64Array(voices);
        this.increments = new Float64Array(voices);
        this.windows = new Float64Array(voices);
        this.preDelays = new Float64Array(voices);
        this.targetPreDelays = new Float64Array(voices);
        this.previousPreDelays = new Float64Array(voices);
        this.fade = new Crossfade(sampleRate);
    }

    /**
     * @param voice The voice.
     * @param ratio The pitch ratio (2 is an octave up).
     * @param window The window in ms (64 to 256 by mode).
     */
    public setVoice(voice: number, ratio: number, window: number) {
        this.windows[voice] = window * 32;
        this.increments[voice] = (1 - ratio) / (window * 32 * this.step);
    }

    /**
     * @param voice The voice.
     * @param ms The pre delay.
     */
    public setPreDelay(voice: number, ms: number) {
        if (ms * 32 === this.targetPreDelays[voice]) return;
        this.targetPreDelays[voice] = ms * 32;
        this.fade.request();
    }

    /**
     * @param gain The feedback gain of voice 0 (its output one 32 kHz sample ago back into the input).
     */
    public setFeedback(gain: number) {
        this.feedback = gain;
    }

    /**
     * @param x The input sample.
     */
    public process(x: number) {
        const { line, step, phases, increments } = this;
        if (this.fade.tick()) {
            this.previousPreDelays.set(this.preDelays);
            this.preDelays.set(this.targetPreDelays);
        }
        for (let v = 0; v < phases.length; v++) {
            let phase = phases[v] + increments[v];
            phase -= Math.floor(phase);
            phases[v] = phase;
        }
        if (this.feedback !== 0) {
            // The output of one 32 kHz sample ago, at the window position then
            // It is read before the write, so one host sample less, and the loop runs in the line's own time
            let phase = phases[0] - increments[0] * step;
            phase -= Math.floor(phase);
            x += this.feedback * this.read(0, phase, 1, 1);
        }
        line.write(this.dcBlocker.process(x));
        for (let v = 0; v < phases.length; v++) {
            this.output[v] = this.read(v, phases[v], 0, 0);
            // The output of one 32 kHz sample later, so the window position then too
            let ahead = phases[v] + increments[v] * step;
            ahead -= Math.floor(ahead);
            this.early[v] = this.read(v, ahead, -1, 0);
        }
    }

    public clear() {
        this.line.clear();
        this.dcBlocker.clear();
        // Both reads start mid-way, the first at the top of its triangle
        this.phases.fill(0.5);
        this.output.fill(0);
        this.early.fill(0);
        this.fade.clear();
    }

    /**
     * A voice's reads, crossfaded from the previous pre delay while it changes.
     * @param v The voice.
     * @param phase The first read's window position.
     * @param shift 32 kHz samples added to the pre delay.
     * @param offset Host samples taken off the reads.
     */
    private read(v: number, phase: number, shift: number, offset: number) {
        const window = this.windows[v];
        const y = this.voice(phase, window, this.preDelays[v] + shift, offset);
        if (!this.fade.active) return y;
        const old = this.voice(
            phase,
            window,
            this.previousPreDelays[v] + shift,
            offset
        );
        return old + this.fade.gain * (y - old);
    }

    /**
     * The crossfaded reads of a voice.
     * @param phase The first read's window position.
     * @param window The window in 32 kHz samples.
     * @param preDelay The pre delay in 32 kHz samples.
     * @param offset Host samples taken off the reads.
     */
    private voice(
        phase: number,
        window: number,
        preDelay: number,
        offset: number
    ) {
        const other = phase < 0.5 ? phase + 0.5 : phase - 0.5;
        const gain = 1 - Math.abs(2 * phase - 1);
        const line = this.line;
        return (
            gain * line.readGrid(preDelay + window * phase, this.step, offset) +
            (1 - gain) *
                line.readGrid(preDelay + window * other, this.step, offset)
        );
    }
}
