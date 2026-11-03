import { GSEffect } from "../gs_effect";
import { STAGE_GAIN } from "../glue";

/**
 * The output stage with the level fixed at 127/128.
 */
const GAIN = (STAGE_GAIN * 127) / 128;

/**
 * Thru (`00 00`): the input through the output stage, -0.272 dB.
 * @internal
 */
export class GSThru extends GSEffect {
    public readonly type = 0x00_00;
    // Only the level (20) has a default, and nothing reads it
    protected readonly defaults = new Uint8Array([
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7f
    ]);

    public constructor(sampleRate: number) {
        super(sampleRate);
        this.reset();
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        for (let i = 0; i < sampleCount; i++) {
            outputLeft[i] = inputLeft[i] * GAIN;
            outputRight[i] = inputRight[i] * GAIN;
        }
    }

    protected clear() {
        /* Nothing to clear */
    }

    protected update() {
        /* Thru has no parameters */
    }
}
