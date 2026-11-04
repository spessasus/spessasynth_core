import { GSEffect } from "../gs_effect";
import {
    levelGain,
    panLeft,
    panRight,
    saturate,
    shelfGain,
    STAGE_GAIN
} from "../glue";
import { MonoMix } from "../blocks/mono_mix";
import {
    dampCorner,
    DC_BLOCKER_HZ,
    FirstOrderFilter
} from "../blocks/first_order_filter";
import {
    NoiseGenerator,
    setColumnHighPass,
    setColumnLowPass
} from "../blocks/noise_generator";
import { ShelfCorners, ShelfEQ } from "../blocks/shelf_eq";
import { MonoPan } from "../blocks/mono_pan";

/**
 * The chains run on the doubled input with the shared stage's 127/128 twice (this type uses the alternate routing)
 * and one more 127/128.
 */
const INPUT_GAIN = 2 * (127 / 128) ** 3;

/**
 * The output half: the shared stage halves the output again, with its last 127/128 (the chains' own 127/128 is not
 * part of the stage).
 */
const OUTPUT_GAIN = (STAGE_GAIN * 127) / 128 / INPUT_GAIN;

/**
 * The shaper per Lo-Fi type (1-6): `a x + b saturate(4 x abs(x)) + c saturate(16 x^3)` over 128, per chain (the hardware's
 * tables differ by a step here and there). Type 1 is linear, 6 the hardest.
 */
// prettier-ignore
const SHAPES = [
    [[92, 0, 0], [72, 23, 3], [66, 19, 12], [55, 26, 17], [37, 37, 37], [38, 75, 15]],
    [[92, 0, 0], [73, 22, 4], [67, 18, 13], [56, 25, 18], [38, 36, 38], [39, 74, 16]]
].map((chain) => chain.map((shape) => shape.map((v) => v / 128)));

/**
 * The radio's modulator (the SC-88Pro's, from detune 125): one sine at 32000 / 17 Hz.
 */
const RADIO_HZ = 32_000 / 17;

/**
 * The modulator's amplitude.
 */
const RADIO_DEPTH = 0.156;

/**
 * The radio noise's gain after its low pass.
 */
const RADIO_NOISE_GAIN = 0.078;

/**
 * One chain: DC blocker, shaper, x 2 into the filter.
 */
class LoFiShaperChain {
    public dry = 0;
    private readonly dcBlocker: FirstOrderFilter;
    private readonly filter: FirstOrderFilter;
    private shape: number[] = [1, 0, 0];

    public constructor(sampleRate: number) {
        this.dcBlocker = new FirstOrderFilter(sampleRate);
        this.dcBlocker.setHighPass(DC_BLOCKER_HZ);
        this.filter = new FirstOrderFilter(sampleRate);
    }

    /**
     * @param shape The shaper's a, b and c.
     * @param type The filter type (0 off, 1 LPF, 2 HPF).
     * @param cutoff The Cut column value.
     */
    public set(shape: number[], type: number, cutoff: number) {
        this.shape = shape;
        if (type === 1) setColumnLowPass(this.filter, cutoff, false);
        else if (type === 2) setColumnHighPass(this.filter, cutoff);
        else this.filter.setGain(127 / 128);
    }

    public process(x: number) {
        const h = (this.dry = saturate(this.dcBlocker.process(x)));
        const shape = this.shape;
        const y = saturate(
            shape[0] * h +
                shape[1] * saturate(4 * h * Math.abs(h)) +
                shape[2] * saturate(16 * h * h * h)
        );
        return saturate(
            (127 / 128) * saturate(this.filter.process(saturate(2 * y)))
        );
    }

    public clear() {
        this.dcBlocker.clear();
        this.filter.clear();
        this.dry = 0;
    }
}

/**
 * Lo-Fi 2 (`01 73`): per chain `DC blocker -> shaper -> filter -> radio`, plus the noise sources, mixed with the
 * input by the balance, then the EQ. Stereo runs a chain per side, mono one chain on `L+R` through the pan.
 * Parameters: 1 lo-fi type, 2 filter type (off, LPF, HPF), 3 cutoff (Cut column), 4 radio detune, 5 radio noise
 * level, 6 W/P select, 7 W/P low pass (LPF column), 8 W/P level, 9 disc type (LP, EP, SP, RND), 10 disc low pass,
 * 11 disc level, 12 hum type (50, 60 Hz), 13 hum low pass, 14 hum level, 15 mono/stereo, 16 balance (the pan law),
 * 17 low gain, 18 high gain, 19 pan (mono only), 20 level. EFX control source 1 modulates the detune, source 2 the
 * balance.
 * @internal
 */
export class GSLoFi2 extends GSEffect {
    public readonly type = 0x01_73;
    protected readonly defaults = new Uint8Array([
        0x01, 0x01, 0x24, 0x00, 0x40, 0x01, 0x7f, 0x00, 0x00, 0x7f, 0x00, 0x00,
        0x7f, 0x00, 0x01, 0x7f, 0x40, 0x40, 0x40, 0x7f
    ]);
    protected readonly limits = { 0: 5, 1: 2, 5: 1, 8: 3, 11: 1, 14: 1 };
    private readonly mix: MonoMix;
    private readonly chainL: LoFiShaperChain;
    private readonly chainR: LoFiShaperChain;
    private readonly noise: NoiseGenerator;
    private readonly radioNoise: FirstOrderFilter;
    private readonly shelvesL: ShelfEQ;
    private readonly shelvesR: ShelfEQ;
    private readonly pan: MonoPan;
    private readonly radioStep: number;
    /**
     * The radio noise's spread at this rate: drawn per host sample, so scaled to the 32 kHz density under its low pass.
     */
    private readonly radioSpread: number;
    /**
     * The radio's noise of this sample (`radio()` returns the modulator).
     */
    private radioNoiseValue = 0;
    private stereo = true;
    private detune = 0;
    private noiseLevel = 0;
    private radioOn = false;
    private radioPhase = 0;
    private seed = 7;
    private dry = 0;
    private wet = 0;
    private gain = 0;

