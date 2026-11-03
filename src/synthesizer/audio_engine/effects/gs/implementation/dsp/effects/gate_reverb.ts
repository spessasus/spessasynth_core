import type { DelayMemory } from "../blocks/delay_memory";
import { levelGain, STAGE_GAIN } from "../glue";
import { GateReverb } from "../blocks/gate_reverb";
import { preDelay } from "../conversion";
import { GSReverbEffect } from "./reverb_effect";

/**
 * Gate Reverb (`01 56`).
 * Parameters: 1 type (Normal, Reverse, Sweep 1, Sweep 2), 2 pre delay (PreDly column), 3 gate time (5 to 500 ms in
 * 5 ms steps), 16 balance, 17 low gain, 18 high gain, 20 level. EFX control source 1 modulates the balance, source
 * 2 the level.
 * @internal
 */
export class GSGateReverb extends GSReverbEffect {
    public readonly type = 0x01_56;
    protected readonly defaults = new Uint8Array([
        0x00, 0x05, 0x0c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x2a, 0x40, 0x3d, 0x00, 0x70
    ]);
    protected readonly limits = { 0: 3 };
    protected readonly reverb: GateReverb;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory);
        this.reverb = new GateReverb(sampleRate, memory);
        this.reset();
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const { reverb, dry, wet } = this;
        for (let i = 0; i < sampleCount; i++) {
            const l = inputLeft[i];
            const r = inputRight[i];
            reverb.process(this.mix.process(l, r));
            outputLeft[i] = this.shelvesL.process(dry * l + wet * reverb.left);
            outputRight[i] = this.shelvesR.process(
                dry * r + wet * reverb.right
            );
        }
    }

    protected update() {
        const p = this.parameters;
        this.reverb.setPattern(p[0]);
        this.reverb.setPreDelay(preDelay(p[1]));
        this.reverb.setGateTime(5 * (Math.min(p[2], 99) + 1));
        // The pre delay read's 127/128
        this.setOutput(
            this.controlled(0, 15),
            levelGain(this.controlled(1, 19)) * STAGE_GAIN,
            127 / 128
        );
    }
}
