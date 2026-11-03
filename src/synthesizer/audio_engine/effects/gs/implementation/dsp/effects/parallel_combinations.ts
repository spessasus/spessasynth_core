import type { DelayMemory } from "../blocks/delay_memory";
import { GSParallelCombination } from "./parallel_combination";
import { ParallelStages } from "../enums";

/**
 * OD1 / OD2 (`11 03`): a drive with the amp simulator on each input.
 * Parameters: 1 OD1 type, 2 OD1 drive, 3 OD1 amp type, 4 OD1 amp switch, 6-9 the same for OD2, 16 OD1 pan,
 * 17 OD1 level, 18 OD2 pan, 19 OD2 level, 20 level. EFX control source 1 modulates OD1's drive, source 2 OD2's.
 * @internal
 */
export class GSOverdriveParallelOverdrive extends GSParallelCombination {
    public readonly type = 0x11_03;
    protected readonly defaults = new Uint8Array([
        0x00, 0x30, 0x01, 0x01, 0x00, 0x01, 0x4c, 0x03, 0x01, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x60, 0x7f, 0x54, 0x7f
    ]);
    protected readonly limits = { 0: 1, 2: 3, 3: 1, 5: 1, 7: 3, 8: 1 };

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(
            sampleRate,
            memory,
            { type: ParallelStages.drive },
            { type: ParallelStages.drive }
        );
        this.reset();
    }
}

/**
 * OD / Rotary (`11 04`): the drive on the left input, the rotary on the right input.
 * Parameters: 1 type, 2 drive, 3 amp type, 4 amp switch, 6 low slow, 7 low fast, 8 low accel, 9 low level, 10 high
 * slow, 11 high fast, 12 high accel, 13 high level, 14 separation, 15 speed, 16 drive pan, 17 drive level, 18
 * rotary pan, 19 rotary level, 20 level. EFX control source 1 modulates the drive, source 2 the speed.
 * @internal
 */
export class GSOverdriveParallelRotary extends GSParallelCombination {
    public readonly type = 0x11_04;
    protected readonly defaults = new Uint8Array([
        0x00, 0x30, 0x01, 0x01, 0x00, 0x06, 0x71, 0x18, 0x7f, 0x11, 0x78, 0x58,
        0x40, 0x60, 0x00, 0x00, 0x60, 0x7f, 0x7f, 0x7f
    ]);
    protected readonly limits = { 0: 1, 2: 3, 3: 1 };

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(
            sampleRate,
            memory,
            { type: ParallelStages.drive },
            { type: ParallelStages.rotary }
        );
        this.reset();
    }
}

/**
 * OD / Phaser (`11 05`): the drive on the left input, the phaser on the right input.
 * Parameters: 1 type, 2 drive, 3 amp type, 4 amp switch, 6 manual, 7 rate, 8 depth, 9 resonance, 10 mix, 16 drive
 * pan, 17 drive level, 18 phaser pan, 19 phaser level, 20 level. EFX control source 1 modulates the drive, source 2
 * the rate.
 * @internal
 */
export class GSOverdriveParallelPhaser extends GSParallelCombination {
    public readonly type = 0x11_05;
    protected readonly defaults = new Uint8Array([
        0x00, 0x30, 0x01, 0x01, 0x00, 0x24, 0x10, 0x40, 0x10, 0x7f, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x60, 0x7f, 0x7f, 0x7f
    ]);
    protected readonly limits = { 0: 1, 2: 3, 3: 1 };

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(
            sampleRate,
            memory,
            { type: ParallelStages.drive },
            { type: ParallelStages.phaser }
        );
        this.reset();
    }
}

/**
 * OD / AutoWah (`11 06`): the drive on the left input, the auto wah on the right input.
 * Parameters: 1 type, 2 drive, 3 amp type, 4 amp switch, 6 filter type, 7 sens, 8 manual, 9 peak, 10 rate, 11
 * depth, 12 polarity, 16 drive pan, 17 drive level, 18 wah pan, 19 wah level, 20 level. EFX control source 1
 * modulates the drive, source 2 the manual.
 * @internal
 */
export class GSOverdriveParallelAutoWah extends GSParallelCombination {
    public readonly type = 0x11_06;
    protected readonly defaults = new Uint8Array([
        0x00, 0x30, 0x01, 0x01, 0x00, 0x01, 0x00, 0x44, 0x3e, 0x28, 0x48, 0x01,
        0x00, 0x00, 0x00, 0x00, 0x60, 0x7f, 0x7f, 0x7f
    ]);
    protected readonly limits = { 0: 1, 2: 3, 3: 1, 5: 1, 11: 1 };

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(
            sampleRate,
            memory,
            { type: ParallelStages.drive },
            { type: ParallelStages.wah, output: 127 / 128 }
        );
        this.reset();
    }
}

/**
 * PH / Rotary (`11 07`): the phaser on the left input, the rotary on the right input.
 * Parameters: 1 manual, 2 rate, 3 depth, 4 resonance, 5 mix, 6-15 the rotary (as OD / Rotary), 16 phaser pan,
 * 17 phaser level, 18 rotary pan, 19 rotary level, 20 level. EFX control source 1 modulates the rate, source 2 the
 * speed.
 * @internal
 */
export class GSPhaserParallelRotary extends GSParallelCombination {
    public readonly type = 0x11_07;
    protected readonly defaults = new Uint8Array([
        0x24, 0x10, 0x40, 0x10, 0x7f, 0x06, 0x71, 0x18, 0x7f, 0x11, 0x78, 0x58,
        0x40, 0x60, 0x00, 0x00, 0x7f, 0x7f, 0x7f, 0x7f
    ]);

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(
            sampleRate,
            memory,
            { type: ParallelStages.phaser, input: 127 / 128 },
            { type: ParallelStages.rotary }
        );
        this.reset();
    }
}

/**
 * PH / AutoWah (`11 08`): the phaser on the left input, the auto wah on the right input.
 * Parameters: 1 manual, 2 rate, 3 depth, 4 resonance, 5 mix, 6-12 the wah (as OD / AutoWah), 16 phaser pan,
 * 17 phaser level, 18 wah pan, 19 wah level, 20 level. EFX control source 1 modulates the rate, source 2 the
 * manual.
 * @internal
 */
export class GSPhaserParallelAutoWah extends GSParallelCombination {
    public readonly type = 0x11_08;
    protected readonly defaults = new Uint8Array([
        0x24, 0x10, 0x40, 0x10, 0x7f, 0x01, 0x00, 0x44, 0x3e, 0x28, 0x48, 0x01,
        0x00, 0x00, 0x00, 0x00, 0x7f, 0x7f, 0x7f, 0x7f
    ]);
    protected readonly limits = { 5: 1, 11: 1 };

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(
            sampleRate,
            memory,
            { type: ParallelStages.phaser, input: 127 / 128 },
            { type: ParallelStages.wah, input: 127 / 128 }
        );
        this.reset();
    }
}
