import type { InsertionProcessor } from "../types";
import {
    applyShelves,
    type BiquadCoeffs,
    type BiquadState,
    computeShelfCoeffs,
    panTableLeft,
    panTableRight,
    processBiquad,
    zeroCoeffs,
    zeroState,
    zeroStateC
} from "./utils";
import { InsertionValueConverter } from "./convert";

const DEFAULT_LEVEL = 96;

/*
The Auto Wah cyclically controls a filter to create cyclic
change in timbre.

Type: Mono
 */

// Envelope follower
const attackTime = 0.1;
const releaseTime = 0.1;

const SENS_COEFF = 27;
const PEAK_DB = 28;
const HPF_Q = -28;
const HPF_FC = 400;
const MANUAL_SCALE = 0.62;
const FC_SMOOTH = 0.005;
const DEPTH_MUL = 5;
const LFO_SMOOTH_FRAC = DEPTH_MUL * 0.5;

export class AutoWahFX implements InsertionProcessor {
    public sendLevelToReverb = 40 / 127;
    public sendLevelToChorus = 0;
    public sendLevelToDelay = 0;
    public readonly type = 0x01_21;
    /**
     * Selects the type of filter.
     * LPF: The wah effect will be applied over a wide
     * frequency range.
     * BPF: The wah effect will be applied over a narrow
     * frequency range.
     * 0 - LPF
     * 1 - BPF
     * @private
     */
    private filType = 1;
    /**
     * Adjusts the sensitivity with which the filter is controlled. If
     * this value is increased, the filter frequency will change more
     * readily in response to the input level.
     * [0;127]
     * @private
     */
    private sens = 0;
    /**
     * Adjusts the center frequency from which the effect is
     * applied.
     *
     * Note: Doesn't use "Manual" conversion??
     * [0;127] (assuming manual though, seems to use a part of the curve)
     * @private
     */
    private manual = 68;
    /**
     * Adjusts the amount of the wah effect that will occur in the
     * area of the center frequency. Lower settings will cause the
     * effect to be applied in a broad area around the center
     * frequency. Higher settings will cause the effect to be
     * applied in a more narrow range. In the case of LPF,
     * decreasing the value will cause the wah effect to change
     * less.
     * [0;127]
     * @private
     */
    private peak = 62;
    /**
     * Adjusts the speed of the modulation.
     * [Rate1 conversion]
     * @private
     */
    private rate = 2.05;
    /**
     * Adjusts the depth of the modulation.
     * [0;127]
     * @private
     */
    private depth = 72;
    /**
     * Sets the direction in which the frequency will change when
     * the filter is modulated. With a setting of Up, the filter will
     * change toward a higher frequency. With a setting of Down
     * it will change toward a lower frequency.
     * 0 - down
     * 1 - up
     * @private
     */
    private polarity = 1;
    /**
     * Adjusts the stereo location of the output sound. L63 is far
     * left, 0 is center, and R63 is far right.
     * [-64;63]
     * @private
     */
    private pan = 0;
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
    /**
     * Adjusts the output level.
     * [0;1]
     * @private
     */
    private level = DEFAULT_LEVEL / 127;
    private readonly coeffs: BiquadCoeffs = { ...zeroCoeffs };
    private readonly state: BiquadState = { ...zeroStateC };
    private readonly hpCoeffs: BiquadCoeffs = { ...zeroCoeffs };
    private readonly hpState: BiquadState = { ...zeroStateC };
    private phase = 0;

    // Biquad shelving coefficients and states (per channel)
    private readonly lsCoeffs: BiquadCoeffs = { ...zeroCoeffs };
    private readonly hsCoeffs: BiquadCoeffs = { ...zeroCoeffs };

    // Low shelf
    private lsState: BiquadState = { ...zeroStateC };
    // High shelf
    private hsState: BiquadState = { ...zeroStateC };
    private readonly sampleRate;
    private lastFc = this.manual;
    private readonly attackCoeff;
    private readonly releaseCoeff;
    private envelope = 0;

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;

        this.attackCoeff = Math.exp(-1 / (attackTime * sampleRate));
        this.releaseCoeff = Math.exp(-1 / (releaseTime * sampleRate));

