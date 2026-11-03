import { GSEffect } from "../gs_effect";
import { levelGain, MONO_INPUT, shelfGain, STAGE_OUTPUT } from "../glue";
import { MonoMix } from "../blocks/mono_mix";
import { Wah } from "../blocks/wah";
import { ShelfCorners, ShelfEQ } from "../blocks/shelf_eq";
import { MonoPan } from "../blocks/mono_pan";
import { modulationDepth, rate1 } from "../conversion";

/**
 * Auto Wah (`01 21`): `L+R -> wah -> EQ -> pan`.
 * Parameters: 1 filter type (LPF, BPF), 2 sens, 3 manual, 4 peak, 5 rate (Rate1 column), 6 depth, 7 polarity (down,
 * up), 17 low gain, 18 high gain, 19 pan, 20 level. EFX control source 1 moves the manual, source 2 the rate.
 * @internal
 */
export class GSAutoWah extends GSEffect {
    public readonly type = 0x01_21;
    protected readonly defaults = new Uint8Array([
        0x01, 0x00, 0x44, 0x3e, 0x28, 0x48, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x40, 0x40, 0x40, 0x60
    ]);
    protected readonly limits = { 0: 1, 6: 1 };
    private readonly mix: MonoMix;
    private readonly wah: Wah;
    private readonly shelves: ShelfEQ;
    private readonly pan: MonoPan;

    public constructor(sampleRate: number) {
        super(sampleRate);
        this.mix = new MonoMix(sampleRate);
        this.wah = new Wah(sampleRate);
        this.shelves = new ShelfEQ(sampleRate);
        this.pan = new MonoPan(sampleRate);
        this.reset();
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        for (let i = 0; i < sampleCount; i++) {
            const x =
                this.mix.process(inputLeft[i], inputRight[i]) * MONO_INPUT;
            this.pan.process(this.shelves.process(this.wah.process(x)));
            outputLeft[i] = this.pan.left;
            outputRight[i] = this.pan.right;
        }
    }

    protected clear() {
        this.mix.clear();
        this.wah.clear();
        this.shelves.clear();
        this.pan.clear();
    }

    protected update() {
        const p = this.parameters;
        this.wah.setFilterType(p[0] === 1);
        this.wah.setPeak(p[3]);
        this.wah.setSensitivity(levelGain(p[1]));
        this.wah.setManual(levelGain(this.controlled(0, 2)));
        this.wah.setRate(rate1(this.controlled(1, 4)));
        // The depth word is the chorus swing in ms over 16
        this.wah.setDepth(modulationDepth(p[5]) / 16);
        this.wah.setPolarity(p[6] === 1);
        this.shelves.setLow(ShelfCorners.low200, shelfGain(p[16]));
        this.shelves.setHigh(ShelfCorners.high4k, shelfGain(p[17]));
        // The pan stage has a gain of 4
        this.pan.set(p[18], levelGain(p[19]) * 4 * STAGE_OUTPUT);
    }
}
