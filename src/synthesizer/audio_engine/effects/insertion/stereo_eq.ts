import type { InsertionProcessor } from "../types";
import { InsertionValueConverter } from "./convert";

const zeroHistory = { x1: 0, x2: 0, y1: 0, y2: 0 } as BiquadHistory;
const zeroCoeffData = {
    b0: 1,
    b1: 0,
    b2: 0,
    a0: 1,
    a1: 0,
    a2: 0
} as BiquadCoeffs;

/**
 * Stereo-EQ
 * This is a four-band stereo equalizer (low, mid x 2, high).
 */
export class StereoEQEFX implements InsertionProcessor {
    public readonly type = 0x01_00;
    public sendLevelToReverb = 0;
    public sendLevelToChorus = 0;
    public sendLevelToDelay = 0;

    private readonly sampleRate: number;
    private gain = 1;
    /**
     * Selects the frequency of the low range (200 Hz/400 Hz).
     * @private
     */
    private lowFreq = 400;
    /**
     * Adjusts the gain of the low frequency.
     * [-12;12]
     * @private
     */
    private lowGain = 5;
    /**
     * Selects the frequency of the high range (4kHz/8kHz).
     * @private
     */
    private hiFreq = 8000;
    /**
     * Adjusts the gain of the high frequency.
     * [-12;12]
     * @private
     */
    private hiGain = -12;
    /**
     * Adjusts the frequency of Mid 1 (mid range1).
     * [200;6300]
     * @private
     */
    private m1Freq = 1600;
    /**
     * This parameter adjusts the width of the area around the M1
     * Freq parameter that will be affected by the Gain setting.
     * Higher values of Q will result in a narrower area being
     * affected.
     * 0.5/1.0/2.0/4.0/9.0
     * @private
     */
    private m1Q = 0.5;
    /**
     * Adjusts the gain for the area specified by the M1 Freq
     * parameter and M1 Q parameter settings.
     * [-12;12]
     * @private
     */
    private m1Gain = 8;
    /**
     * Adjusts the frequency of Mid 2 (mid range2).
     * [200;6300]
     * @private
     */
    private m2Freq = 1000;
    /**
     * This parameter adjusts the width of the area around the M2
     * Freq parameter that will be affected by the Gain setting.
     * Higher values of Q will result in a narrower area being
     * affected.
     * 0.5/1.0/2.0/4.0/9.0
     * @private
     */
    private m2Q = 0.5;
    /**
     * Adjusts the gain for the area specified by the M2 Freq
     * parameter and M2 Q parameter settings.
     * [-12;12]
     * @private
     */
    private m2Gain = -8;

    private readonly lowCoeffs: BiquadCoeffs = { ...zeroCoeffData };
    private readonly m1Coeffs: BiquadCoeffs = { ...zeroCoeffData };
    private readonly m2Coeffs: BiquadCoeffs = { ...zeroCoeffData };
    private readonly hiCoeffs: BiquadCoeffs = { ...zeroCoeffData };

