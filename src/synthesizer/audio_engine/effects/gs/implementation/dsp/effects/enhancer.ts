import { GSEffect } from "../gs_effect";
import { levelGain, shelfGain, STAGE_GAIN } from "../glue";
import { Enhancer } from "../blocks/enhancer";
import { ShelfCorners, ShelfEQ } from "../blocks/shelf_eq";

/**
 * Enhancer (`01 02`): a stereo high frequency enhancer, then the 2-band EQ.
 * Parameters: 1 sensitivity, 2 mix level, 17 low gain, 18 high gain, 20 level. EFX control source 1 modulates the
 * sensitivity, source 2 the mix level.
 * @internal
 */
export class GSEnhancer extends GSEffect {
    public readonly type = 0x01_02;
    protected readonly defaults = new Uint8Array([
        0x40, 0x7f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x43, 0x40, 0x00, 0x7f
    ]);
    private readonly enhancerL: Enhancer;
    private readonly enhancerR: Enhancer;
    private readonly shelvesL: ShelfEQ;
    private readonly shelvesR: ShelfEQ;
    private gain = 0;

    public constructor(sampleRate: number) {
        super(sampleRate);
        this.enhancerL = new Enhancer(sampleRate);
        this.enhancerR = new Enhancer(sampleRate);
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
        const gain = this.gain;
        for (let i = 0; i < sampleCount; i++) {
            const l = this.shelvesL.process(
                this.enhancerL.process(inputLeft[i])
            );
            const r = this.shelvesR.process(
                this.enhancerR.process(inputRight[i])
            );
            outputLeft[i] = l * gain;
            outputRight[i] = r * gain;
        }
    }

    protected clear() {
        this.enhancerL.clear();
        this.enhancerR.clear();
        this.shelvesL.clear();
        this.shelvesR.clear();
    }

    protected update() {
        const p = this.parameters;
        // The sensitivity is 0 dB at 16 and grows linearly, the mix follows the level curve
        const sensitivity = Math.max(this.controlled(0, 0), 1) / 16;
        const mix = levelGain(this.controlled(1, 1));
        this.enhancerL.set(sensitivity, mix);
        this.enhancerR.set(sensitivity, mix);
        this.shelvesL.setLow(ShelfCorners.low200, shelfGain(p[16]));
        this.shelvesL.setHigh(ShelfCorners.high4k, shelfGain(p[17]));
        this.shelvesR.setLow(ShelfCorners.low200, shelfGain(p[16]));
        this.shelvesR.setHigh(ShelfCorners.high4k, shelfGain(p[17]));
        // The enhancer input has one more 127/128 than the output stage
        this.gain = (levelGain(p[19]) * STAGE_GAIN * 127) / 128;
    }
}
