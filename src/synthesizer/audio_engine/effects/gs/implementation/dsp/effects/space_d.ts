import type { DelayMemory } from "../blocks/delay_memory";
import {
    chorusPhase,
    modulationDepth,
    preDelay,
    rate1,
    STEP_MS
} from "../conversion";
import { GSStereoModulatedDelay } from "./stereo_modulated_delay";
import { LINE_INPUT } from "../glue";

/**
 * The right line's extra delay: 16 samples at 32 kHz.
 */
const RIGHT_MS = 16 * STEP_MS;

/**
 * Space D (`01 43`): a multi tap chorus. One LFO moves a read on each channel's line, the right one 0.5 ms later
 * and offset by the phase. Each output is the difference of the two lines, so a centered input partly cancels.
 *
 * The shared stage reads the left input one 32 kHz sample late and writes the right output one sample late, on
 * the hardware too (the SC-88Pro's right output lags 27 us with a left input). Space D mixes both inputs into each
 * output, so that shows: each line has a second read one sample later for the right output, and the left output
 * reads the right line one sample early.
 * Parameters: 1 pre delay, 2 rate (Rate1 column), 3 depth, 4 phase, 16 balance, 17 low gain, 18 high gain,
 * 20 level. EFX control source 1 modulates the rate, source 2 the balance.
 * @internal
 */
export class GSSpaceD extends GSStereoModulatedDelay {
    public readonly type = 0x01_43;
    protected readonly defaults = new Uint8Array([
        0x20, 0x08, 0x7f, 0x5a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x40, 0x40, 0x40, 0x00, 0x60
    ]);

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory, 2);
        this.reset();
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const { delayL, delayR, output } = this;
        for (let i = 0; i < sampleCount; i++) {
            const phase = this.lfo.process();
            const l = inputLeft[i];
            const r = inputRight[i];
            delayL.process(l * LINE_INPUT, phase);
            delayR.process(r * LINE_INPUT, phase);
            output.process(
                l,
                delayL.output[0] - delayR.output[0],
                r,
                delayR.output[1] - delayL.output[1]
            );
            outputLeft[i] = output.left;
            outputRight[i] = output.right;
        }
    }

    protected update() {
        const p = this.parameters;
        this.lfo.setRate(rate1(this.controlled(0, 1)));
        // A quarter of the chorus depth
        const depth = modulationDepth(p[2]) / 4;
        const pre = preDelay(p[0]);
        for (let read = 0; read < 2; read++) {
            this.delayL.setPreDelay(read, pre + read * STEP_MS);
            this.delayR.setPreDelay(
                read,
                pre + RIGHT_MS + (read - 1) * STEP_MS
            );
            this.delayL.setDepth(read, depth);
            this.delayR.setDepth(read, depth);
            this.delayR.setPhase(read, chorusPhase(p[3]));
        }
        this.setOutput(this.controlled(1, 15), p[16], p[17], p[19]);
    }
}
