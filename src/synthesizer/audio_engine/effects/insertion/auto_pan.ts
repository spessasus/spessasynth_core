import type { InsertionProcessor } from "../types";
import {
    applyShelves,
    type BiquadCoeffs,
    type BiquadState,
    computeShelfCoeffs,
    zeroCoeffs,
    zeroState,
    zeroStateC
} from "./utils";
import { InsertionValueConverter } from "./convert";

const PI_2 = Math.PI * 2;

// This EFX seems to lower the gain (checking after normalizing with a dry voice at the same velocity)
// Why, Roland???
const GAIN_LVL = 0.935;
// Sonic visualizer is very helpful here
const LEVEL_EXP = 2;

const PAN_SMOOTHING = 0.01;

const DEFAULT_LEVEL = 127;
export class AutoPanFX implements InsertionProcessor {
    public sendLevelToReverb = 40 / 127;
    public sendLevelToChorus = 0;
    public sendLevelToDelay = 0;
    public readonly type = 0x01_26;

    /**
     * Selects the type of modulation.
     * Tri:
     *  The sound will be modulated like a triangle
     * wave.
     * Sqr:
     *  The sound will be modulated like a square
     * wave.
     * Sin:
     *  The sound will be modulated like a sine
     * wave.
     * Saw1,2: The sound will be modulated like a
     * sawtooth wave. The teeth in Saw1 and
     * Saw2 point at opposite direction.
     *
     * [Tri/Sqr/Sin/Saw1/Saw2 -> 00/01/02/03/04]
     * @private
     */
    private modWave = 1;

    /**
     * Adjusts the frequency of modulation.
     * [Rate1 conversion]
     * @private
     */
    private modRate = 3.05;

    /**
     * Adjusts the depth of modulation.
     * [0;127]
     * @private
     */
    private modDepth = 96;

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

    private currentPan = 0;
    private phase = 0;

    // Biquad shelving coefficients and states (per channel)
    private readonly lsCoeffs: BiquadCoeffs = { ...zeroCoeffs };
    private readonly hsCoeffs: BiquadCoeffs = { ...zeroCoeffs };

    // Low shelf
    private lsStateR: BiquadState = { ...zeroStateC };
    private lsStateL: BiquadState = { ...zeroStateC };
    // High shelf
    private hsStateR: BiquadState = { ...zeroStateC };
    private hsStateL: BiquadState = { ...zeroStateC };
    private readonly sampleRate;

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.reset();
    }

    public reset() {
        this.modWave = 1;
        this.modRate = 3.05;
        this.modDepth = 96;
        this.lowGain = 0;
        this.hiGain = 0;
        this.level = DEFAULT_LEVEL / 127;
        this.currentPan = 0;
        this.phase = 0;
        zeroState(this.hsStateR);
        zeroState(this.hsStateL);
        zeroState(this.lsStateR);
        zeroState(this.lsStateL);
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
            lsStateL,
            lsStateR,
            hsCoeffs,
            hsStateR,
            hsStateL,
            modWave
        } = this;
        const depth = Math.pow(this.modDepth / 127, LEVEL_EXP);
        const scale = (2 / (1 + depth)) * GAIN_LVL;
        const rateInc = this.modRate / this.sampleRate;
        let { phase, currentPan } = this;
        for (let i = 0; i < sampleCount; i++) {
            // Apply EQ to input (EQ is applied regardless of mix)
            const sL = applyShelves(
                inputLeft[i],
                lsCoeffs,
                hsCoeffs,
                lsStateL,
                hsStateL
            );
            const sR = applyShelves(
                inputRight[i],
                lsCoeffs,
                hsCoeffs,
                lsStateR,
                hsStateR
            );

            // -1 left
            // 1 right
            let lfo: number;
            switch (modWave) {
                default: {
                    // 0 -> triangle
                    lfo = 1 - 4 * Math.abs(phase - 0.5);
                    break;
                }

                case 1: {
                    // 1 - square
                    // This weird half-sine wave is what SC-VA produces so we have to keep it
                    lfo = phase > 0.5 ? -1 : -Math.cos((phase - 0.75) * PI_2);
                    break;
                }

                case 2: {
                    // 2 - sine
                    lfo = Math.sin(PI_2 * phase);
                    break;
                }

                case 3: {
                    // Saw1
                    lfo = 1 - 2 * phase;
                    break;
                }

                case 4: {
                    // Saw2
                    lfo = 2 * phase - 1;
                    break;
                }
            }
            if ((phase += rateInc) >= 1) phase -= 1;
            currentPan += (lfo - currentPan) * PAN_SMOOTHING;
            const pan = currentPan * depth;
            const gainL = (1 - pan) * 0.5 * scale;
            const gainR = (1 + pan) * 0.5 * scale;

            const outL = sL * level * gainL;
            const outR = sR * level * gainR;

            // Mix
            const idx = startIndex + i;
            outputLeft[idx] += outL;
            outputRight[idx] += outR;
            const mono = (outL + outR) * 0.5;
            outputReverb[i] += mono * sendLevelToReverb;
            outputChorus[i] += mono * sendLevelToChorus;
            outputDelay[i] += mono * sendLevelToDelay;
        }
        this.currentPan = currentPan;
        this.phase = phase;
    }

    public setParameter(parameter: number, value: number) {
        switch (parameter) {
            default: {
                break;
            }

            case 0x03: {
                this.modWave = value;
                break;
            }

            case 0x04: {
                this.modRate = InsertionValueConverter.rate1(value);
                break;
            }

            case 0x05: {
                this.modDepth = value;
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
