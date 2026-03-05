import type { InsertionProcessor } from "../types";
import { InsertionValueConverter } from "./convert";
import {
    applyShelves,
    type BiquadCoeffs,
    type BiquadState,
    computeShelfCoeffs,
    zeroCoeffs,
    zeroState
} from "./utils";

/*
After lots of testing, this was the closest I've been able to get.
SC-Va shows a very strange logarithmic curve after 1000 Hz (55 manual), which I wasn't able to replicate, no matter how hard I tried.
Values below that are pretty much spot on though.
 */
const ALL_PASS_STAGES = 8;
const DEPTH_DIV = 128;
const MANUAL_MULTIPLIER = 4;
const MANUAL_OFFSET = 600;
const FEEDBACK = 0.9;

const PHASE_START = 0.35;
/**
 * A phaser adds a phase-shifted sound to the original sound,
 * producing a twisting modulation that creates spaciousness
 * and depth.
 * Type: Stereo
 *
 * Note: seems to use a triangle LFO for modulation
 */
export class PhaserFX implements InsertionProcessor {
    public sendLevelToReverb = 40 / 127;
    public sendLevelToChorus = 0;
    public sendLevelToDelay = 0;
    public readonly type = 0x01_20;

    /**
     * Adjusts the basic frequency from which the sound will be
     * modulated.
     * [100;8000]
     * @private
     */
    private manual = 620;

    /**
     * Adjusts the frequency (period) of modulation.
     * @private
     * [0.05;10.0]
     */
    private rate = 0.85;

    /**
     * Adjusts the depth of modulation.
     * [0;1]
     * @private
     */
    private depth = 64 / DEPTH_DIV;

    /**
     * Adjusts the amount of emphasis added to the frequency
     * range surrounding the basic frequency determined by the
     * Manual parameter setting.
     * [0;1]
     * @private
     */
    private reso = 16 / 127;

    /**
     * Adjusts the proportion by which the phase-shifted sound is
     * combined with the direct sound.
     * [0;1]
     * @private
     */
    private mix = 1;

    /**
     * Adjusts the gain of the low frequency range. (200Hz)
     * [-12;12]
     * @private
     */
    private lowGain = 0;

    /**
     * Adjusts the gain of the high frequency range. (4kHz)
     * [-12;12]
     * @private
     */
    private hiGain = 0;

    // Allpass network
    // Per-channel state for the allpass filters
    private readonly prevInL: Float32Array;
    private readonly prevOutL: Float32Array;
    private readonly prevInR: Float32Array;
    private readonly prevOutR: Float32Array;

    // Biquad shelving coefficients and states (per channel)
    private readonly lowShelfCoef: BiquadCoeffs = { ...zeroCoeffs };
    private readonly highShelfCoef: BiquadCoeffs = { ...zeroCoeffs };

