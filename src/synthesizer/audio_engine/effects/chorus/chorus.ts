import type { ChorusProcessor } from "../types";

class SpessaSynthChorus implements ChorusProcessor {
    /**
     * Cutoff frequency
     * @private
     */
    private preLPFfc = 8000;
    /**
     * Alpha
     * @private
     */
    private preLPFa = 0;
    /**
     * Previous value
     * @private
     */
    private preLPFz = 0;
    private readonly leftDelayBuffer;
    private readonly rightDelayBuffer;
    private readonly sampleRate;
    private phase = 0;
    private write = 0;
    private gain = 1;
    private depthSamples = 0;
    private delaySamples = 1;
    private rateInc = 0;
    private feedbackGain = 0;

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.leftDelayBuffer = new Float32Array(sampleRate);
        this.rightDelayBuffer = new Float32Array(sampleRate);
        // Update alpha
        this.preLowpass = 0;
    }

    private _preLowpass = 0;

    public get preLowpass(): number {
        return this._preLowpass;
    }

    public set preLowpass(value: number) {
        this._preLowpass = value;
        // GS sure loves weird mappings, huh?
        // Maps to around 8000-300 Hz
        this.preLPFfc = 8000 * 0.625 ** this._preLowpass;
        console.log(this.preLPFfc);
        const decay = Math.exp(
            (-2 * Math.PI * this.preLPFfc) / this.sampleRate
        );
        this.preLPFa = 1 - decay;
    }

    // Samples
    private _depth = 0;

    public get depth(): number {
        return this._depth;
    }

    public set depth(value: number) {
        this._depth = value;
        this.depthSamples = (value / 127) * 0.025 * this.sampleRate;
    }

    private _delay = 0;

    public get delay(): number {
        return this._delay;
    }

    public set delay(value: number) {
        this._delay = value;
        this.delaySamples = Math.max(
            1,
            (value / 127) * 0.025 * this.sampleRate
        );
    }

    private _feedback = 0;

    public get feedback(): number {
        return this._feedback;
    }

    public set feedback(value: number) {
        this._feedback = value;
        this.feedbackGain = value / 128;
    }

    private _rate = 0;

    public get rate() {
        return this._rate;
    }

    public set rate(value: number) {
        this._rate = value;
        // GS Advanced Editor actually specifies the rate!
        // 127 - 15.50Hz, 1 - 0.12 Hz
        const rate = 15.5 * (value / 127);
        this.rateInc = rate / this.sampleRate;
    }

    private _level = 64;

    public get level() {
        return this._level;
    }
    public set level(value: number) {
        this.gain = value / 127;
        this._level = value;
    }

    public process(
        input: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        startIndex: number,
        endIndex: number
    ) {
        const bufferL = this.leftDelayBuffer;
        const bufferR = this.rightDelayBuffer;
        const rateInc = this.rateInc;
        const bufferLen = bufferL.length;
        const depth = this.depthSamples;
        const delay = this.delaySamples;
        const gain = this.gain;
        const feedback = this.feedbackGain;

        let phase = this.phase;
        let write = this.write;
        let z = this.preLPFz;
        const a = this.preLPFa;
        for (let i = startIndex; i < endIndex; i++) {
            const x = input[i - startIndex];
            // Pre lowpass filter
            z += a * (x - z);
            const inputSample = z;

            // Triangle LFO (GS uses triangle)
            const lfo = 2 * Math.abs(phase - 0.5);

            // Read position
            const dL = Math.max(1, Math.min(delay + lfo * depth, bufferLen));
            let readPosL = write - dL;
            if (readPosL < 0) readPosL += bufferLen;

            // Linear interpolation
            let x0 = readPosL | 0;
            let x1 = x0 + 1;
            if (x1 >= bufferLen) x1 -= bufferLen;
            let frac = readPosL - x0;
            const outL = bufferL[x0] * (1 - frac) + bufferL[x1] * frac;
            outputLeft[i] += outL * gain;

            // Write input sample
            bufferL[write] = inputSample + outL * feedback;

            // Same for the right line (shared buffer for now for testing)
            const dR = Math.max(
                1,
                Math.min(delay + (1 - lfo) * depth, bufferLen)
            );
            let readPosR = write - dR;
            if (readPosR < 0) readPosR += bufferLen;

            // Linear interpolation
            x0 = readPosR | 0;
            x1 = x0 + 1;
            if (x1 >= bufferLen) x1 -= bufferLen;
            frac = readPosR - x0;
            const outR = bufferR[x0] * (1 - frac) + bufferR[x1] * frac;
            outputRight[i] += outR * gain;

            // Write input sample and advance
            bufferR[write] = inputSample + outR * feedback;

            if (++write >= bufferLen) write = 0;

            if ((phase += rateInc) >= 1) phase -= 1;
        }
        this.write = write;
        this.phase = phase;
        this.preLPFz = z;
    }
}

export default SpessaSynthChorus;