        this.reset();
    }

    public reset() {
        this.filType = 1;
        this.sens = 0;
        this.setManual(68);
        this.peak = 62;
        this.rate = 2.05;
        this.depth = 72;
        this.polarity = 1;
        this.lowGain = 0;
        this.hiGain = 0;
        this.pan = 0;
        this.level = DEFAULT_LEVEL / 127;
        this.phase = 0.2;
        this.lastFc = this.manual;
        zeroState(this.hsState);
        zeroState(this.lsState);
        zeroState(this.state);
        zeroState(this.hpState);
        this.updateShelves();
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
            lsCoeffs,
            lsState,
            hsCoeffs,
            hsState,
            coeffs,
            state,
            sampleRate,
            filType,
            manual,
            pan,
            attackCoeff,
            releaseCoeff,
            hpState,
            hpCoeffs
        } = this;
        let { phase, lastFc, envelope } = this;
        const rateInc = this.rate / this.sampleRate;
        const peak = Math.pow(10, ((this.peak / 127) * PEAK_DB) / 20);
        const hpfPeak = Math.pow(10, ((this.peak / 127) * HPF_Q) / 20);
        const pol = this.polarity === 0 ? -1 : DEPTH_MUL;
        const depth = (this.depth / 127) * pol;
        const sens = this.sens / 127;
        for (let i = 0; i < sampleCount; i++) {
            // Mono!
            const s = applyShelves(
                (inputLeft[i] + inputRight[i]) * 0.5,
                lsCoeffs,
                hsCoeffs,
                lsState,
                hsState
            );

            const rectified = Math.abs(s);

            envelope =
                rectified > envelope
                    ? attackCoeff * envelope + (1 - attackCoeff) * rectified
                    : releaseCoeff * envelope + (1 - releaseCoeff) * rectified;

            // Triangle LFO
            const lfo = 2 * Math.abs(phase - 0.5) * depth;
            if ((phase += rateInc) >= 1) phase -= 1;
            const lfoMul =
                lfo >= LFO_SMOOTH_FRAC || pol < 0
                    ? 1
                    : Math.sin((lfo * Math.PI) / (2 * LFO_SMOOTH_FRAC));
            const base = manual * (1 + sens * envelope * SENS_COEFF);
            const fc = Math.max(20, base * (1 + lfoMul * lfo));
            const target = Math.max(10, fc);
            lastFc += (target - lastFc) * FC_SMOOTH;
            computeLowpassCoeffs(coeffs, lastFc, peak, sampleRate);

            let processedSample = s;

            if (filType === 1) {
                computeHighpassCoeffs(hpCoeffs, HPF_FC, hpfPeak, sampleRate);
                processedSample = processBiquad(
                    processedSample,
                    hpCoeffs,
                    hpState
                );
            }

            const mono = processBiquad(processedSample, coeffs, state) * level;

            // Pan
            const index = (pan + 64) | 0;
            const outL = mono * panTableLeft[index];
            const outR = mono * panTableRight[index];

            // Mix
            const idx = startIndex + i;
            outputLeft[idx] += outL;
            outputRight[idx] += outR;
            outputReverb[i] += mono * sendLevelToReverb;
            outputChorus[i] += mono * sendLevelToChorus;
            outputDelay[i] += mono * sendLevelToDelay;
        }
        this.phase = phase;
        this.lastFc = lastFc;
        this.envelope = envelope;
    }

    public setParameter(parameter: number, value: number) {
        switch (parameter) {
            default: {
                break;
            }

            case 0x03: {
                this.filType = value;
                break;
            }

            case 0x04: {
                this.sens = value;
                break;
            }

            case 0x05: {
                this.setManual(value);
                break;
            }

            case 0x06: {
                this.peak = value;
                break;
            }

            case 0x07: {
                this.rate = InsertionValueConverter.rate1(value);
                break;
            }

            case 0x08: {
                this.depth = value;
                break;
            }

            case 0x09: {
                this.polarity = value;
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

            case 0x15: {
                this.pan = value - 64;
                break;
            }

            case 0x16: {
                this.level = value / 127;
                break;
            }
        }
        this.updateShelves();
    }

    private setManual(value: number) {
        const target = value * MANUAL_SCALE;
        const floor = InsertionValueConverter.manual(Math.floor(target));
        const ceil = InsertionValueConverter.manual(Math.ceil(target));
        const frac = target - Math.floor(target);

        this.manual = floor + (ceil - floor) * frac;
    }

    private updateShelves() {
        computeShelfCoeffs(
            this.lsCoeffs,
            this.lowGain,
            200,
            this.sampleRate,
            true
        );
        computeShelfCoeffs(
            this.hsCoeffs,
            this.hiGain,
            4000,
            this.sampleRate,
            false
        );
    }
}

function computeLowpassCoeffs(
    coeffs: BiquadCoeffs,
    freq: number,
    Q: number,
    sampleRate: number
) {
    const w0 = (2 * Math.PI * freq) / sampleRate;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / (2 * Q);

    const b1 = 1 - cosw0;
    const b0 = b1 / 2;
    const b2 = b0;
    const a0 = 1 + alpha;
    const a1 = -2 * cosw0;
    const a2 = 1 - alpha;

    coeffs.a0 = 1;
    coeffs.a1 = a1 / a0;
    coeffs.a2 = a2 / a0;
    coeffs.b0 = b0 / a0;
    coeffs.b1 = b1 / a0;
    coeffs.b2 = b2 / a0;
}

function computeHighpassCoeffs(
    coeffs: BiquadCoeffs,
    freq: number,
    Q: number,
    sampleRate: number
) {
    const w0 = (2 * Math.PI * freq) / sampleRate;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / (2 * Q);

    const b0 = (1 + cosw0) / 2;
    const b1 = -(1 + cosw0);
    const b2 = b0;
    const a0 = 1 + alpha;
    const a1 = -2 * cosw0;
    const a2 = 1 - alpha;

    coeffs.a0 = 1;
    coeffs.a1 = a1 / a0;
    coeffs.a2 = a2 / a0;
    coeffs.b0 = b0 / a0;
    coeffs.b1 = b1 / a0;
    coeffs.b2 = b2 / a0;
}