    private manualOffset = MANUAL_OFFSET;
    private lowShelfStateL: BiquadState = { x1: 0, x2: 0, y1: 0, y2: 0 };
    private lowShelfStateR: BiquadState = { x1: 0, x2: 0, y1: 0, y2: 0 };
    private highShelfStateL: BiquadState = { x1: 0, x2: 0, y1: 0, y2: 0 };
    private highShelfStateR: BiquadState = { x1: 0, x2: 0, y1: 0, y2: 0 };
    private prevL = 0;
    private prevR = 0;
    /**
     * Adjusts the output level.
     * [0;1]
     * @private
     */
    private level = 104 / 127;
    private phase = PHASE_START;
    private readonly sampleRate;

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.prevInL = new Float32Array(ALL_PASS_STAGES);
        this.prevOutL = new Float32Array(ALL_PASS_STAGES);
        this.prevInR = new Float32Array(ALL_PASS_STAGES);
        this.prevOutR = new Float32Array(ALL_PASS_STAGES);
        this.reset();
    }

    public reset() {
        this.phase = PHASE_START;
        this.setManual(620);
        this.rate = 0.85;
        this.depth = 64 / DEPTH_DIV;
        this.reso = 16 / 127;
        this.mix = 1;
        this.lowGain = 0;
        this.hiGain = 0;
        this.level = 104 / 127;
        zeroState(this.highShelfStateL);
        zeroState(this.highShelfStateR);
        zeroState(this.lowShelfStateL);
        zeroState(this.lowShelfStateR);
        this.updateShelves();
        this.clearAllPass();
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        outputReverb: Float32Array,
        outputChorus: Float32Array,
        outputDelay: Float32Array,
        startIndex: number,
        sampleCount: number
    ) {
        const {
            sendLevelToReverb,
            sendLevelToChorus,
            sendLevelToDelay,
            level,
            manual,
            manualOffset,
            mix,
            lowShelfCoef,
            lowShelfStateR,
            lowShelfStateL,
            highShelfCoef,
            highShelfStateL,
            highShelfStateR,
            prevInL,
            prevInR,
            prevOutL,
            prevOutR,
            sampleRate,
            depth
        } = this;
        let { prevL, prevR, phase } = this;
        const rateInc = this.rate / this.sampleRate;
        const fb = this.reso * FEEDBACK;
        for (let i = 0; i < sampleCount; i++) {
            // Apply EQ to input (EQ is applied regardless of mix)
            const sL = applyShelves(
                inputLeft[i],
                lowShelfCoef,
                highShelfCoef,
                lowShelfStateL,
                highShelfStateL
            );
            const sR = applyShelves(
                inputRight[i],
                lowShelfCoef,
                highShelfCoef,
                lowShelfStateR,
                highShelfStateR
            );

            // Triangle LFO
            const lfo = 2 * Math.abs(phase - 0.5);
            if ((phase += rateInc) >= 1) phase -= 1;
            const lfoMul = 1 - depth * lfo;

            // Instantaneous modulated frequency (Hz), depth is fraction
            const fc = manualOffset + manual * lfoMul;

            // Convert to all-pass coefficient 'a' for first-order AP
            const tanTerm = Math.tan((Math.PI * fc) / sampleRate);
            const a = Math.max(
                -0.9999,
                Math.min(0.9999, (1 - tanTerm) / (1 + tanTerm))
            );

            // Process all pass
            let apL = sL + fb * prevL;
            let apR = sR + fb * prevR;
            for (let stage = 0; stage < ALL_PASS_STAGES; stage++) {
                const outL = -a * apL + prevInL[stage] + a * prevOutL[stage];
                prevInL[stage] = apL;
                prevOutL[stage] = outL;
                apL = outL; // Feed to next stage
                const outR = -a * apR + prevInR[stage] + a * prevOutR[stage];
                prevInR[stage] = apR;
                prevOutR[stage] = outR;
                apR = outR;
            }
            prevL = apL;
            prevR = apR;

            const outL = (sL + apL * mix) * level;
            const outR = (sR + apR * mix) * level;

            // Mix
            const idx = startIndex + i;
            outputLeft[idx] += outL;
            outputRight[idx] += outR;
            const mono = (outL + outR) * 0.5;
            outputReverb[i] += mono * sendLevelToReverb;
            outputChorus[i] += mono * sendLevelToChorus;
            outputDelay[i] += mono * sendLevelToDelay;
        }
        this.phase = phase;
        this.prevL = prevL;
        this.prevR = prevR;
    }

    public setParameter(parameter: number, value: number) {
        switch (parameter) {
            default: {
                break;
            }

            case 0x03: {
                this.setManual(InsertionValueConverter.manual(value));
                break;
            }

            case 0x04: {
                this.rate = InsertionValueConverter.rate1(value);
                break;
            }

            case 0x05: {
                this.depth = value / DEPTH_DIV;
                break;
            }

            case 0x06: {
                this.reso = value / 127;
                break;
            }

            case 0x07: {
                this.mix = value / 127;
                break;
            }

            case 0x13: {
                this.lowGain = value - 64;
                break;
            }

            case 0x14: {
                this.hiGain = value - 64;
                break;
            }

            case 0x16: {
                this.level = value / 127;
                break;
            }
        }
        this.updateShelves();
    }

    private setManual(manualIn: number) {
        if (manualIn > 1000) {
            this.manualOffset = MANUAL_OFFSET * 1.5 * MANUAL_MULTIPLIER;
            this.manual = manualIn;
        } else {
            this.manualOffset = MANUAL_OFFSET;
            this.manual = manualIn * MANUAL_MULTIPLIER;
        }
    }

    private clearAllPass() {
        this.prevR = 0;
        this.prevL = 0;
        for (let i = 0; i < ALL_PASS_STAGES; i++) {
            this.prevInL[i] = 0;
            this.prevOutL[i] = 0;
            this.prevInR[i] = 0;
            this.prevOutR[i] = 0;
        }
    }

    private updateShelves() {
        computeShelfCoeffs(
            this.lowShelfCoef,
            this.lowGain,
            200,
            this.sampleRate,
            true
        );
        computeShelfCoeffs(
            this.highShelfCoef,
            this.hiGain,
            4000,
            this.sampleRate,
            false
        );
    }
}
