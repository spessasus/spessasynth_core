import { DC_BLOCKER_HZ, FirstOrderFilter } from "./first_order_filter";
import { Biquad } from "./biquad";
import { Oversampler } from "./oversampler";

/**
 * A drive variant: the fixed filters around the clipper, the gain in front of it and the level compensation.
 * @internal
 */
export interface DrivePreset {
    /**
     * The gain in front of the clipper per drive step, with the fixed gains of the pre filters folded in.
     */
    gain: number;
    /**
     * The level compensation by drive (over 128), the last entry holds for every higher drive.
     */
    postGain: Uint8Array;
    /**
     * The fixed gain of the post filters.
     */
    postFilterGain: number;
    /**
     * Designs the three pre filters, the post filter and the post peaking filter.
     */
    design(
        pre1: FirstOrderFilter,
        pre2: FirstOrderFilter,
        pre3: FirstOrderFilter,
        post: FirstOrderFilter,
        peak: Biquad
    ): void;
    /**
     * Designs the second order sections of the bass drives, one in front of the clipper (after the pre filters)
     * and one at the end. Without it both are off.
     */
    designBass?(pre: Biquad, post: Biquad): void;
}

/**
 * The level compensation of the guitar drives (`DRIVE_B`).
 */
const GUITAR_POST_GAIN = new Uint8Array([58, 58, 29, 21, 17, 15, 14]);

/**
 * The guitar Overdrive: band limited to 330-2400 Hz, 18 dB more gain than the drive value says, a soft -10 dB
 * high cut after.
 * @internal
 */
export const GUITAR_OVERDRIVE: DrivePreset = {
    gain: 8 * 0.996_02 * 0.979_59,
    postGain: GUITAR_POST_GAIN,
    postFilterGain: 127 / 128,
    design(pre1, pre2, pre3, post, peak) {
        pre1.setHighPass(328.5);
        pre2.setHighPass(202.9);
        pre3.setLowPass(2368);
        post.setHighShelf(1002, -10.08);
        peak.setOff();
    }
};

/**
 * The guitar Distortion: a low cut with its zero in the right half plane (the lows come back inverted and 18 dB
 * down), a 1.5 kHz low pass, 30 dB more gain than the drive value says, a -6 dB high cut and a dip at 1 kHz after.
 * @internal
 */
export const GUITAR_DISTORTION: DrivePreset = {
    gain: (32 * 127) / 128,
    postGain: GUITAR_POST_GAIN,
    postFilterGain: 1,
    design(pre1, pre2, pre3, post, peak) {
        pre1.setPoleZero(-84.12, 678.1, 1.0083);
        pre2.setOff();
        pre3.setLowPass(1548);
        post.setHighShelf(202.9, -6.06);
        peak.setPeaking(1063.9, 0.53, -6.02);
    }
};

/**
 * The Distortion of the combinations, the guitar multis and the parallel types: the guitar Distortion with a plain
 * 678 Hz high pass in front instead of the low cut (one coefficient differs, so the lows do not come back), and its own level
 * compensation (`DISTORTION_DRIVE_B`, 4.4 dB under the guitar drives' at drive 0 and 1).
 * @internal
 */
export const GUITAR_DISTORTION_HIGH_PASS: DrivePreset = {
    ...GUITAR_DISTORTION,
    postGain: new Uint8Array([35, 35, 22, 19, 18, 17]),
    design(pre1, pre2, pre3, post, peak) {
        GUITAR_DISTORTION.design(pre1, pre2, pre3, post, peak);
        pre1.setHighPass(678.1);
    }
};

/**
 * The Humanizer's drive: no filters around the clipper, a gain of 2 per drive step in front of it (6 dB more than
 * the drive value says) and its own level compensation.
 * @internal
 */
export const HUMANIZER_DRIVE: DrivePreset = {
    gain: 2,
    postGain: new Uint8Array([77, 77, 38, 25, 19, 16, 14, 13, 12, 11, 10]),
    postFilterGain: 127 / 128,
    design(pre1, pre2, pre3, post, peak) {
        pre1.setOff();
        pre2.setOff();
        pre3.setOff();
        post.setOff();
        peak.setOff();
    }
};

/**
 * Rotary Multi's drive: the Humanizer's, but half the level after the clipper.
 * @internal
 */
export const ROTARY_MULTI_DRIVE: DrivePreset = {
    ...HUMANIZER_DRIVE,
    postFilterGain: 0.5
};

/**
 * The level compensation of the bass drives is over 32, four times the guitar drives' scale.
 */
const BASS_POST_SCALE = 4;

/**
 * Bass Multi's Overdrive: a 371 Hz high pass in front, 18 dB more gain than the drive value says, a -20 dB high cut
 * after (from 371 Hz, its zero at 3.5 kHz) and its own level compensation (`BASS_DRIVE_B`).
 * @internal
 */
export const BASS_OVERDRIVE: DrivePreset = {
    gain: (8 * 127) / 128,
    postGain: new Uint8Array([79, 79, 41, 30, 25, 22, 21, 20]),
    postFilterGain: ((BASS_POST_SCALE * 127) / 128) * 0.125,
    design(pre1, pre2, pre3, post, peak) {
        pre1.setHighPass(370.98, 1.004_05);
        pre2.setOff();
        pre3.setOff();
        post.setPoleZero(3519.8, 370.98, 0.101_215);
        peak.setOff();
    }
};

