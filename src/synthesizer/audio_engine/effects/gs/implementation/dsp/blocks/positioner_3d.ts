import { HRTFPair, type HRTFSet } from "./hrtf_pair";

/**
 * A set whose far ear hears what the near ear hears (straight ahead and straight behind).
 * @param a The near gain.
 * @param b2 The near feedback at 62.5 us.
 * @param b4 The near feedback at 125 us.
 */
function same(a: number, b2: number, b4: number): HRTFSet {
    return { a, b2, b4, f: 0, g: 1, d1: 0, h: 0, d2: 0 };
}

/**
 * The 16 directions of the hardware, 12 degrees apart from behind (0) to the front (15). The near ear gets an 8 kHz
 * resonance and a low pass, the far ear the near signal 0 to 0.9 ms later through a one-pole (the ITD reaches about
 * 800 us at 84-96 degrees, the level difference grows with frequency).
 */
// prettier-ignore
const BREAKPOINTS: HRTFSet[] = [
    same(0.789_062_5, 0.242_187_5, 0.046_875),
    [0.820_312_5, 0.093_75, 0.25, 0.335_937_5, 0.578_125, 6, 0.015_625, 4],
    [0.859_375, -0.015_625, 0.375, 0.468_75, 0.414_062_5, 12, 0.023_437_5, 7],
    [0.921_875, -0.101_562_5, 0.445_312_5, 0.539_062_5, 0.3125, 16, 0.039_062_5, 10],
    [1.031_25, -0.1875, 0.476_562_5, 0.601_562_5, 0.226_562_5, 19, 0.054_687_5, 13],
    [1.156_25, -0.273_437_5, 0.476_562_5, 0.656_25, 0.156_25, 19, 0.070_312_5, 16],
    [1.3125, -0.351_562_5, 0.429_687_5, 0.703_125, 0.101_562_5, 21, 0.085_937_5, 19],
    [1.468_75, -0.421_875, 0.343_75, 0.734_375, 0.0625, 25, 0.101_562_5, 21],
    [1.593_75, -0.460_937_5, 0.234_375, 0.742_187_5, 0.039_062_5, 28, 0.117_187_5, 21],
    [1.625, -0.476_562_5, 0.156_25, 0.734_375, 0.031_25, 29, 0.132_812_5, 19],
    [1.625, -0.476_562_5, 0.101_562_5, 0.718_75, 0.039_062_5, 27, 0.148_437_5, 16],
    [1.593_75, -0.460_937_5, 0.054_687_5, 0.695_312_5, 0.039_062_5, 25, 0.171_875, 13],
    [1.5, -0.421_875, 0.031_25, 0.664_062_5, 0.046_875, 22, 0.210_937_5, 10],
    [1.375, -0.3125, 0.015_625, 0.593_75, 0.054_687_5, 18, 0.281_25, 7],
    [1.1875, -0.179_687_5, 0.007_812_5, 0.3125, 0.070_312_5, 13, 0.546_875, 4],
    same(1, 0, 0)
].map((s) => (Array.isArray(s) ? { a: s[0], b2: s[1], b4: s[2], f: s[3], g: s[4], d1: s[5], h: s[6], d2: s[7] } : s));

/**
 * A Manual azimuth change crossfades over 46 32 kHz samples (1.44 ms).
 */
const MANUAL_FADE = 46 / 32_000;

/**
 * The 3D positioner of 3D Auto and 3D Manual: a mono source at an azimuth, heard through the near and far ear of the
 * direction (the near ear is the left one on the left side).
 *
 * The position is a phase over one turn, -1 to 1: its magnitude runs from behind (0) to the front (1), its sign is
 * the side (negative on the left). Turning moves it at the speed in turns per second, clockwise (the azimuth
 * increasing) or counterclockwise. Turned off it runs on until it reaches the azimuth and stops there.
 *
 * Between two directions it mixes their sets: while turning, toward the next direction in the way it moves, done
 * after half the 12 degrees. A Manual change crossfades from the current set in 1.44 ms.
 * @internal
 */
