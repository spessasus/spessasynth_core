import type { InsertionProcessor } from "../types";
import { PhaserFX } from "./phaser";
import { AutoWahFX } from "./auto_wah";
import { SPESSA_BUFSIZE } from "../../engine_components/synth_constants";
import { panTableLeft, panTableRight } from "./utils";

/*
This connects a Phaser effect and an Auto-wah effect in
parallel.

Type: mono processors, stereo mix
 */

const DEFAULT_LEVEL = 127;

export class PhAutoWahFx implements InsertionProcessor {
    public sendLevelToReverb = 40 / 127;
    public sendLevelToChorus = 0;
    public sendLevelToDelay = 0;
    public readonly type = 0x11_08; // CHANGE THIS

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
    private bufferPh = new Float32Array(SPESSA_BUFSIZE);
    private bufferAw = new Float32Array(SPESSA_BUFSIZE);

    public constructor(sampleRate: number) {
        this.phaser = new PhaserFX(sampleRate);
        this.autoWah = new AutoWahFX(sampleRate);
        this.phaser.sendLevelToReverb = 0;
        this.phaser.sendLevelToChorus = 0;
        this.phaser.sendLevelToDelay = 0;
        this.autoWah.sendLevelToReverb = 0;
        this.autoWah.sendLevelToChorus = 0;
        this.autoWah.sendLevelToDelay = 0;
        this.reset();
    }

    public reset() {
        this.phPan = 0;
        this.awPan = 127;
        this.level = DEFAULT_LEVEL / 127;
        this.phaser.reset();
        this.autoWah.reset();
        // Level
        this.phaser.setParameter(0x16, 127);
        this.autoWah.setParameter(0x16, 127);
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
            level
        } = this;

        // Resize buffer if needed
        if (sampleCount > this.bufferPh.length) {
            this.bufferPh = new Float32Array(sampleCount);
            this.bufferAw = new Float32Array(sampleCount);
        }
        const { bufferPh, bufferAw } = this;
        // Process phaser
        this.bufferPh.fill(0);
        // Only takes input from left!
        this.phaser.process(
            inputLeft,
            inputLeft,
            bufferPh,
            bufferPh,
            bufferPh, // Level 0, ignored
            bufferPh, // Level 0, ignored
            bufferPh, // Level 0, ignored
            0,
            sampleCount
        );

        // Process auto wah
        this.bufferAw.fill(0);
        // Only takes input from right!
        this.autoWah.process(
            inputRight,
            inputRight,
            bufferAw,
            bufferAw,
            bufferAw, // Level 0, ignored
            bufferAw, // Level 0, ignored
            bufferAw, // Level 0, ignored
            0,
            sampleCount
        );

        const phPan = this.phPan | 0;
        const phL = panTableLeft[phPan];
        const phR = panTableRight[phPan];
        const awPan = this.awPan | 0;
        const awL = panTableLeft[awPan];
        const awR = panTableRight[awPan];

        for (let i = 0; i < sampleCount; i++) {
            // Divide by 2 since processor mixes both left and right into it
            const outPhaser = bufferPh[i] * 0.5 * level;
            const outAutoWah = bufferAw[i] * 0.5 * level;

            // Pan
            const outL = outPhaser * phL + outAutoWah * awL;
            const outR = outPhaser * phR + outAutoWah * awR;

            // Mix
            const idx = startIndex + i;
            outputLeft[idx] += outL;
            outputRight[idx] += outR;
            const mono = (outL + outR) * 0.5;
            outputReverb[i] += mono * sendLevelToReverb;
            outputChorus[i] += mono * sendLevelToChorus;
            outputDelay[i] += mono * sendLevelToDelay;
        }
    }

    public setParameter(parameter: number, value: number) {
        if (parameter >= 0x03 && parameter <= 0x07) {
            this.phaser.setParameter(parameter, value);
            return;
        }
        if (parameter >= 0x08 && parameter <= 0x0e) {
            this.autoWah.setParameter(parameter - 5, value);
            return;
        }
        switch (parameter) {
            default: {
                break;
            }

            case 0x12: {
                this.phPan = value;
                break;
            }

            case 0x13: {
                this.phaser.setParameter(0x16, value);
                break;
            }

            case 0x14: {
                this.awPan = value;
                break;
            }

            case 0x15: {
                this.autoWah.setParameter(0x16, value);
                break;
            }

            case 0x16: {
                this.level = value / 127;
                break;
            }
        }
    }
}
