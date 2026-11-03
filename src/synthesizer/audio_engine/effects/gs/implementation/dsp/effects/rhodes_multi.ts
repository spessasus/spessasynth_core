import type { DelayMemory } from "../blocks/delay_memory";
import { levelGain, LINE_INPUT, STAGE_GAIN } from "../glue";
import { Enhancer } from "../blocks/enhancer";
import { LFO } from "../blocks/lfo";
import { ModulatedDelay } from "../blocks/modulated_delay";
import { DC_BLOCKER_HZ, FirstOrderFilter } from "../blocks/first_order_filter";
import { Tremolo } from "../blocks/tremolo";
import {
    cutoff,
    feedbackGain,
    modulationDepth,
    preDelay,
    rate2,
    SWING_MS
} from "../conversion";
import { GSMulti, MultiPhaser } from "./guitar_multi";

/**
 * The input gain of each channel (the enhancer's).
 */
const INPUT_GAIN = 127 / 128;

/**
 * The chorus stage's dry gain.
 */
const CHORUS_DRY = 127 / 128;

/**
 * Rhodes Multi (`04 06`): per channel `enhancer -> + phaser -> + chorus/flanger -> tremolo/auto pan`. The phaser and
 * the chorus/flanger run on the mono sum of both channels and add their wet signal to each.
 *
 * The shared stage reads the left input one 32 kHz sample late and writes the right output one sample late, on both
 * hardware units. The mono stages mix both inputs into each output, so that shows (the phaser notches of the two
 * outputs split). The whole chain runs on the skewed inputs of a `MonoMix` and the right output lags.
 * Parameters: 1 enhancer sensitivity, 2 enhancer mix, 3 phaser manual, 4 rate (Rate2 column), 5 depth,
 * 6 resonance, 7 mix, 8 chorus or flanger, 9 its low pass (Cut column, 120-127 off), 10 pre delay, 11 rate (Rate2),
 * 12 depth, 13 flanger feedback, 14 level, 15 tremolo or auto pan, 16 wave, 17 rate (Rate2), 18 depth, 19 switch,
 * 20 level. EFX control source 1 moves the tremolo rate, source 2 its depth.
 * @internal
 */
export class GSRhodesMulti extends GSMulti {
    public readonly type = 0x04_06;
    protected readonly defaults = new Uint8Array([
        0x40, 0x40, 0x24, 0x10, 0x20, 0x10, 0x40, 0x00, 0x7f, 0x0a, 0x08, 0x40,
        0x68, 0x7f, 0x01, 0x02, 0x3c, 0x40, 0x01, 0x7f
    ]);
    protected readonly limits = { 7: 1, 14: 1, 15: 4, 18: 1 };
    private readonly enhancerL: Enhancer;
    private readonly enhancerR: Enhancer;
    private readonly phaser: MultiPhaser;
    private readonly lfo: LFO;
    private readonly chorus: ModulatedDelay;
    private readonly dcBlockerL: FirstOrderFilter;
    private readonly dcBlockerR: FirstOrderFilter;
    private readonly tremolo: Tremolo;
    private chorusWet = 0;
    private tremoloOn = false;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory);
        this.enhancerL = new Enhancer(sampleRate);
        this.enhancerR = new Enhancer(sampleRate);
        this.phaser = new MultiPhaser(sampleRate);
        this.lfo = new LFO(sampleRate);
        this.chorus = new ModulatedDelay(sampleRate, memory, 2, 101 + SWING_MS);
        this.dcBlockerL = new FirstOrderFilter(sampleRate);
        this.dcBlockerL.setHighPass(DC_BLOCKER_HZ);
        this.dcBlockerR = new FirstOrderFilter(sampleRate);
        this.dcBlockerR.setHighPass(DC_BLOCKER_HZ);
        this.tremolo = new Tremolo(sampleRate);
        this.reset();
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const { mix, phaser, chorus, tremolo } = this;
        for (let i = 0; i < sampleCount; i++) {
            mix.process(inputLeft[i], inputRight[i]);
            let l = this.enhancerL.process(mix.skewedLeft * INPUT_GAIN);
            let r = this.enhancerR.process(mix.skewedRight * INPUT_GAIN);

            phaser.process(l, r);
            l = phaser.left;
            r = phaser.right;

            chorus.process(0.5 * (l + r) * LINE_INPUT, this.lfo.process());
            l = CHORUS_DRY * l + this.chorusWet * chorus.output[0];
            r = CHORUS_DRY * r + this.chorusWet * chorus.output[1];

            l = this.dcBlockerL.process(l);
            r = this.dcBlockerR.process(r);
            // The LFO runs with the switch off too
            tremolo.process();
            if (this.tremoloOn) {
                l *= tremolo.left;
                r *= tremolo.right;
            }
            this.output(l, r, outputLeft, outputRight, i);
        }
    }

    protected clear() {
        super.clear();
        this.enhancerL.clear();
        this.enhancerR.clear();
        this.phaser.clear();
        this.lfo.clear();
        this.chorus.clear();
        this.dcBlockerL.clear();
        this.dcBlockerR.clear();
        this.tremolo.clear();
    }

    protected update() {
        const p = this.parameters;
        // The sensitivity is 0 dB at 16 and grows linearly, the mix follows the level curve
        const sensitivity = Math.max(p[0], 1) / 16;
        this.enhancerL.set(sensitivity, levelGain(p[1]));
        this.enhancerR.set(sensitivity, levelGain(p[1]));

        this.phaser.update(p[2], p[3], p[4], p[5], p[6]);

        const flanger = p[7] === 1;
        const chorus = this.chorus;
        chorus.setCurve(flanger);
        for (let read = 0; read < 2; read++) {
            chorus.setPreDelay(read, preDelay(p[9]));
            chorus.setDepth(read, modulationDepth(p[11]));
        }
        // The chorus reads are half a cycle apart, the flanger's together
        chorus.setPhase(1, flanger ? 0 : 180);
        chorus.setFeedback(flanger ? feedbackGain(p[12]) : 0);
        // The tone filter's low pass, 120-127 is off (a plain 127/128, the filter's full gain byte)
        if (p[8] >= 120) chorus.tone.setGain(127 / 128);
        else chorus.tone.setTone(false, cutoff(p[8]));
        this.lfo.setRate(rate2(p[10]));
        this.chorusWet = levelGain(p[13]);

        this.tremoloOn = p[18] === 1;
        this.tremolo.setPan(p[14] === 1);
        this.tremolo.setWave(p[15]);
        this.tremolo.setRate(rate2(this.controlled(0, 16)));
        this.tremolo.setDepth(levelGain(this.controlled(1, 17)));

        this.gain = levelGain(p[19]) * STAGE_GAIN;
    }
}