export class Positioner3D {
    public left = 0;
    public right = 0;
    private readonly pair: HRTFPair;
    private readonly sampleRate: number;
    private position = 0;
    private target = 0;
    private increment = 0;
    private turning = false;
    private moving = false;
    /**
     * The Manual crossfade: from `from` to `to`, its progress and step per sample.
     */
    private from = BREAKPOINTS[15];
    private to = BREAKPOINTS[15];
    private fade = 1;
    private readonly fadeStep: number;

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.pair = new HRTFPair(sampleRate, BREAKPOINTS[15]);
        this.fadeStep = 1 / (MANUAL_FADE * sampleRate);
    }

    /**
     * @param degrees The azimuth (the Azim column), negative on the left.
     * @param jump Start there at once (a reset) instead of crossfading or turning there.
     */
    public setAzimuth(degrees: number, jump = false) {
        // The front is -1 (the wrap's end), the right side positive
        const target = (degrees > 0 ? 1 : -1) * (1 - Math.abs(degrees) / 180);
        if (target === this.target && !jump) return;
        this.target = target;
        if (jump) {
            this.position = target;
            this.from = this.to = this.directionAt(target);
            this.fade = 1;
        } else if (!this.turning && !this.moving) {
            // A Manual change: crossfade from the nearer end of a running fade
            this.from = this.fade < 0.5 ? this.from : this.to;
            this.to = this.directionAt(target);
            this.position = target;
            this.fade = 0;
        }
    }

    /**
     * @param hz The turning speed in turns per second.
     * @param clockwise Clockwise (the azimuth increasing).
     */
    public setSpeed(hz: number, clockwise: boolean) {
        // The phase moves by 2 per turn, clockwise makes it smaller
        this.increment = ((clockwise ? -2 : 2) * hz) / this.sampleRate;
    }

    /**
     * @param on Turning.
     */
    public setTurning(on: boolean) {
        this.turning = on;
        if (on) this.moving = true;
    }

    public process(x: number) {
        const pair = this.pair;
        if (this.moving) {
            let next = this.position + this.increment;
            // Turned off, it stops where it passes the azimuth
            if (!this.turning && this.crosses(this.position, next)) {
                next = this.target;
                this.moving = false;
                // The azimuth may have changed while turning, so the still set is the one at the stop
                this.from = this.to = this.directionAt(next);
                this.fade = 1;
            }
            this.position = next >= 1 ? next - 2 : next < -1 ? next + 2 : next;
            this.mixMoving();
        } else if (this.fade < 1) {
            this.fade = Math.min(1, this.fade + this.fadeStep);
            pair.setSets(this.to, this.from, this.fade);
        } else {
            pair.setSets(this.to, this.to, 1);
        }
        pair.process(x);
        // The near ear is on the side of the source
        if (this.position < 0) {
            this.left = pair.near;
            this.right = pair.far;
        } else {
            this.left = pair.far;
            this.right = pair.near;
        }
    }

    public clear() {
        this.pair.clear();
        this.left = this.right = 0;
    }

    /**
     * The direction set at a position that sits on a breakpoint.
     * @param position The position.
     */
    private directionAt(position: number) {
        return BREAKPOINTS[Math.round(Math.abs(position) * 15)];
    }

    /**
     * Whether a step from `a` to `b` passes the target in the direction of turning.
     * @param a The position before the step.
     * @param b The position after the step (not wrapped).
     */
    private crosses(a: number, b: number) {
        // The distance to the target ahead of the turning, over the wrap
        const ahead =
            this.increment < 0
                ? (((a - this.target) % 2) + 2) % 2
                : (((this.target - a) % 2) + 2) % 2;
        return ahead <= Math.abs(b - a);
    }

    /**
     * While turning: the mix toward the next breakpoint in the way the position moves, complete half way through the
     * segment.
     */
    private mixMoving() {
        const level = Math.abs(this.position) * 15;
        const segment = Math.min(14, Math.floor(level));
        const into = level - segment;
        // The magnitude grows when the position moves away from 0 (toward the front)
        const rising = Math.sign(this.position || 1) * this.increment > 0;
        if (rising) {
            this.pair.setSets(
                BREAKPOINTS[segment + 1],
                BREAKPOINTS[segment],
                Math.min(1, 2 * into)
            );
        } else {
            this.pair.setSets(
                BREAKPOINTS[segment],
                BREAKPOINTS[segment + 1],
                Math.min(1, 2 * (1 - into))
            );
        }
    }
}
