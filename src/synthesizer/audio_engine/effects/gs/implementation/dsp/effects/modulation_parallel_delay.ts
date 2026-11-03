import type { DelayMemory } from "../blocks/delay_memory";
import { GSModulationParallel } from "./modulation_parallel";
import { CombinationStages } from "../enums";

/**
 * Chorus / Delay (`11 00`): the chorus on the left input, a delay with the HF damp in the loop on the right input.
 * Parameters: 1 pre delay, 2 rate (Rate1 column), 3 depth, 5 chorus balance, 6 delay (Dly3 column), 7 delay
 * feedback, 8 HF damp, 10 delay balance, 16 chorus pan, 17 chorus level, 18 delay pan, 19 delay level, 20 level.
 * EFX control source 1 modulates the chorus balance, source 2 the delay balance.
 * @internal
 */
export class GSChorusParallelDelay extends GSModulationParallel {
    public readonly type = 0x11_00;
    protected readonly defaults = new Uint8Array([
        0x0a, 0x08, 0x78, 0x00, 0x40, 0x6f, 0x50, 0x7f, 0x00, 0x28, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x7f, 0x7f, 0x7f, 0x60
    ]);

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory, false, CombinationStages.delay);
        this.reset();
    }
}

/**
 * Flanger / Delay (`11 01`): the flanger on the left input, a delay with the HF damp in the loop on the right
 * input.
 * Parameters: 1 pre delay, 2 rate (Rate1 column), 3 depth, 4 feedback, 5 flanger balance, 6 delay (Dly3 column),
 * 7 delay feedback, 8 HF damp, 10 delay balance, 16 flanger pan, 17 flanger level, 18 delay pan, 19 delay level,
 * 20 level. EFX control source 1 modulates the flanger balance, source 2 the delay balance.
 * @internal
 */
export class GSFlangerParallelDelay extends GSModulationParallel {
    public readonly type = 0x11_01;
    protected readonly defaults = new Uint8Array([
        0x10, 0x0b, 0x18, 0x68, 0x40, 0x6f, 0x50, 0x7f, 0x00, 0x30, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x7f, 0x7f, 0x7f, 0x60
    ]);

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory, true, CombinationStages.delay);
        this.reset();
    }
}
