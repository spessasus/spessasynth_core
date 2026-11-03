import type { DelayMemory } from "../blocks/delay_memory";
import { GSModulationSeries } from "./modulation_series";
import { CombinationStages } from "../enums";

/**
 * Chorus -> Flanger (`02 0b`): the chorus, then both sides mixed into a flanger on its own line (as on the
 * SC-88Pro, SC-VA's flanger reads the chorus line and its feedback does nothing). Both flanger reads have the same
 * phase.
 * Parameters: 1 chorus pre delay, 2 chorus rate (Rate1 column), 3 chorus depth, 5 chorus balance, 6 flanger pre
 * delay, 7 flanger rate, 8 flanger depth, 9 flanger feedback, 10 flanger balance, 17 low gain, 18 high gain,
 * 20 level. EFX control source 1 modulates the chorus balance, source 2 the flanger balance.
 * @internal
 */
export class GSChorusFlanger extends GSModulationSeries {
    public readonly type = 0x02_0b;
    protected readonly defaults = new Uint8Array([
        0x0a, 0x08, 0x78, 0x00, 0x40, 0x10, 0x0b, 0x18, 0x68, 0x40, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x40, 0x40, 0x00, 0x70
    ]);

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory, false, CombinationStages.flanger);
        this.reset();
    }
}
