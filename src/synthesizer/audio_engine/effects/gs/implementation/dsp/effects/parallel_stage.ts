import type { DelayMemory } from "../blocks/delay_memory";
import { levelGain } from "../glue";
import {
    Drive,
    GUITAR_DISTORTION_HIGH_PASS,
    GUITAR_OVERDRIVE
} from "../blocks/drive";
import { AmpSimulator } from "../blocks/amp_simulator";
import { Phaser } from "../blocks/phaser";
import { Wah } from "../blocks/wah";
import { Rotary } from "../blocks/rotary";
import { modulationDepth, rate1, slewTime } from "../conversion";
import { CombinationStage } from "./combination_stage";
import type { ParallelStageType } from "../enums";
import { ParallelStages } from "../enums";

/**
 * One effect of the parallel combinations with a drive, phaser, auto wah or rotary. One of its parameters is moved
 * by the effect's EFX control source.
 * @internal
 */
export abstract class ParallelStage extends CombinationStage {
    /**
     * The parameter the EFX control source moves, counted from the stage's first.
     */
    public abstract readonly target: number;
    /**
     * The right output is one 32 kHz sample late already (the rotary's reads), else the type delays it.
     */
    public readonly lagged: boolean = false;
}

/**
 * The drive with the amp simulator: type (OD, DS), drive (EFX control), amp type, amp switch.
 */
class DriveStage extends ParallelStage {
    public readonly target = 1;
    private readonly drive: Drive;
    private readonly amp: AmpSimulator;
    private ampOn = false;

    public constructor(sampleRate: number) {
        super();
        this.drive = new Drive(sampleRate);
        this.amp = new AmpSimulator(sampleRate);
    }

    public update(parameters: Uint8Array, base: number, control: number) {
        this.drive.setPreset(
            parameters[base] === 1
                ? GUITAR_DISTORTION_HIGH_PASS
                : GUITAR_OVERDRIVE
        );
        this.drive.setDrive(control);
        this.amp.setType(parameters[base + 2]);
        this.ampOn = parameters[base + 3] === 1;
    }

    public process(x: number) {
        let y = this.drive.process(x);
        // The amp runs when it is switched off too, so switching it on does not click
        const amp = this.amp.process(y);
        if (this.ampOn) y = amp;
        this.left = this.right = y;
    }

    public clear() {
        this.drive.clear();
        this.amp.clear();
    }
}

/**
 * The phaser mixed with its input: manual, rate (Rate1 column, EFX control), depth, resonance, mix.
 */
class PhaserStage extends ParallelStage {
    public readonly target = 1;
    private readonly phaser: Phaser;
    private wet = 0;

    public constructor(sampleRate: number) {
        super();
        this.phaser = new Phaser(sampleRate, 1);
    }

    public update(parameters: Uint8Array, base: number, control: number) {
        const { phaser } = this;
        phaser.setManual(parameters[base]);
        phaser.setRate(rate1(control));
        // The depth word is the chorus swing in ms over 16
        phaser.setDepth(modulationDepth(parameters[base + 2]) / 16);
        phaser.setResonance(parameters[base + 3]);
        // The chain runs at 1/8 of the input and comes out x 8 the mix level
        this.wet = levelGain(parameters[base + 4]);
    }

    public process(x: number) {
        this.phaser.step();
        this.left = this.right = x + this.wet * this.phaser.process(0, x);
    }

    public clear() {
        this.phaser.clear();
    }
}

/**
 * The auto wah: filter type (LPF, BPF), sens, manual (EFX control), peak, rate (Rate1 column), depth, polarity
 * (down, up).
 */
class WahStage extends ParallelStage {
    public readonly target = 2;
    private readonly wah: Wah;

    public constructor(sampleRate: number) {
        super();
        this.wah = new Wah(sampleRate);
    }

    public update(parameters: Uint8Array, base: number, control: number) {
        const { wah } = this;
        wah.setFilterType(parameters[base] === 1);
        wah.setPeak(parameters[base + 3]);
        wah.setSensitivity(levelGain(parameters[base + 1]));
        wah.setManual(levelGain(control));
        wah.setRate(rate1(parameters[base + 4]));
        // The depth word is the chorus swing in ms over 16
        wah.setDepth(modulationDepth(parameters[base + 5]) / 16);
        wah.setPolarity(parameters[base + 6] === 1);
    }

    public process(x: number) {
        // The wah's output stage has a gain of 4
        this.left = this.right = 4 * this.wah.process(x);
    }

    public clear() {
        this.wah.clear();
    }
}

/**
 * The rotary: low slow, low fast, low accel, low level, high slow, high fast, high accel, high level (rates on the
 * Rate1 column), separation, speed (slow, fast from 64, EFX control). Its two microphones go to the left and the
 * right output with the effect's pan.
 */
class RotaryStage extends ParallelStage {
    public readonly target = 9;
    public readonly lagged = true;
    private readonly rotary: Rotary;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super();
        this.rotary = new Rotary(sampleRate, memory);
    }

    public update(parameters: Uint8Array, base: number, control: number) {
        const { rotary } = this;
        const fast = control >= 64;
        rotary.setRates(
            rate1(parameters[base + (fast ? 5 : 4)]),
            rate1(parameters[base + (fast ? 1 : 0)])
        );
        rotary.setAcceleration(
            slewTime(parameters[base + 6]),
            slewTime(parameters[base + 2])
        );
        rotary.setLevels(
            levelGain(parameters[base + 7]),
            levelGain(parameters[base + 3])
        );
        rotary.setSeparation(levelGain(parameters[base + 8]));
    }

    public process(x: number) {
        this.rotary.process(x);
        this.left = this.rotary.left;
        this.right = this.rotary.right;
    }

    public clear() {
        this.rotary.clear();
    }

    public settle() {
        this.rotary.settle();
    }
}

/**
 * Builds an effect of a parallel combination. Call it after the type's `GSEffect` constructor, which rewinds the
 * delay memory.
 * @param type The effect.
 * @param sampleRate The sample rate.
 * @param memory The delay memory.
 * @internal
 */
export function createParallelStage(
    type: ParallelStageType,
    sampleRate: number,
    memory: DelayMemory
) {
    switch (type) {
        case ParallelStages.drive: {
            return new DriveStage(sampleRate);
        }
        case ParallelStages.phaser: {
            return new PhaserStage(sampleRate);
        }
        case ParallelStages.wah: {
            return new WahStage(sampleRate);
        }
        case ParallelStages.rotary: {
            return new RotaryStage(sampleRate, memory);
        }
    }
}
