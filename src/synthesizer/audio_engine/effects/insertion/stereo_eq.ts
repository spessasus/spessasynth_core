import type { InsertionProcessor } from "../types";
import { InsertionValueConverter } from "./convert";

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

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.reset();
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
        const { gain, sendLevelToChorus, sendLevelToDelay, sendLevelToReverb } =
            this;
        for (let i = 0; i < sampleCount; i++) {
            const idx = startIndex + i;
            const sL = inputLeft[idx];
            const sR = inputRight[idx];

            // Process
            // ???

            // Scale by output level and mix
            outputLeft[idx] += sL * gain;
            outputRight[idx] += sR * gain;

            // Sends (post-EFX)
            const mono = 0.5 * (sL + sR);
            outputReverb[idx] += mono * sendLevelToReverb;
            outputChorus[idx] += mono * sendLevelToChorus;
            outputDelay[idx] += mono * sendLevelToDelay;
        }
    }
}
