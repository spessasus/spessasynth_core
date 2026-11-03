import type { DelayMemory } from "../blocks/delay_memory";
import { GSModulationParallel } from "./modulation_parallel";
import { CombinationStages } from "../enums";

/**
 * Chorus / Flanger (`11 02`): the chorus on the left input, a flanger on its own line on the right input (as on
 * the SC-88Pro, SC-VA's flanger reads the chorus line and its feedback does nothing). The flanger also mixes two
 * reads 180 degrees apart.
 * Parameters: 1 chorus pre delay, 2 chorus rate (Rate1 column), 3 chorus depth, 5 chorus balance, 6 flanger pre
 * delay, 7 flanger rate, 8 flanger depth, 9 flanger feedback, 10 flanger balance, 16 chorus pan, 17 chorus level,
 * 18 flanger pan, 19 flanger level, 20 level. EFX control source 1 modulates the chorus balance, source 2 the
 * flanger balance.
 * @internal
 */
export class GSChorusParallelFlanger extends GSModulationParallel {
    public readonly type = 0x11_02;
    protected readonly defaults = new Uint8Array([
        0x10, 0x08, 0x78, 0x00, 0x40, 0x10, 0x0b, 0x18, 0x68, 0x40, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x7f, 0x7f, 0x7f, 0x58
    ]);

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory, false, CombinationStages.flanger);
        this.reset();
    }
}
