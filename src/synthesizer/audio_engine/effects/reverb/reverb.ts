import type { ReverbProcessor } from "../types";
import { DattorroReverb } from "./dattorro";
import { DelayLine } from "./delay";

export class SpessaSynthReverb implements ReverbProcessor {
    private readonly dattorro;
    private readonly delay;
    private readonly sampleRate;
    private timeCoeff = 1;
    private characterGainCoeff = 1;
    private lpfCoeff = 0;

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.dattorro = new DattorroReverb(sampleRate);
        this.delay = new DelayLine(sampleRate);
    }

    private _delayFeedback = 0;

    public get delayFeedback(): number {
        return this._delayFeedback;
    }

    public set delayFeedback(value: number) {
        this._delayFeedback = value;
        // Logarithmic time it seems
        // It gets way higher the closer you get to 127
        const x = value / 127;
        const exp = 1 - (1 - x) ** 1.9;
        this.delay.feedback = exp * 0.73;
    }

    private _character = 0;

    public get character(): number {
        return this._character;
    }

    public set character(value: number) {
        this._character = value;
        this.dattorro.damping = 0.005;
        this.timeCoeff = 1;
        this.characterGainCoeff = 1;
        this.lpfCoeff = 0;
        this.dattorro.inputDiffusion1 = 0.75;
        this.dattorro.inputDiffusion2 = 0.625;
        this.dattorro.decayDiffusion1 = 0.7;
        this.dattorro.decayDiffusion2 = 0.5;
        this.dattorro.excursionRate = 0.5;
        this.dattorro.excursionDepth = 0.7;
        // Tested all characters on level = 64, preset: Hall2
        // File: gs_reverb_character_test.ts, compare spessasynth to SC-VA
        // Tuned by me, though I'm not very good at it :-)
        switch (value) {
            case 0: {
                // Room1
                this.dattorro.damping = 0.95;
                this.timeCoeff = 0.9;
                this.characterGainCoeff = 0.7;
                this.lpfCoeff = 0.2;
                break;
            }

            case 1: {
                // Room2
                this.dattorro.damping = 0.2;
                this.characterGainCoeff = 0.5;
                this.timeCoeff = 1;
                this.dattorro.decayDiffusion2 = 0.64;
                this.dattorro.decayDiffusion1 = 0.6;
                this.lpfCoeff = 0.2;
                break;
            }

            case 2: {
                // Room3
                this.dattorro.damping = 0.56;
                this.characterGainCoeff = 0.55;
                this.timeCoeff = 1;
                this.dattorro.decayDiffusion2 = 0.64;
                this.dattorro.decayDiffusion1 = 0.6;
                this.lpfCoeff = 0.1;
                break;
            }

            case 3: {
                // Hall1
                this.dattorro.damping = 0.6;
                this.characterGainCoeff = 1;
                this.lpfCoeff = 0;
                this.dattorro.decayDiffusion2 = 0.7;
                this.dattorro.decayDiffusion1 = 0.66;
                break;
            }

            case 4: {
                // Hall2
                this.characterGainCoeff = 0.55;
                this.dattorro.damping = 0.65;
                this.lpfCoeff = 0.2;
                break;
            }

            case 5: {
                // Plate
                this.characterGainCoeff = 0.55;
                this.dattorro.damping = 0.65;
                this.timeCoeff = 0.5;
                break;
            }
        }

        // Update values
        this.updateTime();
        this.updateGain();
        this.updateLowpass();
        this.delay.clear();
    }

    private _time = 0;

    public get time(): number {
        return this._time;
    }

    public set time(value: number) {
        this._time = value;
        this.updateTime();
    }

    private _preDelayTime = 0;

    public get preDelayTime(): number {
        return this._preDelayTime;
    }

    public set preDelayTime(value: number) {
        this._preDelayTime = value;
        // Predelay is 0-100 ms despite docs saying otherwise
        this.dattorro.preDelay = (value / 1.27) * (this.sampleRate / 1000);
    }

    private _level = 0;

    public get level(): number {
        return this._level;
    }

    public set level(value: number) {
        this._level = value;
        this.updateGain();
    }

    private _preLowpass = 0;

    public get preLowpass(): number {
        return this._preLowpass;
    }

    public set preLowpass(value: number) {
        this._preLowpass = value;
    }

    public process(
        input: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        startIndex: number,
        endIndex: number
    ) {
        switch (this._character) {
            default: {
                this.dattorro.process(
                    input,
                    outputLeft,
                    outputRight,
                    startIndex,
                    endIndex
                );
                return;
            }

            case 6: {
                this.delay.process(
                    input,
                    outputLeft,
                    outputRight,
                    startIndex,
                    endIndex
                );
                return;
            }
        }
    }

    private updateLowpass() {
        this.dattorro.preLPF = Math.min(
            1,
            0.1 + (7 - this.preLowpass) / 14 + this.lpfCoeff
        );
    }

    private updateGain() {
        this.dattorro.gain = (this.level / 348) * this.characterGainCoeff;
        // SC-VA: Delay seems to be quite loud
        this.delay.gain = this.level / 127;
    }

    private updateTime() {
        const t = this._time / 127;
        this.dattorro.decay = this.timeCoeff * (0.05 + 0.65 * t);
        // Delay at 127 is exactly 0.4468 seconds
        // The minimum value (delay 0) seems to be 21 samples
        this.delay.time = Math.max(21, (t * this.sampleRate * 0.4468) | 0);
    }
}
