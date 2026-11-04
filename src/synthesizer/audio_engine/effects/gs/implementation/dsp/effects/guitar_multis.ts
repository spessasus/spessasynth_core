import type { DelayMemory } from "../blocks/delay_memory";
import { levelGain, MONO_INPUT, panLeft, STAGE_OUTPUT } from "../glue";
import { GUITAR_DISTORTION_HIGH_PASS, GUITAR_OVERDRIVE } from "../blocks/drive";
import { AmpSimulator } from "../blocks/amp_simulator";
import { Wah } from "../blocks/wah";
import {
    GSMulti,
    MULTI_WAH_GAIN,
    MultiCompressor,
    MultiDelay,
    MultiDrive,
    type MultiDriveOptions,
    MultiEQ,
    MultiModulation
} from "./guitar_multi";

/**
 * The drive section bypass of GTR Multi 1 and 3: the drive's DC blocker, without a 127/128 that GTR Multi 2's has.
 */
const BYPASS_GAIN = 128 / 127;

/**
 * The chain goes into the chorus/flanger at the center pan's gain.
 */
const CHAIN_GAIN = panLeft(64);

/**
 * GTR Multi 1 and 3: `L+R -> compressor or wah -> overdrive/distortion -> 2-band EQ -> amp simulator ->
 * chorus/flanger -> delay`. Parameters 5-20 are the same in both.
 * @internal
 */
abstract class GSDriveDelayMulti extends GSMulti {
    private readonly drive: MultiDrive;
    private readonly modulation: MultiModulation;
    private readonly delay: MultiDelay;

    protected constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory);
        this.drive = new MultiDrive(sampleRate, {
            overdrive: GUITAR_OVERDRIVE,
            distortion: GUITAR_DISTORTION_HIGH_PASS,
            amp: new AmpSimulator(sampleRate),
            bypassGain: BYPASS_GAIN,
            shelves: true
        });
        this.modulation = new MultiModulation(sampleRate, memory);
        this.delay = new MultiDelay(sampleRate, memory);
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const { modulation, delay } = this;
        for (let i = 0; i < sampleCount; i++) {
            const x = this.front(
                this.mix.process(inputLeft[i], inputRight[i]) * MONO_INPUT
            );
            // The drive switch bypasses the EQ and the amp too
            modulation.process(this.drive.process(x) * CHAIN_GAIN);
            delay.process(modulation.left, modulation.right);
            this.output(delay.left, delay.right, outputLeft, outputRight, i);
        }
    }

    protected clear() {
        super.clear();
        this.drive.clear();
        this.modulation.clear();
        this.delay.clear();
    }

    /**
     * Applies parameters 5-20.
     * @param drive The drive, with its control offset.
     * @param delayLevel The delay level, with its control offset.
     */
    protected updateChain(drive: number, delayLevel: number) {
        const p = this.parameters;
        this.drive.update(p[4] === 1, drive, p[6], p[7] === 1, p[10] === 1);
        this.drive.setShelves(p[8], p[9]);
        this.modulation.update(p[11] === 1, p[12], p[13], p[14], p[15]);
        this.delay.update(p[16], p[17], delayLevel);
        this.gain = levelGain(p[19]) * STAGE_OUTPUT;
    }

    /**
     * The section in front of the drive (parameters 1-4).
     * @param x The mono input.
     */
    protected abstract front(x: number): number;
}

/**
 * GTR Multi 1 (`04 00`): `L+R -> compressor -> overdrive/distortion -> 2-band EQ -> amp simulator -> chorus/flanger
 * -> delay`.
 * Parameters: 1-4 compressor sustain, attack (the manuals swap these two names, see `GSCompressor`), level and
 * switch, 5 drive type (OD, DS), 6 drive, 7 amp type, 8 amp switch, 9 low gain, 10 high gain, 11 drive switch,
 * 12 chorus or flanger, 13 rate (Rate2 column), 14 depth, 15 flanger feedback, 16 chorus level, 17 delay time (Dly4
 * column), 18 feedback, 19 delay level, 20 level. EFX control source 1 moves the drive, source 2 the delay level.
 * @internal
 */
export class GSGuitarMulti1 extends GSDriveDelayMulti {
    public readonly type = 0x04_00;
    protected readonly defaults = new Uint8Array([
        0x64, 0x50, 0x64, 0x01, 0x00, 0x50, 0x00, 0x01, 0x45, 0x4a, 0x01, 0x00,
        0x08, 0x1e, 0x66, 0x28, 0x3c, 0x22, 0x0f, 0x6e
    ]);
    protected readonly limits = { 3: 1, 4: 1, 6: 3, 7: 1, 10: 1, 11: 1 };
    private readonly compressor: MultiCompressor;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory);
        this.compressor = new MultiCompressor(sampleRate);
        this.reset();
    }

    protected front(x: number) {
        return this.compressor.process(x);
    }

    protected clear() {
        super.clear();
        this.compressor.clear();
    }

    protected update() {
        this.compressor.update(this.parameters);
        this.updateChain(this.controlled(0, 5), this.controlled(1, 18));
    }
}

/**
 * GTR Multi 3 (`04 02`): `L+R -> wah -> overdrive/distortion -> 2-band EQ -> amp simulator -> chorus/flanger ->
 * delay`. The wah is the Auto Wah's filter at its Manual, without the LFO and the envelope follower.
 * Parameters: 1 wah filter type (LPF, BPF), 2 manual, 3 peak, 4 wah switch, 5 drive type (OD, DS), 6 drive, 7 amp
 * type, 8 amp switch, 9 low gain, 10 high gain, 11 drive switch, 12 chorus or flanger, 13 rate (Rate2 column),
 * 14 depth, 15 flanger feedback, 16 chorus level, 17 delay time (Dly4 column), 18 feedback, 19 delay level,
 * 20 level. EFX control source 1 moves the wah manual, source 2 the drive.
 * @internal
 */
