import type { DelayMemory } from "../blocks/delay_memory";
import { levelGain, STAGE_GAIN } from "../glue";
import { Reverb } from "../blocks/reverb";
import { hfDamp, preDelay, reverbTime } from "../conversion";
import { GSReverbEffect } from "./reverb_effect";

/**
 * Reverb (`01 55`).
 * Parameters: 1 type (Room 1, Room 2, Stage 1, Stage 2, Hall 1, Hall 2), 2 pre delay (PreDly column), 3 time, 4 HF
 * damp (HF column), 16 balance, 17 low gain, 18 high gain, 20 level. EFX control source 1 modulates the time,
 * source 2 the balance.
 * @internal
 */
export class GSReverb extends GSReverbEffect {
    public readonly type = 0x01_55;
    protected readonly defaults = new Uint8Array([
        0x03, 0x70, 0x78, 0x68, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x40, 0x40, 0x40, 0x00, 0x7f
    ]);
    protected readonly limits = { 0: 5 };
    protected readonly reverb: Reverb;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory);
        this.reverb = new Reverb(sampleRate, memory);
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
        this.reverb.setType(p[0]);
        this.reverb.setPreDelay(preDelay(p[1]));
        this.reverb.setTime(reverbTime(this.controlled(0, 2)));
        this.reverb.setDamping(hfDamp(p[3]));
        this.setOutput(this.controlled(1, 15), levelGain(p[19]) * STAGE_GAIN);
    }
}
