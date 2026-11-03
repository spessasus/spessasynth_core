import type { DelayMemory } from "../blocks/delay_memory";
import { GUITAR_DISTORTION_HIGH_PASS, GUITAR_OVERDRIVE } from "../blocks/drive";
import { GSDriveCombination } from "./drive_combination";
import { CombinationStages } from "../enums";

/**
 * Overdrive -> Chorus (`02 00`).
 * @internal
 */
export class GSOverdriveChorus extends GSDriveCombination {
    public readonly type = 0x02_00;
    protected readonly defaults = new Uint8Array([
        0x30, 0x40, 0x01, 0x00, 0x00, 0x0a, 0x08, 0x48, 0x00, 0x40, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x40, 0x40, 0x00, 0x50
    ]);
    protected readonly preset = GUITAR_OVERDRIVE;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory, CombinationStages.chorus);
        this.reset();
    }
}

/**
 * Overdrive -> Flanger (`02 01`).
 * @internal
 */
export class GSOverdriveFlanger extends GSDriveCombination {
    public readonly type = 0x02_01;
    protected readonly defaults = new Uint8Array([
        0x30, 0x40, 0x01, 0x00, 0x00, 0x10, 0x0b, 0x28, 0x68, 0x20, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x40, 0x40, 0x00, 0x50
    ]);
    protected readonly preset = GUITAR_OVERDRIVE;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory, CombinationStages.flanger);
        this.reset();
    }
}

/**
 * Overdrive -> Delay (`02 02`).
 * @internal
 */
export class GSOverdriveDelay extends GSDriveCombination {
    public readonly type = 0x02_02;
    protected readonly defaults = new Uint8Array([
        0x30, 0x40, 0x01, 0x00, 0x00, 0x6f, 0x50, 0x7f, 0x00, 0x30, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x40, 0x40, 0x00, 0x50
    ]);
    protected readonly preset = GUITAR_OVERDRIVE;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory, CombinationStages.delay);
        this.reset();
    }
}

/**
 * Distortion -> Chorus (`02 03`).
 * @internal
 */
export class GSDistortionChorus extends GSDriveCombination {
    public readonly type = 0x02_03;
    protected readonly defaults = new Uint8Array([
        0x30, 0x40, 0x01, 0x00, 0x00, 0x0a, 0x08, 0x48, 0x00, 0x40, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x40, 0x40, 0x00, 0x48
    ]);
    protected readonly preset = GUITAR_DISTORTION_HIGH_PASS;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory, CombinationStages.chorus);
        this.reset();
    }
}

/**
 * Distortion -> Flanger (`02 04`).
 * @internal
 */
export class GSDistortionFlanger extends GSDriveCombination {
    public readonly type = 0x02_04;
    protected readonly defaults = new Uint8Array([
        0x30, 0x40, 0x01, 0x00, 0x00, 0x0b, 0x0b, 0x18, 0x68, 0x20, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x40, 0x40, 0x00, 0x48
    ]);
    protected readonly preset = GUITAR_DISTORTION_HIGH_PASS;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory, CombinationStages.flanger);
        this.reset();
    }
}

/**
 * Distortion -> Delay (`02 05`).
 * @internal
 */
export class GSDistortionDelay extends GSDriveCombination {
    public readonly type = 0x02_05;
    protected readonly defaults = new Uint8Array([
        0x30, 0x40, 0x01, 0x00, 0x00, 0x6f, 0x50, 0x7f, 0x00, 0x30, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x40, 0x40, 0x00, 0x48
    ]);
    protected readonly preset = GUITAR_DISTORTION_HIGH_PASS;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory, CombinationStages.delay);
        this.reset();
    }
}