export class GSGuitarMulti3 extends GSDriveDelayMulti {
    public readonly type = 0x04_02;
    protected readonly defaults = new Uint8Array([
        0x01, 0x3c, 0x0a, 0x01, 0x01, 0x50, 0x02, 0x01, 0x40, 0x40, 0x01, 0x00,
        0x08, 0x00, 0x59, 0x32, 0x20, 0x40, 0x1e, 0x58
    ]);
    protected readonly limits = {
        0: 1,
        3: 1,
        4: 1,
        6: 3,
        7: 1,
        10: 1,
        11: 1
    };
    private readonly wah: Wah;
    private wahOn = false;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory);
        this.wah = new Wah(sampleRate);
        this.wah.setEnvelope(false);
        this.wah.setPolarity(true);
        this.wah.setDepth(0);
        this.reset();
    }

    protected front(x: number) {
        const wah = this.wah.process(x) * MULTI_WAH_GAIN;
        return this.wahOn ? wah : x;
    }

    protected clear() {
        super.clear();
        this.wah.clear();
    }

    protected update() {
        const p = this.parameters;
        this.wah.setFilterType(p[0] === 1);
        this.wah.setManual(levelGain(this.controlled(0, 1)));
        this.wah.setPeak(p[2]);
        this.wahOn = p[3] === 1;
        this.updateChain(this.controlled(1, 5), p[18]);
    }
}

/**
 * GTR Multi 2 and Bass Multi: `L+R -> compressor -> overdrive/distortion -> amp simulator -> 3-band EQ ->
 * chorus/flanger`, with the same parameters. They differ in the drives, the amp and some fixed gains.
 * @internal
 */
export abstract class GSDriveEQMulti extends GSMulti {
    protected readonly modulation: MultiModulation;
    private readonly compressor: MultiCompressor;
    private readonly drive: MultiDrive;
    private readonly eq: MultiEQ;
    private readonly chainGain: number;

    /**
     * @param sampleRate The sample rate.
     * @param memory The delay memory.
     * @param drive The drive section.
     * @param chainGain The gain into the chorus/flanger.
     * @param lookahead The compressor's lookahead in seconds, if not the Compressor's 1 ms.
     */
    protected constructor(
        sampleRate: number,
        memory: DelayMemory,
        drive: MultiDriveOptions,
        chainGain: number,
        lookahead?: number
    ) {
        super(sampleRate, memory);
        this.compressor = new MultiCompressor(sampleRate, lookahead);
        this.drive = new MultiDrive(sampleRate, drive);
        this.eq = new MultiEQ(sampleRate);
        this.modulation = new MultiModulation(sampleRate, memory);
        this.chainGain = chainGain;
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const { modulation, chainGain } = this;
        for (let i = 0; i < sampleCount; i++) {
            const x = this.compressor.process(
                this.mix.process(inputLeft[i], inputRight[i]) * MONO_INPUT
            );
            // The drive switch bypasses the amp too
            modulation.process(
                this.eq.process(this.drive.process(x)) * chainGain
            );
            this.output(
                modulation.left,
                modulation.right,
                outputLeft,
                outputRight,
                i
            );
        }
    }

    protected clear() {
        super.clear();
        this.compressor.clear();
        this.drive.clear();
        this.eq.clear();
        this.modulation.clear();
    }

    protected update() {
        const p = this.parameters;
        this.compressor.update(p);
        this.drive.update(
            p[4] === 1,
            this.controlled(0, 5),
            p[6],
            p[7] === 1,
            p[8] === 1
        );
        this.eq.setShelves(p[9], p[13]);
        this.eq.setMid(p[10], p[11], p[12]);
        this.modulation.update(
            p[14] === 1,
            p[15],
            p[16],
            p[17],
            this.controlled(1, 18)
        );
        this.gain = levelGain(p[19]) * STAGE_OUTPUT;
    }
}

/**
 * GTR Multi 2 (`04 01`): `L+R -> compressor -> overdrive/distortion -> amp simulator -> 3-band EQ -> chorus/flanger`.
 * Parameters: 1-4 compressor sustain, attack (the manuals swap these two names, see `GSCompressor`), level and
 * switch, 5 drive type (OD, DS), 6 drive, 7 amp type, 8 amp switch, 9 drive switch, 10 low gain, 11-13 mid-frequency,
 * Q and gain, 14 high gain, 15 chorus or flanger, 16 rate (Rate2 column), 17 depth, 18 flanger feedback,
 * 19 chorus level, 20 level. EFX control source 1 moves the drive, source 2 the chorus level.
 * @internal
 */
export class GSGuitarMulti2 extends GSDriveEQMulti {
    public readonly type = 0x04_01;
    protected readonly defaults = new Uint8Array([
        0x46, 0x7f, 0x5a, 0x01, 0x00, 0x50, 0x02, 0x01, 0x01, 0x4c, 0x38, 0x02,
        0x45, 0x36, 0x00, 0x08, 0x60, 0x66, 0x00, 0x50
    ]);
    protected readonly limits = { 3: 1, 4: 1, 6: 3, 7: 1, 8: 1, 11: 4, 14: 1 };

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(
            sampleRate,
            memory,
            {
                overdrive: GUITAR_OVERDRIVE,
                distortion: GUITAR_DISTORTION_HIGH_PASS,
                amp: new AmpSimulator(sampleRate)
            },
            CHAIN_GAIN
        );
        this.reset();
    }
}
