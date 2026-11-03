import type { DelayMemory } from "../blocks/delay_memory";
import { LFO } from "../blocks/lfo";
import { ModulatedDelay } from "../blocks/modulated_delay";
import { modulationDepth, preDelay, rate1, SWING_MS } from "../conversion";
import { GSThreeDStageEffect } from "./three_d_stage_effect";

/**
 * 3D Chorus (`01 44`): `L+R -> chorus (two voices, 180 degrees apart) -> 3D stage`, then the balance and the EQ.
 * The voices sit at left and right 90 degrees.
 * Parameters: 1 pre delay, 2 rate (Rate1 column), 3 depth, 15 output (speaker, phones), 16 balance, 17 low gain,
 * 18 high gain, 20 level. EFX control source 1 modulates the rate, source 2 the balance.
 * @internal
 */
export class GSThreeDChorus extends GSThreeDStageEffect {
    public readonly type = 0x01_44;
    protected readonly defaults = new Uint8Array([
        0x0a, 0x08, 0x48, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x40, 0x40, 0x40, 0x00, 0x50
    ]);
    private readonly lfo: LFO;
    private readonly voices: ModulatedDelay;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory);
        this.lfo = new LFO(sampleRate);
        // Reads: the two voices for the right output, then the same one sample earlier for the left output
        // The line holds the 100 ms pre delay and the swing, with a ms to spare
        this.voices = new ModulatedDelay(sampleRate, memory, 4, 101 + SWING_MS);
        this.reset();
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const { voices, stageL, stageR, output } = this;
        const v = voices.output;
        for (let i = 0; i < sampleCount; i++) {
            const l = inputLeft[i];
            const r = inputRight[i];
            voices.process(this.mix.process(l, r), this.lfo.process());
            stageL.process(v[2], v[3]);
            stageR.process(v[0], v[1]);
            output.process(l, stageL.left, r, stageR.right);
            outputLeft[i] = output.left;
            outputRight[i] = output.right;
        }
    }

    protected clear() {
        super.clear();
        this.lfo.clear();
        this.voices.clear();
    }

    protected update() {
        const p = this.parameters;
        this.lfo.setRate(rate1(this.controlled(0, 1)));
        const pre = preDelay(p[0]);
        const depth = modulationDepth(p[2]);
        for (let read = 0; read < 4; read++) {
            this.voices.setPreDelay(read, Math.max(0, pre - (read >> 1) / 32));
            this.voices.setDepth(read, depth);
            this.voices.setPhase(read, (read & 1) * 180);
        }
        this.updateStage();
    }
}
