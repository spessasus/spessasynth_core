import type {
    GSEqualizerParameter,
    GSEqualizerProcessor
} from "../interface/gs_equalizer_processor";

// Measured on the SC-88Pro.
const LOW_FREQUENCIES = [225, 425] as const;
const HIGH_FREQUENCIES = [3000, 6000] as const;

/**
 * The default GS Equalizer implementation for {@link SpessaSynthProcessor}.
 *
 * @group Synthesizer.GS Effects
 */
export class DefaultGSEqualizer implements GSEqualizerProcessor {
    private readonly sampleRate;
    // Normalized first order coefficients (a0 = 1)
    private lowB0 = 1;
    private lowB1 = 0;
    private lowA1 = 0;
    private highB0 = 1;
    private highB1 = 0;
    private highA1 = 0;
    // Transposed direct form II state
    private lowZL = 0;
    private lowZR = 0;
    private highZL = 0;
    private highZR = 0;

    /**
     * Constructs a new default GS equalizer processor.
     * @param sampleRate The sample rate, in Hertz.
     */
    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.updateLow();
        this.updateHigh();
    }

    private _lowFrequency = 0;

    public get lowFrequency() {
        return this._lowFrequency;
    }

    public set lowFrequency(value: number) {
        this._lowFrequency = value;
        this.updateLow();
    }

    private _lowGain = 64;

    public get lowGain() {
        return this._lowGain;
    }

    public set lowGain(value: number) {
        this._lowGain = value;
        this.updateLow();
    }

    private _highFrequency = 0;

    public get highFrequency() {
        return this._highFrequency;
    }

    public set highFrequency(value: number) {
        this._highFrequency = value;
        this.updateHigh();
    }

    private _highGain = 64;

    public get highGain() {
        return this._highGain;
    }

    public set highGain(value: number) {
        this._highGain = value;
        this.updateHigh();
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        startIndex: number,
        sampleCount: number
    ) {
        const { lowB0, lowB1, lowA1, highB0, highB1, highA1 } = this;
        let { lowZL, lowZR, highZL, highZR } = this;
        for (let i = 0; i < sampleCount; i++) {
            const o = startIndex + i;

            // Left: low shelf into high shelf
            let x = inputLeft[i];
            let y = lowB0 * x + lowZL;
            lowZL = lowB1 * x - lowA1 * y;
            // noinspection JSSuspiciousNameCombination
            x = y;
            y = highB0 * x + highZL;
            highZL = highB1 * x - highA1 * y;
            outputLeft[o] += y;

            // Right
            x = inputRight[i];
            y = lowB0 * x + lowZR;
            lowZR = lowB1 * x - lowA1 * y;
            // noinspection JSSuspiciousNameCombination
            x = y;
            y = highB0 * x + highZR;
            highZR = highB1 * x - highA1 * y;
            outputRight[o] += y;
        }
        this.lowZL = lowZL;
        this.lowZR = lowZR;
        this.highZL = highZL;
        this.highZR = highZR;
    }

    public getSnapshot(): GSEqualizerParameter {
        return {
            lowFrequency: this._lowFrequency,
            lowGain: this._lowGain,
            highFrequency: this._highFrequency,
            highGain: this._highGain
        };
    }

    public applySnapshot(snapshot: GSEqualizerParameter) {
        this.lowFrequency = snapshot.lowFrequency;
        this.lowGain = snapshot.lowGain;
        this.highFrequency = snapshot.highFrequency;
        this.highGain = snapshot.highGain;
    }

    private getBand(frequency: number, gain: number) {
        // Keep the corner below Nyquist for low sample rates
        const fc = Math.min(frequency, this.sampleRate * 0.45);
        const dB = Math.max(-12, Math.min(12, gain - 64));
        return {
            k: Math.tan((Math.PI * fc) / this.sampleRate),
            g: 10 ** (Math.abs(dB) / 20),
            cut: dB < 0
        };
    }

    private updateLow() {
        const { k, g, cut } = this.getBand(
            LOW_FREQUENCIES[this._lowFrequency & 1],
            this._lowGain
        );
        let b0 = 1 + k;
        let b1 = k - 1;
        let a0 = 1 + k / g;
        let a1 = k / g - 1;
        if (cut) [b0, b1, a0, a1] = [a0, a1, b0, b1];
        this.lowB0 = b0 / a0;
        this.lowB1 = b1 / a0;
        this.lowA1 = a1 / a0;
    }

    private updateHigh() {
        const { k, g, cut } = this.getBand(
            HIGH_FREQUENCIES[this._highFrequency & 1],
            this._highGain
        );
        let b0 = g * (1 + k);
        let b1 = g * (k - 1);
        let a0 = 1 + g * k;
        let a1 = g * k - 1;
        if (cut) [b0, b1, a0, a1] = [a0, a1, b0, b1];
        this.highB0 = b0 / a0;
        this.highB1 = b1 / a0;
        this.highA1 = a1 / a0;
    }
}
