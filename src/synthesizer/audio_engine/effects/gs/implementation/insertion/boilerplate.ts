/* eslint-disable @typescript-eslint/no-unused-vars */
import {
    applyShelves,
    type BiquadCoeffs,
    type BiquadState,
    computeShelfCoeffs,
    ZERO_COEFFS,
    zeroState,
    ZeroStateC
} from "./utils";
import type { DefaultGSInsertionProcessor } from "./insertion_processor";

const DEFAULT_LEVEL = 127; // CHANGE THIS

/*
This is a boilerplate code to copy when creating a new insertion processor.
It already has EQ and level implemented.
 */

// REMEMBER TO REMOVE THE ESLINT DISABLE COMMENTS!

//@ts-expect-error Boilerplate class
// noinspection JSUnusedLocalSymbols
class BoilerplateFX implements DefaultGSInsertionProcessor {
    public readonly type = 0x00_01; // CHANGE THIS

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

    // Biquad shelving coefficients and states (per channel)
    private readonly lsCoeffs: BiquadCoeffs = { ...ZERO_COEFFS };
    private readonly hsCoeffs: BiquadCoeffs = { ...ZERO_COEFFS };

    // Low shelf
    private lsStateR: BiquadState = { ...ZeroStateC };
    private lsStateL: BiquadState = { ...ZeroStateC };
    // High shelf
    private hsStateR: BiquadState = { ...ZeroStateC };
    private hsStateL: BiquadState = { ...ZeroStateC };
    private readonly sampleRate;

    public constructor(sampleRate: number, maxBufferSize: number) {
        this.sampleRate = sampleRate;
        this.reset();
        void maxBufferSize; // REMOVE THIS
    }

    public reset() {
        this.lowGain = 0;
        this.hiGain = 0;
        this.level = DEFAULT_LEVEL / 127;
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
        sampleCount: number
    ) {
        const {
            level,
            lsCoeffs,
            lsStateL,
            lsStateR,
            hsCoeffs,
            hsStateR,
            hsStateL
        } = this;
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

            const outL = sL * level;
            const outR = sR * level;

            // Mix
            outputLeft[i] = outL;
            outputRight[i] = outR;
        }
    }

    public setParameter(parameter: number, value: number) {
        switch (parameter) {
            default: {
                break;
            }

            case 16: {
                this.lowGain = value - 64;
                break;
            }

            case 17: {
                this.hiGain = value - 64;
                break;
            }

            case 19: {
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
