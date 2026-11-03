import type { DelayMemory } from "../blocks/delay_memory";
import {
    balanceDry,
    balanceWet,
    levelGain,
    panLeft,
    STAGE_GAIN
} from "../glue";
import { RingModulator } from "../blocks/ring_modulator";
import { peakingGain } from "../blocks/peaking_band";
import { PEAKING_TABLE, peakingEntry } from "../peaking_table";
import { PitchShifter } from "../blocks/pitch_shifter";
import { pitchRatio, pitchWindow, ringFrequency } from "../conversion";
import { GSMulti, MultiDelay, MultiEQ, MultiPhaser } from "./guitar_multi";

/**
 * The input gain of each channel.
 */
const INPUT_GAIN = 127 / 128;

/**
 * The pitch shifter's input, a full 7 bit gain byte.
 */
const SHIFTER_INPUT = 127 / 128;

/**
 * The shifted voice goes into both channels at the center pan's gain.
 */
const PITCH_GAIN = panLeft(64);

/**
 * Keyboard Multi (`05 00`): per channel `ring modulator -> 3-band EQ`, then the pitch shifter, the phaser and the
 * delay, each on the mono sum of both channels with its wet signal added to each.
 *
 * The shared stage reads the left input one 32 kHz sample late and writes the right output one sample late, on both
 * hardware units. The whole chain runs on the skewed inputs of a `MonoMix` and the right output lags (Rhodes Multi).
 *
 * After a type select the right channel's mid band boosts four times as much as the left (its first coefficient's
 * scale bit is set): +12.3 dB instead of the default +5 dB at 200 Hz. The SC-88Pro has it too, and at 200 Hz it even
 * keeps it after mid band changes (not modeled). SC-VA rewrites the band with any mid band change, so does this.
 * Parameters: 1 ring modulator frequency, 2 its balance, 3 low gain, 4 mid frequency (EQ column), 5 mid Q, 6 mid gain,
 * 7 high gain, 8 pitch coarse, 9 fine, 10 mode, 11 pitch balance, 12 phaser manual, 13 rate (Rate2 column), 14 depth,
 * 15 resonance, 16 mix, 17 delay time (Dly4 column), 18 feedback, 19 delay level, 20 level. EFX control source 1
 * moves the ring modulator frequency, source 2 its balance.
 * @internal
 */
export class GSKeyboardMulti extends GSMulti {
    public readonly type = 0x05_00;
    protected readonly defaults = new Uint8Array([
        0x32, 0x14, 0x43, 0x00, 0x02, 0x45, 0x3d, 0x47, 0x40, 0x00, 0x27, 0x24,
        0x08, 0x5a, 0x50, 0x4b, 0x14, 0x40, 0x28, 0x60
    ]);
    // The coarse pitch is 40-76 (-24 to +12 semitones)
    protected readonly limits = { 4: 4, 7: 76, 9: 4 };
    protected readonly minimums = { 7: 40 };
    private readonly ring: RingModulator;
    private readonly eqL: MultiEQ;
    private readonly eqR: MultiEQ;
    private readonly shifter: PitchShifter;
    private readonly phaser: MultiPhaser;
    private readonly delay: MultiDelay;
    /**
     * The right mid band as after a type select (until a mid band parameter changes).
     */
    private presetBand = true;
    private ringDry = 0;
    private ringWet = 0;
    private pitchDry = 0;
    private pitchWet = 0;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory);
        this.ring = new RingModulator(sampleRate);
        // The hardware steps the carrier's phase once before its first sample (one 32 kHz step)
        this.ring.setStartDelay(1 - sampleRate / 32_000);
        this.eqL = new MultiEQ(sampleRate);
        this.eqR = new MultiEQ(sampleRate);
        this.shifter = new PitchShifter(sampleRate, memory, 1);
        this.phaser = new MultiPhaser(sampleRate);
        this.delay = new MultiDelay(sampleRate, memory);
        this.reset();
    }

    public reset() {
        this.presetBand = true;
        super.reset();
    }

    public setParameter(parameter: number, value: number) {
        // Like SC-VA, any change of the mid band writes both bands
        if (
            parameter >= 3 &&
            parameter <= 5 &&
            value !== this.parameters[parameter] &&
            (parameter !== 4 || value <= 4)
        ) {
            this.presetBand = false;
        }
        super.setParameter(parameter, value);
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const { mix, ring, shifter, phaser, delay } = this;
        for (let i = 0; i < sampleCount; i++) {
            mix.process(inputLeft[i], inputRight[i]);
            let l = mix.skewedLeft * INPUT_GAIN;
            let r = mix.skewedRight * INPUT_GAIN;

            ring.process();
            const ringGain = this.ringDry + this.ringWet * ring.carrier;
            l = this.eqL.process(l * ringGain);
            r = this.eqR.process(r * ringGain);

            shifter.process(0.5 * (l + r) * SHIFTER_INPUT);
            const shifted = this.pitchWet * shifter.output[0];
            l = this.pitchDry * l + shifted;
            r = this.pitchDry * r + shifted;

            phaser.process(l, r);
            delay.process(phaser.left, phaser.right);
            this.output(delay.left, delay.right, outputLeft, outputRight, i);
        }
    }

    protected clear() {
        super.clear();
        this.ring.clear();
        this.eqL.clear();
        this.eqR.clear();
        this.shifter.clear();
        this.phaser.clear();
        this.delay.clear();
    }

    protected update() {
        const p = this.parameters;
        this.ring.setFrequency(ringFrequency(this.controlled(0, 0)));
        const balance = this.controlled(1, 1);
        this.ringDry = balanceDry(balance);
        this.ringWet = balanceWet(balance);

        this.eqL.setShelves(p[2], p[6]);
        this.eqR.setShelves(p[2], p[6]);
        this.eqL.setMid(p[3], p[4], p[5]);
        if (this.presetBand) {
            // Four times the boost: the peaking section is 1 + (G - 1) x band pass
            const e = peakingEntry(p[3] >> 3, p[4], peakingGain(p[5]));
            const boost = 1 + 4 * (10 ** (PEAKING_TABLE[e + 2] / 20) - 1);
            this.eqR.mid.set(
                PEAKING_TABLE[e],
                PEAKING_TABLE[e + 1],
                20 * Math.log10(boost)
            );
        } else {
            this.eqR.setMid(p[3], p[4], p[5]);
        }

        this.shifter.setVoice(0, pitchRatio(p[7], p[8]), pitchWindow(p[9]));
        this.pitchDry = balanceDry(p[10]);
        this.pitchWet = balanceWet(p[10]) * PITCH_GAIN;

        this.phaser.update(p[11], p[12], p[13], p[14], p[15]);
        this.delay.update(p[16], p[17], p[18]);

        this.gain = levelGain(p[19]) * STAGE_GAIN;
    }
}
