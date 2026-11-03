import type { DelayMemory } from "../blocks/delay_memory";
import { OutputLag } from "../blocks/output_lag";
import { GSEffect } from "../gs_effect";
import { levelGain, shelfGain } from "../glue";
import { MonoMix } from "../blocks/mono_mix";
import { Drive, type DrivePreset } from "../blocks/drive";
import { Phaser } from "../blocks/phaser";
import { LFO } from "../blocks/lfo";
import { ModulatedDelay } from "../blocks/modulated_delay";
import { Delay } from "../blocks/delay";
import { Compressor, detectorGain, recoveryRate } from "../blocks/dynamics";
import { ShelfCorners, ShelfEQ } from "../blocks/shelf_eq";
import { PeakingBand } from "../blocks/peaking_band";
import {
    delay4,
    feedbackGain,
    hfDamp,
    modulationDepth,
    rate2,
    resonanceGain,
    SWING_MS
} from "../conversion";

/**
 * The fixed pre delay of the multis' chorus and flanger, in ms (16 samples at 32 kHz).
 */
const MODULATION_PRE_DELAY = 0.5;

/**
 * The dry gain of the chorus/flanger and delay stages, and the gain into their lines and into the phaser.
 */
const STAGE_DRY = 127 / 128;

/**
 * The gain after the wah of the multis.
 * @internal
 */
export const MULTI_WAH_GAIN = (127 / 32) * (127 / 128);

/**
 * The multis' drives see their input 128/127 hotter than the drive types do and give back 127/128 less after the
 * clipper (the same linear gain, a level 0.07 dB lower once they saturate).
 */
const DRIVE_INPUT = 128 / 127;
const DRIVE_OUTPUT = 127 / 128;

/**
 * The compressor of the multis (parameters 1-4: sustain, attack, level, switch): the Compressor's dynamics with
 * its post gain at +6 dB and a level after it. The compressor runs when it is switched off too.
 * @internal
 */
export class MultiCompressor {
    private readonly dynamics: Compressor;
    private on = false;

    /**
     * @param sampleRate The sample rate.
     * @param lookahead The lookahead in seconds, if not the Compressor's 1 ms.
     */
    public constructor(sampleRate: number, lookahead?: number) {
        this.dynamics = new Compressor(sampleRate, lookahead);
    }

    /**
     * @param parameters The type's parameters (0-3 are the compressor's).
     */
    public update(parameters: Uint8Array) {
        const d = this.dynamics;
        d.setRecoveryRate(recoveryRate(parameters[0]));
        d.setMakeup(detectorGain(parameters[1]));
        d.setPostGain(2 * levelGain(parameters[2]));
        this.on = parameters[3] === 1;
    }

    public process(x: number) {
        const y = this.dynamics.process(x);
        return this.on ? y : x;
    }

    public clear() {
        this.dynamics.clear();
    }
}

/**
 * The amp simulators of the drive section (the guitar and the bass one).
 * @internal
 */
export interface MultiAmp {
    /**
     * @param type The amp type parameter.
     */
    setType(type: number): void;
    process(x: number): number;
    clear(): void;
}

/**
 * How a multi builds its drive section.
 * @internal
 */
export interface MultiDriveOptions {
    /**
     * The drive of drive type 0.
     */
    overdrive: DrivePreset;
    /**
     * The drive of drive type 1.
     */
    distortion: DrivePreset;
    amp: MultiAmp;
    /**
     * The gain of the path around the section when the drive is off, 1 if missing.
     */
    bypassGain?: number;
    /**
     * A 2-band EQ (200 Hz and 4 kHz shelves) between the drive and the amp.
     */
    shelves?: boolean;
}

/**
 * The drive section of the guitar and bass multis: overdrive or distortion, in some of them the 2-band EQ, then
 * the amp simulator (switchable). The drive switch bypasses the whole section, the path around it goes through the
 * drive's DC blocker.
 * @internal
 */
export class MultiDrive {
    private readonly drive: Drive;
    /**
     * The gain of the path around the drive, on the drive's DC blocked input.
     */
    private readonly bypassGain: number;
    private readonly amp: MultiAmp;
    private readonly shelves: ShelfEQ | undefined;
    private readonly overdrive: DrivePreset;
    private readonly distortion: DrivePreset;
    private preset: DrivePreset | undefined;
    private driveOn = false;
    private ampOn = false;

    public constructor(sampleRate: number, options: MultiDriveOptions) {
        this.drive = new Drive(sampleRate);
        // The drive's input is DRIVE_INPUT times the section's
        this.bypassGain = (options.bypassGain ?? 1) / DRIVE_INPUT;
        this.amp = options.amp;
        this.shelves = options.shelves ? new ShelfEQ(sampleRate) : undefined;
        this.overdrive = options.overdrive;
        this.distortion = options.distortion;
    }