    public constructor(sampleRate: number) {
        super(sampleRate);
        this.mix = new MonoMix(sampleRate);
        this.chainL = new LoFiShaperChain(sampleRate);
        this.chainR = new LoFiShaperChain(sampleRate);
        this.noise = new NoiseGenerator(sampleRate);
        // The radio noise: a chaotic map through a one-pole of pole 0.5 at 32 kHz (3.68 kHz), like SCCore.dll
        this.radioNoise = new FirstOrderFilter(sampleRate);
        this.radioNoise.setDamp(dampCorner(0.5));
        this.shelvesL = new ShelfEQ(sampleRate);
        this.shelvesR = new ShelfEQ(sampleRate);
        this.pan = new MonoPan(sampleRate);
        this.radioStep = RADIO_HZ / sampleRate;
        // RMS 0.49 from a uniform draw of -1 to 1, whose RMS is 1/sqrt(3)
        this.radioSpread = 0.49 * Math.sqrt(3 * (sampleRate / 32_000));
        this.reset();
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const { chainL, chainR, dry, wet, gain } = this;
        for (let i = 0; i < sampleCount; i++) {
            const noise = this.noise.process();
            const radio = this.radio();
            if (this.stereo) {
                const l = this.tune(
                    chainL.process(inputLeft[i] * INPUT_GAIN),
                    radio
                );
                const r = this.tune(
                    chainR.process(inputRight[i] * INPUT_GAIN),
                    radio
                );
                outputLeft[i] =
                    this.shelvesL.process(
                        wet * saturate(l + noise) + dry * chainL.dry
                    ) * gain;
                outputRight[i] =
                    this.shelvesR.process(
                        wet * saturate(r + noise) + dry * chainR.dry
                    ) * gain;
            } else {
                const x =
                    this.mix.process(inputLeft[i], inputRight[i]) * INPUT_GAIN;
                const y = this.tune(chainL.process(x), radio);
                this.pan.process(
                    this.shelvesL.process(
                        wet * saturate(y + noise) + dry * chainL.dry
                    )
                );
                outputLeft[i] = this.pan.left;
                outputRight[i] = this.pan.right;
            }
        }
    }

    protected clear() {
        this.mix.clear();
        this.chainL.clear();
        this.chainR.clear();
        this.noise.clear();
        this.radioNoise.clear();
        this.shelvesL.clear();
        this.shelvesR.clear();
        this.pan.clear();
        this.radioPhase = 0;
        this.seed = 7;
    }

    protected update() {
        const p = this.parameters;
        this.chainL.set(SHAPES[0][p[0]], p[1], p[2]);
        this.chainR.set(SHAPES[1][p[0]], p[1], p[2]);
        const detune = this.controlled(0, 3);
        this.detune = detune / 128;
        // The SC-88Pro only modulates from 125 on, SC-VA sweeps two oscillators with the detune
        this.radioOn = detune >= 125;
        this.noiseLevel = p[4] / 128;
        this.noise.setWhite(p[5] === 1, p[6], levelGain(p[7]));
        this.noise.setDisc(p[8], p[9], levelGain(p[10]));
        this.noise.setHum(p[11], p[12], levelGain(p[13]));
        this.stereo = p[14] === 1;
        const balance = this.controlled(1, 15);
        this.dry = panLeft(balance);
        this.wet = panRight(balance);
        this.shelvesL.setLow(ShelfCorners.low200, shelfGain(p[16]));
        this.shelvesL.setHigh(ShelfCorners.high4k, shelfGain(p[17]));
        this.shelvesR.setLow(ShelfCorners.low200, shelfGain(p[16]));
        this.shelvesR.setHigh(ShelfCorners.high4k, shelfGain(p[17]));
        const level = levelGain(p[19]) * OUTPUT_GAIN;
        this.pan.set(p[18], level);
        // Mono has the level in the pan
        this.gain = this.stereo ? level : 1;
    }

    /**
     * Steps the radio's modulator and noise, returns the modulator.
     */
    private radio() {
        if (!this.radioOn) return 0;
        this.radioPhase += this.radioStep;
        if (this.radioPhase >= 1) this.radioPhase -= 1;
        this.seed = (Math.imul(this.seed, 1_664_525) + 1_013_904_223) | 0;
        // A noise of mean -0.27 and RMS 0.49 like the chaotic map (at 32 kHz), then the 3.68 kHz low pass
        this.radioNoiseValue =
            RADIO_NOISE_GAIN *
            this.radioNoise.process(
                this.radioSpread * (this.seed / 2_147_483_648) - 0.27
            );
        return RADIO_DEPTH * Math.sin(2 * Math.PI * this.radioPhase);
    }

    /**
     * The radio: below detune 125 a crossfade to silence, from 125 the modulator on the faded signal and the noise.
     * @param x The chain's output.
     * @param modulator The modulator's sample.
     */
    private tune(x: number, modulator: number) {
        const faded = (1 - this.detune) * x;
        if (!this.radioOn) return faded;
        return (
            faded +
            this.detune *
                saturate(
                    4 *
                        modulator *
                        (faded + this.noiseLevel * this.radioNoiseValue)
                )
        );
    }
}
