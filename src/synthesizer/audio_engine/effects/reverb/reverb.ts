import type { ReverbProcessor } from "../types";
import { DattorroReverb } from "./dattorro";
import { DelayLine } from "../delay_line";

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
     * Output of the left (and mono) delay.
     * @private
     */
    private delayLeftOutput = new Float32Array(128);

    /**
     * Output of the right delay.
     * @private
     */
    private delayRightOutput = new Float32Array(128);

    /**
     * Input into the left delay. Mixed dry input and right output.
     * @private
     */
    private delayLeftInput = new Float32Array(128);

    /**
     * Pre LPF buffer for the delay characters.
     * @private
     */
    private delayPreLPF = new Float32Array(128);
    /**
     * Sample rate of the processor.
     * @private
     */
    private readonly sampleRate;
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

    /**
     * Gain for the delay output.
     * @private
     */
    private delayGain = 1;

    /**
     * Panning delay feedback gain (from the right to the left delay).
     * @private
     */
    private panDelayFeedback = 0;

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.dattorro = new DattorroReverb(sampleRate);
        this.delayLeft = new DelayLine(sampleRate);
        this.delayRight = new DelayLine(sampleRate);
    }

    private _delayFeedback = 0;

    public get delayFeedback(): number {
        return this._delayFeedback;
    }

    public set delayFeedback(value: number) {
        this._delayFeedback = value;
        this.updateFeedback();
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
                this.dattorro.damping = 0.85;
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
                this.dattorro.damping = 0.55;
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
        this.updateFeedback();
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
        // Maps to around 8000-300 Hz
        this.preLPFfc = 8000 * 0.63 ** this._preLowpass;
        const decay = Math.exp(
            (-2 * Math.PI * this.preLPFfc) / this.sampleRate
        );
        this.preLPFa = 1 - decay;
    }

    /**
     *
     * @param input 0-based
     * @param outputLeft startIndex-based
     * @param outputRight startIndex-based
     * @param startIndex
     * @param endIndex
     */
    public process(
        input: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        startIndex: number,
        endIndex: number
    ) {
        switch (this._character) {
            default: {
                // Reverb
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
                // Delay
                // Grow buffer if needed
                const samples = endIndex - startIndex;
                if (this.delayLeftOutput.length < samples) {
                    this.delayLeftOutput = new Float32Array(samples);
                    this.delayPreLPF = new Float32Array(samples);
                }
                // Process pre-lowpass
                let delayIn: Float32Array;
                if (this._preLowpass > 0) {
                    const preLPF = this.delayPreLPF;
                    let z = this.preLPFz;
                    const a = this.preLPFa;
                    for (let i = 0; i < samples; i++) {
                        const x = input[i];
                        z += a * (x - z);
                        preLPF[i] = z;
                    }
                    this.preLPFz = z;
                    delayIn = preLPF;
                } else {
                    delayIn = input;
                }
                // Process delay
                this.delayLeft.process(delayIn, this.delayLeftOutput, samples);
                // Mix down
                const g = this.delayGain;
                for (let i = startIndex; i < endIndex; i++) {
                    const sample = this.delayLeftOutput[i - startIndex] * g;
                    outputRight[i] += sample;
                    outputLeft[i] += sample;
                }
                return;
            }
            case 7: {
                // Panning Delay
                // Grow buffer if needed
                const samples = endIndex - startIndex;
                if (this.delayLeftOutput.length < samples) {
                    this.delayLeftOutput = new Float32Array(samples);
                    this.delayRightOutput = new Float32Array(samples);
                    this.delayLeftInput = new Float32Array(samples);
                    this.delayPreLPF = new Float32Array(samples);
                }
                // Process pre-lowpass
                let delayIn: Float32Array;
                if (this._preLowpass > 0) {
                    const preLPF = this.delayPreLPF;
                    let z = this.preLPFz;
                    const a = this.preLPFa;
                    for (let i = 0; i < samples; i++) {
                        const x = input[i];
                        z += a * (x - z);
                        preLPF[i] = z;
                    }
                    this.preLPFz = z;
                    delayIn = preLPF;
                } else {
                    delayIn = input;
                }
                // Mix right into left
                const fb = this.panDelayFeedback;
                for (let i = 0; i < samples; i++) {
                    this.delayLeftInput[i] =
                        delayIn[i] + this.delayRightOutput[i] * fb;
                }
                // Process left
                this.delayLeft.process(
                    this.delayLeftInput,
                    this.delayLeftOutput,
                    samples
                );
                // Process right
                this.delayRight.process(
                    this.delayLeftOutput,
                    this.delayRightOutput,
                    samples
                );
                // Mix
                const g = this.delayGain;
                for (let i = startIndex; i < endIndex; i++) {
                    const idx = i - startIndex;
                    outputLeft[i] += this.delayLeftOutput[idx] * g;
                    outputRight[i] += this.delayRightOutput[idx] * g;
                }
                return;
            }
        }
    }

    private updateFeedback() {
        // Logarithmic time it seems
        // It gets way higher the closer you get to 127
        const x = this._delayFeedback / 127;
        const exp = 1 - (1 - x) ** 1.9;
        if (this._character === 6) {
            this.delayLeft.feedback = exp * 0.73;
        } else {
            this.delayLeft.feedback = this.delayRight.feedback = 0;
            this.panDelayFeedback = exp * 0.73;
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
        this.delayGain = this.level / 127;
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
