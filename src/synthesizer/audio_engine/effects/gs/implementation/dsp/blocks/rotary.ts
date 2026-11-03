import type { DelayMemory } from "./delay_memory";
import type { DelayLine } from "./delay_line";
import { Biquad } from "./biquad";
import { DC_BLOCKER_HZ, FirstOrderFilter } from "./first_order_filter";
import { tremoloRest } from "./tremolo";

/**
 * The horn crossover, the hardware's 32 kHz biquad `b0 (1 - z^-1)^2 / (1 - a1 z^-1 - a2 z^-2)`, on the analog side
 * (the inverse bilinear transform): a second order high pass at 2000 Hz with a Q of 5 (+14 dB at 2 kHz). The
 * SC-88Pro has the resonance too.
 */
const HORN_B0 = 0.926_483_154_296_875;
const HORN_A1 = 1.779_663_085_937_5;
const HORN_A2 = -0.926_269_531_25;
const HORN_D2 = 1 + HORN_A1 - HORN_A2;
const HORN_D1 = 2 + 2 * HORN_A2;
const HORN_D0 = 1 - HORN_A1 - HORN_A2;
const HORN_HZ = (32_000 / Math.PI) * Math.atan(Math.sqrt(HORN_D0 / HORN_D2));
const HORN_Q = Math.sqrt(HORN_D0 * HORN_D2) / HORN_D1;
const HORN_GAIN = (4 * HORN_B0) / HORN_D2;

/**
 * The drum crossover: the hardware's one-pole low pass (pole 0.668, unity at DC), its corner is 2000 Hz too.
 */
const DRUM_POLE = 0.668_151_855_468_75;
const DRUM_HZ =
    (32_000 / Math.PI) * Math.atan((1 - DRUM_POLE) / (1 + DRUM_POLE));

/**
 * The Doppler swing of the horn (a parabola over the turn) and the drum (a triangle), in 32 kHz samples.
 */
const HORN_SWING = 33.25;
const DRUM_SWING = 20;

/**
 * The fixed taps in 32 kHz samples: the horn's (3.84 and 28.2 ms, one per microphone) and the drum's (10.25 and
 * 37.1 ms).
 */
const HORN_TAP_LEFT = 123;
const HORN_TAP_RIGHT = 901;
const DRUM_TAP_LEFT = 328;
const DRUM_TAP_RIGHT = 1188;

/**
 * The rotary speaker: a crossover splits the input into a horn and a drum line, each with a turning rotor.
 *
 * The horn is picked up by two microphones half a turn apart. Each hears the horn line through a Doppler read that
 * swings with the square of the rotor phase, mixed with a fixed tap, and an amplitude modulation (the Separation)
 * that is loud for one microphone while it is quiet for the other. The drum line has one Doppler read (a triangle
 * over the turn, on both sides) and a fixed tap per side. The left output is the first microphone, the right one the
 * second, each minus its drum tap and 1.5 x the drum's Doppler read.
 *
 * The rotors run at the slow or fast rate and ramp between them with their own time constants. The right output
 * comes one 32 kHz sample after the left one, as from the shared stage, so its reads are one sample later.
 * @internal
 */
export class Rotary {
    public left = 0;
    public right = 0;
    private readonly hornLine: DelayLine;
    private readonly drumLine: DelayLine;
    private readonly dcBlocker: FirstOrderFilter;
    private readonly hornCrossover: Biquad;
    private readonly drumCrossover: FirstOrderFilter;
    private readonly sampleRate: number;
    /**
     * One 32 kHz sample in host samples.
     */
    private readonly step: number;
    private hornGain = 0;
    private drumGain = 0;
    private depth = 0;
    private rest = 1;
    private hornTarget = 0;
    private drumTarget = 0;
    private hornSpeed = 0;
    private drumSpeed = 0;
    private hornRamp = 0;
    private drumRamp = 0;
    private hornPhase = 0;
    private drumPhase = 0;

    /**
     * @param sampleRate The sample rate.
     * @param memory The delay memory.
     */
    public constructor(sampleRate: number, memory: DelayMemory) {
        this.sampleRate = sampleRate;
        this.step = sampleRate / 32_000;
        // Two more 32 kHz samples for the right side's lag and the interpolation
        this.hornLine = memory.line(
            Math.ceil((HORN_TAP_RIGHT + 2) * this.step)
        );
        this.drumLine = memory.line(
            Math.ceil((DRUM_TAP_RIGHT + 2) * this.step)
        );
        this.dcBlocker = new FirstOrderFilter(sampleRate);
        this.dcBlocker.setHighPass(DC_BLOCKER_HZ);
        this.hornCrossover = new Biquad(sampleRate);
        const w = this.hornCrossover.prewarp(HORN_HZ);
        this.hornCrossover.setAnalog(HORN_GAIN, 0, 0, 1, w / HORN_Q, w * w);
        this.drumCrossover = new FirstOrderFilter(sampleRate);
        this.drumCrossover.setLowPass(DRUM_HZ);
    }

