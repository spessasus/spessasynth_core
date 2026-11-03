import type { DelayMemory } from "../blocks/delay_memory";
import { GSModulationSeries } from "./modulation_series";
import { CombinationStages } from "../enums";

/**
 * Chorus -> Delay (`02 09`): the chorus, then both sides mixed into a delay with the HF damp in the loop. The right
 * chorus read is 180 degrees from the left one.
 * Parameters: 1 pre delay, 2 rate (Rate1 column), 3 depth, 5 chorus balance, 6 delay (Dly3 column), 7 delay
 * feedback, 8 HF damp, 10 delay balance, 17 low gain, 18 high gain, 20 level. EFX control source 1 modulates the
 * chorus balance, source 2 the delay balance.
 * @internal
 */
export class GSChorusDelay extends GSModulationSeries {
    public readonly type = 0x02_09;
    protected readonly defaults = new Uint8Array([
        0x0a, 0x09, 0x78, 0x00, 0x40, 0x6f, 0x50, 0x7f, 0x00, 0x30, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x40, 0x40, 0x00, 0x7f
    ]);

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory, false, CombinationStages.delay);
        this.reset();
    }
}

/**
 * Flanger -> Delay (`02 0a`): the flanger, then both sides mixed into a delay with the HF damp in the loop. Both
 * flanger reads have the same phase, on the hardware too.
 * Parameters: 1 pre delay, 2 rate (Rate1 column), 3 depth, 4 feedback, 5 flanger balance, 6 delay (Dly3 column),
 * 7 delay feedback, 8 HF damp, 10 delay balance, 17 low gain, 18 high gain, 20 level. EFX control source 1
 * modulates the feedback here, on the SC-88Pro and in the SC-8850 manual (SC-VA modulates the balance), source 2
 * the delay balance.
 * @internal
 */
export class GSFlangerDelay extends GSModulationSeries {
    public readonly type = 0x02_0a;
    protected readonly defaults = new Uint8Array([
        0x10, 0x0b, 0x18, 0x68, 0x40, 0x6f, 0x50, 0x7f, 0x00, 0x30, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x40, 0x40, 0x00, 0x7f
    ]);

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory, true, CombinationStages.delay);
        this.reset();
    }
}
