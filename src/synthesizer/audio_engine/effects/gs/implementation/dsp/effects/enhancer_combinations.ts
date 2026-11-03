import type { DelayMemory } from "../blocks/delay_memory";
import { GSEnhancerCombination } from "./enhancer_combination";
import { CombinationStages } from "../enums";

/**
 * Enhancer -> Chorus (`02 06`). The right side is not enhanced, it only mixes the right enhancer's dry signal (the
 * SC-88Pro does the same).
 * @internal
 */
export class GSEnhancerChorus extends GSEnhancerCombination {
    public readonly type = 0x02_06;
    protected readonly defaults = new Uint8Array([
        0x40, 0x7f, 0x00, 0x00, 0x00, 0x40, 0x08, 0x65, 0x00, 0x40, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x40, 0x40, 0x00, 0x50
    ]);

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory, CombinationStages.chorus, false);
        this.reset();
    }
}

/**
 * Enhancer -> Flanger (`02 07`). The right side is not enhanced, as in EH -> Chorus.
 * @internal
 */
export class GSEnhancerFlanger extends GSEnhancerCombination {
    public readonly type = 0x02_07;
    protected readonly defaults = new Uint8Array([
        0x40, 0x7f, 0x00, 0x00, 0x00, 0x10, 0x0b, 0x18, 0x68, 0x30, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x40, 0x40, 0x00, 0x60
    ]);

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory, CombinationStages.flanger, false);
        this.reset();
    }
}

/**
 * Enhancer -> Delay (`02 08`).
 * @internal
 */
export class GSEnhancerDelay extends GSEnhancerCombination {
    public readonly type = 0x02_08;
    protected readonly defaults = new Uint8Array([
        0x40, 0x7f, 0x00, 0x00, 0x00, 0x6f, 0x50, 0x7f, 0x00, 0x30, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x40, 0x40, 0x00, 0x58
    ]);

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory, CombinationStages.delay, true);
        this.reset();
    }
}