    private readonly lowStateL = { ...zeroHistory };
    private readonly lowStateR = { ...zeroHistory };
    private readonly m1StateL = { ...zeroHistory };
    private readonly m1StateR = { ...zeroHistory };
    private readonly m2StateL = { ...zeroHistory };
    private readonly m2StateR = { ...zeroHistory };
    private readonly hiStateL = { ...zeroHistory };
    private readonly hiStateR = { ...zeroHistory };

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.reset();
        this.updateCoefficients();
    }

    public reset() {
        this.gain = 1;
        this.lowFreq = 400;
        this.lowGain = 5;
        this.hiGain = -12;
        this.hiFreq = 8000;
        this.m1Freq = 1600;
        this.m1Q = 0.5;
        this.m1Gain = 8;
        this.m2Freq = 1000;
        this.m2Q = 0.5;
        this.m2Gain = -8;

        // Reset states
        zeroState(this.lowStateL);
        zeroState(this.lowStateR);
        zeroState(this.m1StateL);
        zeroState(this.m1StateR);
        zeroState(this.m2StateL);
        zeroState(this.m2StateR);
        zeroState(this.hiStateL);
        zeroState(this.hiStateR);
        this.updateCoefficients();
    }

    public setParameter(parameter: number, value: number) {
        switch (parameter) {
            default: {
                break;
            }

            case 0x03: {
                this.lowFreq = value === 1 ? 400 : 200;
                break;
            }

            case 0x04: {
                this.lowGain = value - 64;
                break;
            }

            case 0x05: {
                this.hiFreq = value === 1 ? 8000 : 4000;
                break;
            }

            case 0x06: {
                this.hiGain = value - 64;
                break;
            }

            case 0x07: {
                this.m1Freq = InsertionValueConverter.eqFreq(value);
                break;
            }

            case 0x08: {
                this.m1Q = [0.5, 1, 2, 4, 9][value] || 1;
                break;
            }

            case 0x09: {
                this.m1Gain = value - 64;
                break;
            }

            case 0x0a: {
                this.m2Freq = InsertionValueConverter.eqFreq(value);
                break;
            }

            case 0x0b: {
                this.m2Q = [0.5, 1, 2, 4, 9][value] || 1;
                break;
            }

            case 0x0c: {
                this.m2Gain = value - 64;
                break;
            }

            case 0x16: {
                this.gain = value / 127;
                break;
            }
        }
        this.updateCoefficients();
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
            gain,
            sendLevelToChorus,
            sendLevelToDelay,
            sendLevelToReverb,
            lowCoeffs,
            lowStateL,
            lowStateR,
            m1Coeffs,
            m1StateL,
            m1StateR,
            m2StateL,
            m2StateR,
            m2Coeffs,
            hiCoeffs,
            hiStateL,
            hiStateR
        } = this;
        for (let i = 0; i < sampleCount; i++) {
            let sL = inputLeft[i];
            let sR = inputRight[i];

            // Low -> m1 -> m2 -> hi
            sL = applyBiquad(sL, lowCoeffs, lowStateL);
            sR = applyBiquad(sR, lowCoeffs, lowStateR);

            sL = applyBiquad(sL, m1Coeffs, m1StateL);
            sR = applyBiquad(sR, m1Coeffs, m1StateR);

            sL = applyBiquad(sL, m2Coeffs, m2StateL);
            sR = applyBiquad(sR, m2Coeffs, m2StateR);

            sL = applyBiquad(sL, hiCoeffs, hiStateL);
            sR = applyBiquad(sR, hiCoeffs, hiStateR);

            // Mix
            const idx = startIndex + i;
            outputLeft[idx] += sL * gain;
            outputRight[idx] += sR * gain;
            // Sends (index 0)
            const mono = 0.5 * (sL + sR);
            outputReverb[i] += mono * sendLevelToReverb;
            outputChorus[i] += mono * sendLevelToChorus;
            outputDelay[i] += mono * sendLevelToDelay;
        }
    }

    private updateCoefficients() {
        // Dividing low and hi gain by 2 seems to improve accuraacy to SCVA
        computeLowShelfCoeffs(
            this.lowCoeffs,
            this.lowFreq,
            this.lowGain / 2,
            this.sampleRate
        );

        computePeakingEQCoeffs(
            this.m1Coeffs,
            this.m1Freq,
            this.m1Gain,
            this.m1Q,
            this.sampleRate
        );

        computePeakingEQCoeffs(
            this.m2Coeffs,
            this.m2Freq,
            this.m2Gain,
            this.m2Q,
            this.sampleRate
        );

        computeHighShelfCoeffs(
            this.hiCoeffs,
            this.hiFreq,
            this.hiGain / 2,
            this.sampleRate
        );
    }
}

interface BiquadCoeffs {
    b0: number;
    b1: number;
    b2: number;
    a0: number;
    a1: number;
    a2: number;
}

interface BiquadHistory {
    x1: number;
    x2: number;
    y1: number;
    y2: number;
}

function applyBiquad(x: number, c: BiquadCoeffs, s: BiquadHistory) {
    // Direct Form I:
    // Y = (b0*x + b1*x1 + b2*x2 - a1*y1 - a2*y2) / a0
    const y =
        (c.b0 * x + c.b1 * s.x1 + c.b2 * s.x2 - c.a1 * s.y1 - c.a2 * s.y2) /
        c.a0;

    // Shift state
    s.x2 = s.x1;
    s.x1 = x;
    s.y2 = s.y1;
    s.y1 = y;

    return y;
}