    /**
     * @param distortion The distortion instead of the overdrive.
     * @param drive The drive parameter.
     * @param ampType The amp type parameter.
     * @param ampOn The amp switch.
     * @param driveOn The drive switch.
     */
    public update(
        distortion: boolean,
        drive: number,
        ampType: number,
        ampOn: boolean,
        driveOn: boolean
    ) {
        const preset = distortion ? this.distortion : this.overdrive;
        // The filters only need a new design when the drive type changes
        if (preset !== this.preset) {
            this.preset = preset;
            this.drive.setPreset(preset);
        }
        this.drive.setDrive(drive);
        this.amp.setType(ampType);
        this.ampOn = ampOn;
        this.driveOn = driveOn;
    }

    /**
     * @param low The low gain parameter.
     * @param high The high gain parameter.
     */
    public setShelves(low: number, high: number) {
        this.shelves?.setLow(ShelfCorners.low200, shelfGain(low));
        this.shelves?.setHigh(ShelfCorners.high4k, shelfGain(high));
    }

    public process(x: number) {
        let driven = DRIVE_OUTPUT * this.drive.process(x * DRIVE_INPUT);
        if (this.shelves) driven = this.shelves.process(driven);
        // The amp runs when it is switched off too, so switching it on does not click
        const amp = this.amp.process(driven);
        if (this.ampOn) driven = amp;
        // Both paths run, so the drive switch does not click either
        return this.driveOn ? driven : this.drive.input * this.bypassGain;
    }

    public clear() {
        this.drive.clear();
        this.shelves?.clear();
        this.amp.clear();
    }
}

/**
 * The phaser of the keyboard multis: the mono sum of both channels into the phaser, its output added to each
 * channel at the mix level. Rate on the Rate2 column.
 * @internal
 */
export class MultiPhaser {
    public left = 0;
    public right = 0;
    private readonly phaser: Phaser;
    private wet = 0;

    public constructor(sampleRate: number) {
        this.phaser = new Phaser(sampleRate, 1);
    }

    /**
     * @param manual The manual parameter.
     * @param rate The rate parameter (Rate2 column).
     * @param depth The depth parameter.
     * @param resonance The resonance parameter.
     * @param mix The mix level parameter.
     */
    public update(
        manual: number,
        rate: number,
        depth: number,
        resonance: number,
        mix: number
    ) {
        const phaser = this.phaser;
        phaser.setManual(manual);
        phaser.setRate(rate2(rate));
        // The depth word is the chorus swing in ms over 16
        phaser.setDepth(modulationDepth(depth) / 16);
        phaser.setResonance(resonance);
        this.wet = levelGain(mix);
    }

    public process(left: number, right: number) {
        const phaser = this.phaser;
        phaser.step();
        // The chain runs at 1/8 of the 127/128 input and comes out x 8 the mix level
        const phased =
            this.wet * phaser.process(0, 0.5 * (left + right) * STAGE_DRY);
        this.left = left + phased;
        this.right = right + phased;
    }

    public clear() {
        this.phaser.clear();
    }
}

/**
 * The 3-band EQ of the multis: the low and high shelves (200 Hz and 4 kHz) and a peaking band.
 * @internal
 */
export class MultiEQ {
    /**
     * The peaking band, for Keyboard Multi's right band after a type select.
     */
    public readonly mid: PeakingBand;
    private readonly shelves: ShelfEQ;

    public constructor(sampleRate: number) {
        this.shelves = new ShelfEQ(sampleRate);
        this.mid = new PeakingBand(sampleRate);
    }

    /**
     * @param low The low gain parameter.
     * @param high The high gain parameter.
     */
    public setShelves(low: number, high: number) {
        this.shelves.setLow(ShelfCorners.low200, shelfGain(low));
        this.shelves.setHigh(ShelfCorners.high4k, shelfGain(high));
    }

    /**
     * @param frequency The mid frequency (EQ column, one table every 8 values).
     * @param q The Q index (0-4).
     * @param gain The gain parameter (0x34-0x4c is -12 to +12 dB).
     */
    public setMid(frequency: number, q: number, gain: number) {
        this.mid.setParameters(frequency, q, gain);
    }

    public process(x: number) {
        return this.mid.process(this.shelves.process(x));
    }

    public clear() {
        this.shelves.clear();
        this.mid.clear();
    }
}

/**
 * The chorus or flanger of the multis: the mono chain into a line with two reads, the left one also feeds back
 * (flanger). Each output is the chain plus its read at the wet level. Pre delay 0.5 ms, rate on the Rate2 column.
 * The chorus reads are half a cycle apart, the flanger's together.
 * @internal
 */
