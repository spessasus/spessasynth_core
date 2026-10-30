import { PhaserFX } from "./phaser";
import { AutoWahFX } from "./auto_wah";
import { PAN_TABLE_LEFT, PAN_TABLE_RIGHT } from "./utils";
import type { DefaultGSInsertionProcessor } from "./insertion_processor";

/*
This connects a Phaser effect and an Auto-wah effect in
parallel.

Type: mono processors, stereo mix
 */

const DEFAULT_LEVEL = 127;

export class PhAutoWahFX implements DefaultGSInsertionProcessor {
    public readonly type = 0x11_08;

    /**
     * Sets the stereo location of the phaser sound. L63 is far left, 0
     * is center, and R63 is far right.
     * [0;127]
     * @private
     */
    private phPan = 0;

    /**
     * Sets the stereo location of the aut-wah sound. L63 is far left, 0
     * is center, and R63 is far right.
     * [0;127]
     * @private
     */
    private awPan = 127;

    /**
     * Adjusts the output level.
     * [0;1]
     * @private
     */
    private level = DEFAULT_LEVEL / 127;

    private readonly phaser;
    private readonly autoWah;
    private readonly bufferPhL;
    private readonly bufferPhR;
    private readonly bufferAwL;
    private readonly bufferAwR;

    public constructor(sampleRate: number, maxBufferSize: number) {
        this.phaser = new PhaserFX(sampleRate);
        this.autoWah = new AutoWahFX(sampleRate);
        this.bufferPhL = new Float32Array(maxBufferSize);
        this.bufferPhR = new Float32Array(maxBufferSize);
        this.bufferAwL = new Float32Array(maxBufferSize);
        this.bufferAwR = new Float32Array(maxBufferSize);
        this.reset();
    }

    public reset() {
        this.phPan = 0;
        this.awPan = 127;
        this.level = DEFAULT_LEVEL / 127;
        this.phaser.reset();
        this.autoWah.reset();
        // Level
        this.phaser.setParameter(19, 127);
        this.autoWah.setParameter(19, 127);
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const { level, bufferPhL, bufferPhR, bufferAwL, bufferAwR } = this;
        // Only takes input from left!
        this.phaser.process(
            inputLeft,
            inputLeft,
            bufferPhL,
            bufferPhR,
            sampleCount
        );
        // Only takes input from right!
        this.autoWah.process(
            inputRight,
            inputRight,
            bufferAwL,
            bufferAwR,
            sampleCount
        );

        const phPan = this.phPan | 0;
        const phL = PAN_TABLE_LEFT[phPan];
        const phR = PAN_TABLE_RIGHT[phPan];
        const awPan = this.awPan | 0;
        const awL = PAN_TABLE_LEFT[awPan];
        const awR = PAN_TABLE_RIGHT[awPan];

        for (let i = 0; i < sampleCount; i++) {
            // Mix the stereo processor outputs down to mono
            const outPhaser = (bufferPhL[i] + bufferPhR[i]) * 0.5 * level;
            const outAutoWah = (bufferAwL[i] + bufferAwR[i]) * 0.5 * level;

            // Pan
            outputLeft[i] = outPhaser * phL + outAutoWah * awL;
            outputRight[i] = outPhaser * phR + outAutoWah * awR;
        }
    }

    public setParameter(parameter: number, value: number) {
        if (parameter >= 0 && parameter <= 4) {
            this.phaser.setParameter(parameter, value);
            return;
        }
        if (parameter >= 5 && parameter <= 11) {
            this.autoWah.setParameter(parameter - 5, value);
            return;
        }
        switch (parameter) {
            default: {
                break;
            }

            case 15: {
                this.phPan = value;
                break;
            }

            case 16: {
                this.phaser.setParameter(19, value);
                break;
            }

            case 17: {
                this.awPan = value;
                break;
            }

            case 18: {
                this.autoWah.setParameter(19, value);
                break;
            }

            case 19: {
                this.level = value / 127;
                break;
            }
        }
    }
}
