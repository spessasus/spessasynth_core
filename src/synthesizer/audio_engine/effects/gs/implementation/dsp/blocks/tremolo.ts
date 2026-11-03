import { LFO, parabolicSine } from "./lfo";
import { TremoloWaves } from "../enums";

/**
 * The corner of the smoother after the wave (it rounds the edges of the square and the saws, about 3 ms).
 */
const SMOOTHER_HZ = 50;

/**
 * The unmodulated part of a tremolo gain: (127 - 128 depth) / 2 rounded down, over 64. So the peak sits just under
 * 1 and the deepest setting closes fully.
 * @param depth The modulated part, 0 to 127/128.
 * @internal
 */
export function tremoloRest(depth: number) {
    return Math.floor((127 - Math.round(128 * depth)) / 2) / 64;
}

/**
 * Tremolo and auto pan: an LFO that moves the gain of both channels, in phase (tremolo) or against each other
 * (auto pan, a linear crossfade). Call `process` once per sample, then read `left` and `right`.
 * @internal
 */
export class Tremolo {
    /**
     * The gains of this sample.
     */
    public left = 1;
    public right = 1;
    private readonly lfo: LFO;
    private readonly smoothing: number;
    private pan = false;
    private wave = 0;
    private depth = 0;
    /**
     * The unmodulated part of the gain.
     */
    private rest = 1;
    private smoothed = 0;

    public constructor(sampleRate: number) {
        this.lfo = new LFO(sampleRate);
        this.smoothing =
            1 - Math.exp((-2 * Math.PI * SMOOTHER_HZ) / sampleRate);
    }

    /**
     * @param pan True for auto pan.
     */
    public setPan(pan: boolean) {
        this.pan = pan;
    }

    /**
     * @param wave The wave (`TremoloWaves`).
     */
    public setWave(wave: number) {
        this.wave = wave;
    }

    /**
     * @param hz The LFO rate.
     */
    public setRate(hz: number) {
        this.lfo.setRate(hz);
    }

    /**
     * @param depth The modulated part of the gain, 0 (none) to 127/128 (down to silence).
     */
    public setDepth(depth: number) {
        this.depth = depth;
        this.rest = tremoloRest(depth);
    }

    public process() {
        const phase = this.lfo.process();
        let w: number;
        switch (this.wave) {
            case TremoloWaves.triangle: {
                w = 2 * Math.abs(phase) - 1;
                break;
            }
            case TremoloWaves.square: {
                w = phase >= 0 ? 1 : -1;
                break;
            }
            case TremoloWaves.sine: {
                w = parabolicSine(phase);
                break;
            }
            case TremoloWaves.sawUp: {
                w = phase;
                break;
            }
            default: {
                w = -phase;
            }
        }
        this.smoothed += this.smoothing * (w - this.smoothed);
        const up = 0.5 + 0.5 * this.smoothed;
        this.left = this.depth * up + this.rest;
        this.right = this.pan ? this.depth * (1 - up) + this.rest : this.left;
    }

    public clear() {
        this.lfo.clear();
        this.smoothed = 0;
    }
}
