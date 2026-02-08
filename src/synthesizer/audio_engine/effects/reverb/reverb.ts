import type { ReverbProcessor } from "../types";
import { DattorroReverb } from "./dattorro";
import { DelayLine } from "./delay";

export class SpessaSynthReverb implements ReverbProcessor {
    /**
     * Dattorro reverb processor.
     * @private
     */
    private readonly dattorro;
    /**
     * Left delay line, also used for the mono delay. (character 6)
     * @private
     */
    private readonly delayLeft;
    /**
     * Right delay line.
     * @private
     */
    private readonly delayRight;
    /**
     * Output of the mono delay.
     * @private
     */
    private delayOutput;
    /**
     * Sample rate of the processor.
     * @private
     */
    private readonly sampleRate;
    /**
     * Reverb time coefficient for different reverb characters.
     * @private
     */
    private characterTimeCoefficient = 1;
    /**
     * Reverb gain coefficient for different reverb characters.
     * @private
     */
    private characterGainCoefficient = 1;
    /**
     * Reverb pre-lowpass coefficient for different reverb characters.
     * @private
     */
    private characterLPFCoefficient = 0;

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.dattorro = new DattorroReverb(sampleRate);
        this.delayLeft = new DelayLine(sampleRate);
        this.delayRight = new DelayLine(sampleRate);
        this.delayOutput = new Float32Array(128);
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
        this.delayLeft.feedback = exp * 0.73;
        // Delay right is a simple delay from the left to create the panning effect
        this.delayRight.feedback = 0;
    }

    private _character = 0;

    public get character(): number {
        return this._character;
    }

    public set character(value: number) {
        this._character = value;
        this.dattorro.damping = 0.005;
        this.characterTimeCoefficient = 1;
        this.characterGainCoefficient = 1;
        this.characterLPFCoefficient = 0;
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
                this.characterTimeCoefficient = 0.9;
                this.characterGainCoefficient = 0.7;
                this.characterLPFCoefficient = 0.2;
                break;
            }

            case 1: {
                // Room2
                this.dattorro.damping = 0.2;
                this.characterGainCoefficient = 0.5;
                this.characterTimeCoefficient = 1;
                this.dattorro.decayDiffusion2 = 0.64;
                this.dattorro.decayDiffusion1 = 0.6;
                this.characterLPFCoefficient = 0.2;
                break;
            }

            case 2: {
                // Room3
                this.dattorro.damping = 0.56;
                this.characterGainCoefficient = 0.55;
                this.characterTimeCoefficient = 1;
                this.dattorro.decayDiffusion2 = 0.64;
                this.dattorro.decayDiffusion1 = 0.6;
                this.characterLPFCoefficient = 0.1;
                break;
            }

            case 3: {
                // Hall1
                this.dattorro.damping = 0.6;
                this.characterGainCoefficient = 1;
                this.characterLPFCoefficient = 0;
                this.dattorro.decayDiffusion2 = 0.7;
                this.dattorro.decayDiffusion1 = 0.66;
                break;
            }

            case 4: {
                // Hall2
                this.characterGainCoefficient = 0.55;
                this.dattorro.damping = 0.65;
                this.characterLPFCoefficient = 0.2;
                break;
            }

            case 5: {
                // Plate
                this.characterGainCoefficient = 0.55;
                this.dattorro.damping = 0.65;
                this.characterTimeCoefficient = 0.5;
                break;
            }
        }

        // Update values
        this.updateTime();
        this.updateGain();
        this.updateLowpass();
        this.delayLeft.clear();
        this.delayRight.clear();
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
                // Grow buffer if needed
                const samples = endIndex - startIndex;
                if (this.delayOutput.length < samples)
                    this.delayOutput = new Float32Array(samples);
                // Reset and process delay
                this.delayOutput.fill(0);
                this.delayLeft.process(input, this.delayOutput, 0, samples);
                // Mix down
                for (let i = startIndex; i < endIndex; i++) {
                    outputRight[i] += this.delayOutput[i - startIndex];
                    outputLeft[i] += this.delayOutput[i - startIndex];
                }
                return;
            }
            case 7: {
                // Grow buffer if needed
                const samples = endIndex - startIndex;
                if (this.delayOutput.length < samples)
                    this.delayOutput = new Float32Array(samples);
                // Reset and process delay
                this.delayOutput.fill(0);
                this.delayLeft.process(input, this.delayOutput, 0, samples);
                // Mix into left
                for (let i = startIndex; i < endIndex; i++) {
                    outputLeft[i] += this.delayOutput[i - startIndex];
                }
                // Mix into right
                this.delayRight.process(
                    this.delayOutput,
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
            0.1 + (7 - this.preLowpass) / 14 + this.characterLPFCoefficient
        );
    }

    private updateGain() {
        this.dattorro.gain = (this.level / 348) * this.characterGainCoefficient;
        // SC-VA: Delay seems to be quite loud
        this.delayLeft.gain = this.level / 127;
        this.delayRight.gain = 1; // Mirror left delay
    }

    private updateTime() {
        const t = this._time / 127;
        this.dattorro.decay = this.characterTimeCoefficient * (0.05 + 0.65 * t);
        // Delay at 127 is exactly 0.4468 seconds
        // The minimum value (delay 0) seems to be 21 samples
        const timeSamples = Math.max(21, (t * this.sampleRate * 0.4468) | 0);
        if (this.character === 7) {
            // Half the delay time
            this.delayRight.time = this.delayLeft.time = Math.floor(
                timeSamples / 2
            );
        } else {
            // Delay left is used as the main delay
            this.delayLeft.time = timeSamples;
        }
    }
}
