import { GSEffect } from "../gs_effect";
import { levelGain, STAGE_GAIN } from "../glue";
import { MonoMix } from "../blocks/mono_mix";
import { PeakingBand, peakingGain } from "../blocks/peaking_band";
import { MonoPan } from "../blocks/mono_pan";

/**
 * The peaking tables of the eight bands: 250, 500, 1000, 1250, 2000, 3150, 4000 and 8000 Hz.
 */
const BAND_TABLES = [1, 4, 7, 8, 10, 12, 13, 16];

/**
 * Spectrum (`01 01`): a mono 8-band graphic EQ, panned.
 * Parameters: 1-8 band gains, 9 Q, 19 pan, 20 level. EFX control source 1 modulates the pan, source 2 the level.
 * @internal
 */
export class GSSpectrum extends GSEffect {
    public readonly type = 0x01_01;
    protected readonly defaults = new Uint8Array([
        0x3c, 0x41, 0x43, 0x46, 0x42, 0x3f, 0x3c, 0x3b, 0x02, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x7f
    ]);
    protected readonly limits = { 8: 4 };
    private readonly mix: MonoMix;
    private readonly bands: PeakingBand[];
    private readonly pan: MonoPan;

    public constructor(sampleRate: number) {
        super(sampleRate);
        this.mix = new MonoMix(sampleRate);
        this.bands = BAND_TABLES.map(() => new PeakingBand(sampleRate));
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
        const bands = this.bands;
        for (let i = 0; i < sampleCount; i++) {
            let x = this.mix.process(inputLeft[i], inputRight[i]);
            for (let b = 0; b < BAND_TABLES.length; b++) {
                x = bands[b].process(x);
            }
            this.pan.process(x);
            outputLeft[i] = this.pan.left;
            outputRight[i] = this.pan.right;
        }
    }

    protected clear() {
        this.mix.clear();
        for (const band of this.bands) band.clear();
        this.pan.clear();
    }

    protected update() {
        const p = this.parameters;
        for (let b = 0; b < this.bands.length; b++) {
            this.bands[b].setEntry(BAND_TABLES[b], p[8], peakingGain(p[b]));
        }
        this.pan.set(
            this.controlled(0, 18),
            levelGain(this.controlled(1, 19)) * STAGE_GAIN
        );
    }
}