    /**
     * Wraps a rotor phase to -1 to 1 (a turn is 2).
     * @param phase The phase.
     */
    private static wrap(phase: number) {
        return phase >= 1 ? phase - 2 : phase < -1 ? phase + 2 : phase;
    }

    /**
     * @param horn The horn rotor's rate in Hz.
     * @param drum The drum rotor's rate in Hz.
     */
    public setRates(horn: number, drum: number) {
        this.hornTarget = horn;
        this.drumTarget = drum;
    }

    /**
     * @param horn The horn rotor's ramp time constant in seconds.
     * @param drum The drum rotor's.
     */
    public setAcceleration(horn: number, drum: number) {
        // The ramps' step per 32 kHz sample is 1/32000 of the time constant
        const perSample = 32_000 / this.sampleRate;
        this.hornRamp = 1 - (1 - 1 / (32_000 * horn)) ** perSample;
        this.drumRamp = 1 - (1 - 1 / (32_000 * drum)) ** perSample;
    }

    /**
     * @param horn The horn line's gain (the high level).
     * @param drum The drum line's gain (the low level).
     */
    public setLevels(horn: number, drum: number) {
        this.hornGain = horn;
        this.drumGain = drum;
    }

    /**
     * @param depth The horn's amplitude modulation, 0 to 127/128 (the Separation).
     */
    public setSeparation(depth: number) {
        this.depth = depth;
        this.rest = tremoloRest(depth);
    }

    /**
     * Puts both rotors at their target rates, as after a type select.
     */
    public settle() {
        this.hornSpeed = this.hornTarget;
        this.drumSpeed = this.drumTarget;
    }

    public process(x: number) {
        const { hornLine, drumLine, step } = this;
        const u = 0.5 * this.dcBlocker.process(x);
        hornLine.write(this.hornGain * this.hornCrossover.process(u));
        drumLine.write(this.drumGain * this.drumCrossover.process(u));

        this.hornSpeed += this.hornRamp * (this.hornTarget - this.hornSpeed);
        this.drumSpeed += this.drumRamp * (this.drumTarget - this.drumSpeed);
        const hornPhase = (this.hornPhase = Rotary.wrap(
            this.hornPhase + (2 * this.hornSpeed) / this.sampleRate
        ));
        const drumPhase = (this.drumPhase = Rotary.wrap(
            this.drumPhase + (2 * this.drumSpeed) / this.sampleRate
        ));
        // The right side runs a 32 kHz sample behind: the phases of then, every read one sample later
        const p = Rotary.wrap(hornPhase - this.hornSpeed / 16_000);
        const d = Rotary.wrap(drumPhase - this.drumSpeed / 16_000);

        // Microphone 1 hears the horn as the rotor phase says, microphone 2 half a turn later
        const left = Rotary.wrap(hornPhase + 0.5);
        const mic1 =
            (this.rest + this.depth * Math.abs(left)) *
            0.5 *
            (hornLine.readGrid(HORN_SWING * hornPhase * hornPhase, step, 0) +
                hornLine.readGrid(HORN_TAP_LEFT, step, 0));
        const later = Rotary.wrap(p + 1);
        const mic2 =
            (this.rest + this.depth * (1 - Math.abs(Rotary.wrap(p + 0.5)))) *
            0.5 *
            (hornLine.readGrid(HORN_SWING * later * later + 1, step, 0) +
                hornLine.readGrid(HORN_TAP_RIGHT + 1, step, 0));
        const drumLeft = drumLine.readGrid(
            DRUM_SWING * Math.abs(drumPhase),
            step,
            0
        );
        const drumRight = drumLine.readGrid(
            DRUM_SWING * Math.abs(d) + 1,
            step,
            0
        );
        this.left =
            (127 / 32) * mic1 -
            drumLine.readGrid(DRUM_TAP_LEFT, step, 0) -
            1.5 * drumLeft;
        this.right =
            (127 / 32) * mic2 -
            drumLine.readGrid(DRUM_TAP_RIGHT + 1, step, 0) -
            1.5 * drumRight;
    }

    public clear() {
        this.hornLine.clear();
        this.drumLine.clear();
        this.dcBlocker.clear();
        this.hornCrossover.clear();
        this.drumCrossover.clear();
        this.hornPhase = this.drumPhase = 0;
        this.left = this.right = 0;
    }
}