export class MultiModulation {
    public left = 0;
    public right = 0;
    private readonly lfo: LFO;
    private readonly delay: ModulatedDelay;
    private wet = 0;

    public constructor(sampleRate: number, memory: DelayMemory) {
        this.lfo = new LFO(sampleRate);
        this.delay = new ModulatedDelay(
            sampleRate,
            memory,
            2,
            MODULATION_PRE_DELAY + SWING_MS
        );
        this.delay.setPreDelay(0, MODULATION_PRE_DELAY);
        this.delay.setPreDelay(1, MODULATION_PRE_DELAY);
    }

    /**
     * @param flanger The flanger instead of the chorus.
     * @param rate The rate parameter (Rate2 column).
     * @param depth The depth parameter.
     * @param feedback The flanger feedback parameter.
     * @param wet The wet level parameter.
     */
    public update(
        flanger: boolean,
        rate: number,
        depth: number,
        feedback: number,
        wet: number
    ) {
        const delay = this.delay;
        delay.setCurve(flanger);
        delay.setPhase(1, flanger ? 0 : 180);
        delay.setDepth(0, modulationDepth(depth));
        delay.setDepth(1, modulationDepth(depth));
        delay.setFeedback(flanger ? feedbackGain(feedback) : 0);
        this.lfo.setRate(rate2(rate));
        this.wet = levelGain(wet);
    }

    /**
     * Puts a high pass in the line (in the loop, like the tone filters of the choruses).
     * @param frequency The corner in Hz.
     * @param gain The gain at Nyquist.
     */
    public setHighPass(frequency: number, gain: number) {
        this.delay.tone.setHighPass(frequency, gain);
    }

    public process(x: number) {
        const delay = this.delay;
        delay.process(x * STAGE_DRY, this.lfo.process());
        this.left = STAGE_DRY * x + this.wet * delay.output[0];
        this.right = STAGE_DRY * x + this.wet * delay.output[1];
    }

    public clear() {
        this.lfo.clear();
        this.delay.clear();
    }
}

/**
 * The delay of the multis: the mean of both channels plus the feedback into one line, its echo added to each
 * channel at the wet level. Time on the Dly4 column, feedback on the resonance table, optional HF damp.
 * @internal
 */
export class MultiDelay {
    public left = 0;
    public right = 0;
    private readonly delay: Delay;
    private feedback = 0;
    private wet = 0;

    public constructor(sampleRate: number, memory: DelayMemory) {
        this.delay = new Delay(sampleRate, memory, 1, 640);
        // The echo is the damped tap, like the other single tap delays
        this.delay.setDampTaps(true);
    }

    /**
     * @param time The delay time parameter (Dly4 column).
     * @param feedback The feedback parameter.
     * @param wet The wet level parameter.
     * @param damp The HF damp parameter (HF column), Bypass if missing.
     */
    public update(time: number, feedback: number, wet: number, damp = 127) {
        this.delay.setTap(0, delay4(time));
        this.delay.setHFDamp(hfDamp(damp));
        this.feedback = resonanceGain(feedback) * STAGE_DRY;
        this.wet = levelGain(wet) * STAGE_DRY;
    }

    public process(left: number, right: number) {
        const delay = this.delay;
        delay.process(0.5 * (left + right) + this.feedback * delay.feedback());
        const echo = this.wet * delay.output[0];
        this.left = STAGE_DRY * left + echo;
        this.right = STAGE_DRY * right + echo;
    }

    public clear() {
        this.delay.clear();
    }
}

/**
 * The multis on the mono mix: the guitar and bass multis (a mono chain on `L+R`, compressor or wah, drive, amp, EQ
 * in some order, then a chorus or flanger that gives two outputs, and in some of them a delay), and the keyboard
 * multis, which keep both channels and mix them into their mono stages.
 *
 * Like the other mono input types the right output comes one 32 kHz sample after the left one.
 * @internal
 */
export abstract class GSMulti extends GSEffect {
    protected readonly mix: MonoMix;
    protected gain = 0;
    private readonly lag: OutputLag;

    protected constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory);
        this.mix = new MonoMix(sampleRate);
        this.lag = new OutputLag(sampleRate);
    }

    protected clear() {
        this.mix.clear();
        this.lag.clear();
    }

    /**
     * Writes one output sample, the right one late.
     * @param left The left output.
     * @param right The right output.
     * @param outputLeft The left output buffer.
     * @param outputRight The right output buffer.
     * @param i The sample.
     */
    protected output(
        left: number,
        right: number,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        i: number
    ) {
        outputLeft[i] = left * this.gain;
        outputRight[i] = this.lag.process(right * this.gain);
    }
}