/**
 * Bass Multi's Distortion: a 589 Hz high pass and a 2.1 kHz low pass in front, 30 dB more gain than the drive value
 * says, then a high shelf (+6 dB from 2 kHz), a dip at 1.4 kHz, a boost of the lows below 50 Hz and its own level
 * compensation (`BASS_DISTORTION_DRIVE_B`).
 *
 * SC-VA's 1e-5 seeds move the low boost (+21 instead of +9.5 dB at DC), since its section nearly cancels there. This
 * is the section without them.
 * @internal
 */
export const BASS_DISTORTION: DrivePreset = {
    gain: 32,
    postGain: new Uint8Array([16, 16, 10, 9, 8]),
    postFilterGain: ((BASS_POST_SCALE * 127) / 128) * 0.125,
    design(pre1, pre2, pre3, post, peak) {
        pre1.setHighPass(588.61, 0.991_736);
        pre2.setOff();
        pre3.setOff();
        post.setPoleZero(1968.04, 3866.21, 2.010_93);
        peak.setPeaking(1417.1, 1.190_24, -6.0206);
    },
    designBass(pre, post) {
        // A second order low pass, 0.941 at DC
        const w = pre.prewarp(2109.7);
        pre.setAnalog(0, 0, 0.941_176 * w * w, 1, w / 0.735_465, w * w);
        // Unity at Nyquist, 3 (+9.5 dB) at DC
        const wp = post.prewarp(28.1846);
        const wz = post.prewarp(48.8166);
        post.setAnalog(1, wz / 0.135_549, wz * wz, 1, wp / 0.782_248, wp * wp);
    }
};

/**
 * The drive of the Sound Canvas: filters, a gain, a hard clipper at full scale and a soft saturating waveshaper,
 * filters again and a level compensation.
 *
 * At 32 kHz and up the clipper runs at the host rate (it aliases less than the 32 kHz hardware does). Below that
 * it runs at twice the rate.
 * @internal
 */
export class Drive {
    /**
     * This sample's input after the DC blocker, for the path around a switched off drive.
     */
    public input = 0;
    private readonly dcBlocker: FirstOrderFilter;
    private readonly pre1: FirstOrderFilter;
    private readonly pre2: FirstOrderFilter;
    private readonly pre3: FirstOrderFilter;
    private readonly post: FirstOrderFilter;
    private readonly peak: Biquad;
    private readonly bassPre: Biquad;
    private readonly bassPost: Biquad;
    private readonly oversampler: Oversampler | null;
    private bass = false;
    private preset: DrivePreset = GUITAR_OVERDRIVE;
    private gain = 0;
    private postGain = 0;

    public constructor(sampleRate: number) {
        this.dcBlocker = new FirstOrderFilter(sampleRate);
        this.dcBlocker.setHighPass(DC_BLOCKER_HZ);
        this.pre1 = new FirstOrderFilter(sampleRate);
        this.pre2 = new FirstOrderFilter(sampleRate);
        this.pre3 = new FirstOrderFilter(sampleRate);
        this.post = new FirstOrderFilter(sampleRate);
        this.peak = new Biquad(sampleRate);
        this.bassPre = new Biquad(sampleRate);
        this.bassPost = new Biquad(sampleRate);
        this.oversampler = sampleRate < 32_000 ? new Oversampler() : null;
    }

    /**
     * The hard clip and the waveshaper: linear (x 0.875) below a quarter of full scale, then a quadratic
     * saturation that flattens out at full scale.
     * @param x The input.
     */
    private static shape(x: number) {
        const c = Math.max(-1, Math.min(1, x));
        return (
            c * (0.875 - 0.5 * Math.max(0, 0.992_187_5 * Math.abs(c) - 0.25))
        );
    }

    public setPreset(preset: DrivePreset) {
        this.preset = preset;
        preset.design(this.pre1, this.pre2, this.pre3, this.post, this.peak);
        this.bass = preset.designBass !== undefined;
        if (preset.designBass) {
            preset.designBass(this.bassPre, this.bassPost);
        } else {
            this.bassPre.setOff();
            this.bassPost.setOff();
        }
    }

    /**
     * Call after `setPreset`.
     * @param drive The drive parameter (0-127, 0 is the same as 1).
     */
    public setDrive(drive: number) {
        const p = this.preset;
        const d = Math.max(drive, 1);
        this.gain = p.gain * d;
        this.postGain =
            (p.postGain[Math.min(d, p.postGain.length - 1)] / 128) *
            p.postFilterGain;
    }

    public process(x: number) {
        let y = this.pre3.process(
            this.pre2.process(
                this.pre1.process((this.input = this.dcBlocker.process(x)))
            )
        );
        if (this.bass) y = this.bassPre.process(y);
        y *= this.gain;
        const oversampler = this.oversampler;
        if (oversampler) {
            oversampler.up(y);
            y = oversampler.down(
                Drive.shape(oversampler.first),
                Drive.shape(oversampler.second)
            );
        } else {
            y = Drive.shape(y);
        }
        y = this.peak.process(this.post.process(y));
        if (this.bass) y = this.bassPost.process(y);
        return this.postGain * y;
    }

    public clear() {
        this.dcBlocker.clear();
        this.input = 0;
        this.pre1.clear();
        this.pre2.clear();
        this.pre3.clear();
        this.post.clear();
        this.peak.clear();
        this.bassPre.clear();
        this.bassPost.clear();
        this.oversampler?.clear();
    }
}