function zeroState(h: BiquadHistory) {
    h.x1 = h.x2 = h.y1 = h.y2 = 0;
}

/**
 * Robert Bristow-Johnson cookbook formulas
 * (https://webaudio.github.io/Audio-EQ-Cookbook/audio-eq-cookbook.html)
 *
 * S - a "shelf slope" parameter (for shelving EQ only).
 * When S = 1, the shelf slope is as steep as it can be and remain monotonically increasing or decreasing gain with frequency.
 * The shelf slope, in dB/octave,
 * remains proportional to S for all other values for a fixed  f0/Fs and dB gain.
 */
const SHELF_SLOPE = 1;

function computePeakingEQCoeffs(
    coeffs: BiquadCoeffs,
    freq: number,
    gainDB: number,
    Q: number,
    sampleRate: number
) {
    const A = Math.pow(10, gainDB / 40);
    const w0 = (2 * Math.PI * freq) / sampleRate;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / (2 * Q);

    const b0 = 1 + alpha * A;
    const b1 = -2 * cosw0;
    const b2 = 1 - alpha * A;
    const a0 = 1 + alpha / A;
    const a1 = -2 * cosw0;
    const a2 = 1 - alpha / A;

    coeffs.a0 = a0;
    coeffs.a1 = a1;
    coeffs.a2 = a2;
    coeffs.b0 = b0;
    coeffs.b1 = b1;
    coeffs.b2 = b2;
}

function computeLowShelfCoeffs(
    coeffs: BiquadCoeffs,
    freq: number,
    gainDB: number,
    sampleRate: number
) {
    const A = Math.pow(10, gainDB / 40);
    const w0 = (2 * Math.PI * freq) / sampleRate;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha =
        (sinw0 / 2) * Math.sqrt((A + 1 / A) * (1 / SHELF_SLOPE - 1) + 2);

    const b0 = A * (A + 1 - (A - 1) * cosw0 + 2 * Math.sqrt(A) * alpha);
    const b1 = 2 * A * (A - 1 - (A + 1) * cosw0);
    const b2 = A * (A + 1 - (A - 1) * cosw0 - 2 * Math.sqrt(A) * alpha);
    const a0 = A + 1 + (A - 1) * cosw0 + 2 * Math.sqrt(A) * alpha;
    const a1 = -2 * (A - 1 + (A + 1) * cosw0);
    const a2 = A + 1 + (A - 1) * cosw0 - 2 * Math.sqrt(A) * alpha;

    coeffs.a0 = a0;
    coeffs.a1 = a1;
    coeffs.a2 = a2;
    coeffs.b0 = b0;
    coeffs.b1 = b1;
    coeffs.b2 = b2;
}

function computeHighShelfCoeffs(
    coeffs: BiquadCoeffs,
    freq: number,
    gainDB: number,
    sampleRate: number
) {
    const A = Math.pow(10, gainDB / 40);
    const w0 = (2 * Math.PI * freq) / sampleRate;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha =
        (sinw0 / 2) * Math.sqrt((A + 1 / A) * (1 / SHELF_SLOPE - 1) + 2);

    const b0 = A * (A + 1 + (A - 1) * cosw0 + 2 * Math.sqrt(A) * alpha);
    const b1 = -2 * A * (A - 1 + (A + 1) * cosw0);
    const b2 = A * (A + 1 + (A - 1) * cosw0 - 2 * Math.sqrt(A) * alpha);
    const a0 = A + 1 - (A - 1) * cosw0 + 2 * Math.sqrt(A) * alpha;
    const a1 = 2 * (A - 1 - (A + 1) * cosw0);
    const a2 = A + 1 - (A - 1) * cosw0 - 2 * Math.sqrt(A) * alpha;

    coeffs.a0 = a0;
    coeffs.a1 = a1;
    coeffs.a2 = a2;
    coeffs.b0 = b0;
    coeffs.b1 = b1;
    coeffs.b2 = b2;
}
