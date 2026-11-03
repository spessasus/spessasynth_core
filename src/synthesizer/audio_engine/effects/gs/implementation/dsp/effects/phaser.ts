import { GSEffect } from "../gs_effect";
import { levelGain, shelfGain, STAGE_GAIN } from "../glue";
import { Phaser } from "../blocks/phaser";
import { ShelfCorners, ShelfEQ } from "../blocks/shelf_eq";
import { modulationDepth, rate1 } from "../conversion";

/**
 * Phaser (`01 20`): per channel `phaser + dry -> EQ`, one LFO for both channels.
 * Parameters: 1 manual, 2 rate (Rate1 column), 3 depth, 4 resonance, 5 mix, 17 low gain, 18 high gain, 20 level.
 * EFX control source 1 moves the manual, source 2 the rate.
 * @internal
 */
export class GSPhaser extends GSEffect {
    public readonly type = 0x01_20;
    protected readonly defaults = new Uint8Array([
        0x24, 0x10, 0x40, 0x10, 0x7f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x40, 0x40, 0x00, 0x68
    ]);
    private readonly phaser: Phaser;
    private readonly shelvesL: ShelfEQ;
    private readonly shelvesR: ShelfEQ;
    private wet = 0;
    private gain = 0;

    public constructor(sampleRate: number) {
        super(sampleRate);
        this.phaser = new Phaser(sampleRate, 2);
        this.shelvesL = new ShelfEQ(sampleRate);
        this.shelvesR = new ShelfEQ(sampleRate);
        this.reset();
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const { phaser, wet, gain } = this;
        for (let i = 0; i < sampleCount; i++) {
            phaser.step();
            const l = inputLeft[i];
            const r = inputRight[i];
            outputLeft[i] =
                this.shelvesL.process(l + wet * phaser.process(0, l)) * gain;
            outputRight[i] =
                this.shelvesR.process(r + wet * phaser.process(1, r)) * gain;
        }
    }

    protected clear() {
        this.phaser.clear();
        this.shelvesL.clear();
        this.shelvesR.clear();
    }

    protected update() {
        const p = this.parameters;
        this.phaser.setManual(this.controlled(0, 0));
        this.phaser.setRate(rate1(this.controlled(1, 1)));
        // The depth word is the chorus swing in ms over 16
        this.phaser.setDepth(modulationDepth(p[2]) / 16);
        this.phaser.setResonance(p[3]);
        // The chain runs at 1/8 of the 127/128 input and comes out x 8 the mix level
        this.wet = levelGain(p[4]) * (127 / 128);
        this.shelvesL.setLow(ShelfCorners.low200, shelfGain(p[16]));
        this.shelvesL.setHigh(ShelfCorners.high4k, shelfGain(p[17]));
        this.shelvesR.setLow(ShelfCorners.low200, shelfGain(p[16]));
        this.shelvesR.setHigh(ShelfCorners.high4k, shelfGain(p[17]));
        this.gain = levelGain(p[19]) * STAGE_GAIN;
    }
}
