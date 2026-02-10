import type { ChorusProcessor } from "../types";

class SpessaSynthChorus implements ChorusProcessor {
    public preLowpass = 0;
    private readonly leftDelayBuffer;
    private readonly rightDelayBuffer;
    private readonly sampleRate;
    private phase = 0;
    private write = 0;
    private gain = 1;

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.leftDelayBuffer = new Float32Array(sampleRate);
        this.rightDelayBuffer = new Float32Array(sampleRate);
    }

    private _depth = 0;

    public set depth(value: number) {
        this._depth = (value / 127) * 0.025;
    }

    private _delay = 0;

    public set delay(value: number) {
        this._delay = Math.max(0.002, (value / 127) * 0.025);
    }

    private _feedback = 0;

    public set feedback(value: number) {
        this._feedback = value / 128;
    }

    private _rate = 0;

    public set rate(value: number) {
        // GS Advanced Editor actually specifies the rate!
        // 127 - 15.50Hz, 1 - 0.12 Hz
        this._rate = 15.5 * (value / 127);
    }

    public set level(value: number) {
        this.gain = value / 127;
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
        const rateInc = this._rate / this.sampleRate;
        const bufferLen = bufferL.length;
        const depth = this._depth * this.sampleRate;
        const delay = this._delay * this.sampleRate;
        const gain = this.gain;
        const feedback = this._feedback;

        let phase = this.phase;
        let write = this.write;
        for (let i = startIndex; i < endIndex; i++) {
            const inputSample = input[i - startIndex];

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
    }
}

export default SpessaSynthChorus;
