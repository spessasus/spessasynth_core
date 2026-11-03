import type { DelayMemory } from "./delay_memory";
import { Crossfade } from "./crossfade";
import type { DelayLine } from "./delay_line";
import { DC_BLOCKER_HZ, FirstOrderFilter } from "./first_order_filter";

/**
 * The diffuser's allpasses in 32 kHz samples (the Reverb's Stage lengths, all four allpasses here).
 */
const DIFFUSER = [917, 377, 110, 76];

/**
 * The diffuser's allpass gain.
 */
const ALLPASS = 77 / 128;

/**
 * Where the taps sit along the gate time, shortest first. The hardware rounds each to a whole 32 kHz sample, which
 * reproduces its tap table exactly.
 */
// prettier-ignore
const TAPS_LEFT = [
    0.000_212, 0.142_675, 0.237_933, 0.291_515, 0.377_206, 0.450_139, 0.527_11, 0.618_966, 0.664_044, 0.780_565,
    0.884_33, 1
];
// prettier-ignore
const TAPS_RIGHT = [
    0.000_212, 0.149_053, 0.236_019, 0.302_147, 0.357_006_2, 0.448_864, 0.538_167, 0.614_715, 0.663_62, 0.789_071,
    0.882_628, 1
];

/**
 * The right taps start 3.625 ms (116 samples) later.
 */
const RIGHT_OFFSET = 116;

/**
 * The tap gains per type (over 128, left then right, shortest tap first): Normal, Reverse (rising), Sweep 1 (left
 * rising, right falling) and Sweep 2 (the mirror image).
 */
// prettier-ignore
const PATTERNS = [
    [64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64],
    [4, 5, 7, 10, 14, 19, 24, 30, 37, 45, 54, 64, 4, 5, 7, 10, 14, 19, 24, 30, 37, 45, 54, 64],
    [0, 11, 23, 34, 46, 58, 69, 81, 93, 104, 116, 127, 127, 116, 104, 93, 81, 69, 58, 46, 34, 23, 11, 0],
    [127, 116, 104, 93, 81, 69, 58, 46, 34, 23, 11, 0, 0, 11, 23, 34, 46, 58, 69, 81, 93, 104, 116, 127]
].map((gains) => gains.map((g) => g / 128));

/**
 * The longest read of the gate line in 32 kHz samples: the longest pre delay and the right side's last tap at 500 ms.
 */
const LONGEST = 3200 + RIGHT_OFFSET + 16_000;

/**
 * The Gate Reverb: a mono input through a DC blocker and a diffuser of four Schroeder allpasses into a line that
 * twelve taps per side read, spread over the gate time. There is no feedback, so the sound stops at the gate time.
 *
 * Everything is linear, so the pre delay is part of the taps. The left taps read one 32 kHz sample earlier than the
 * program's (the shared stage reads the left input one sample late), except where that would need a future sample
 * (pre delay 0 with a gate time under 73 ms, the first left tap).
 * @internal
 */
export class GateReverb {
    public left = 0;
    public right = 0;
    private readonly dcBlocker: FirstOrderFilter;
    private readonly diffuser: DelayLine[];
    private readonly line: DelayLine;
    /**
     * One 32 kHz sample in host samples.
     */
    private readonly step: number;
    /**
     * The tap delays in host samples: the ones read, the ones set, and the ones read before them while a change
     * crossfades.
     */
    private readonly delaysLeft = new Float64Array(12);
    private readonly delaysRight = new Float64Array(12);
    private readonly targetsLeft = new Float64Array(12);
    private readonly targetsRight = new Float64Array(12);
    private readonly previousLeft = new Float64Array(12);
    private readonly previousRight = new Float64Array(12);
    private readonly fade: Crossfade;
    private gains = PATTERNS[0];
    private preDelay = 0;
    private gateTime = 0;

    /**
     * @param sampleRate The sample rate.
     * @param memory The delay memory.
     */
    public constructor(sampleRate: number, memory: DelayMemory) {
        this.step = sampleRate / 32_000;
        this.dcBlocker = new FirstOrderFilter(sampleRate);
        this.dcBlocker.setHighPass(DC_BLOCKER_HZ);
        this.diffuser = DIFFUSER.map((n) =>
            memory.line(Math.ceil(n * this.step))
        );
        this.line = memory.line(Math.ceil(LONGEST * this.step));
        this.fade = new Crossfade(sampleRate);
    }

    /**
     * @param pattern The type (0-3: Normal, Reverse, Sweep 1, Sweep 2).
     */
    public setPattern(pattern: number) {
        this.gains = PATTERNS[pattern];
    }

    /**
     * @param ms The pre delay (the PreDly column).
     */
    public setPreDelay(ms: number) {
        if (ms * 32 === this.preDelay) return;
        this.preDelay = ms * 32;
        this.place();
    }

    /**
     * @param ms The gate time, 5 to 500 ms.
     */
    public setGateTime(ms: number) {
        if (ms * 32 === this.gateTime) return;
        this.gateTime = ms * 32;
        this.place();
    }

    public process(x: number) {
        const { diffuser, step, fade, line, gains } = this;
        if (fade.tick()) {
            this.previousLeft.set(this.delaysLeft);
            this.previousRight.set(this.delaysRight);
            this.delaysLeft.set(this.targetsLeft);
            this.delaysRight.set(this.targetsRight);
        }
        let v = this.dcBlocker.process(x);
        for (let k = 0; k < 4; k++) {
            // The allpass: w = x - g w[n-N], y = w[n-N] + g w
            const d = diffuser[k].readSinc(DIFFUSER[k] * step - 1);
            const w = v - ALLPASS * d;
            diffuser[k].write(w);
            v = d + ALLPASS * w;
        }
        line.write(v);
        let left = 0;
        let right = 0;
        for (let i = 0; i < 12; i++) {
            left += gains[i] * line.readSinc(this.delaysLeft[i]);
            right += gains[i + 12] * line.readSinc(this.delaysRight[i]);
        }
        if (fade.active) {
            let oldLeft = 0;
            let oldRight = 0;
            for (let i = 0; i < 12; i++) {
                oldLeft += gains[i] * line.readSinc(this.previousLeft[i]);
                oldRight +=
                    gains[i + 12] * line.readSinc(this.previousRight[i]);
            }
            left = oldLeft + fade.gain * (left - oldLeft);
            right = oldRight + fade.gain * (right - oldRight);
        }
        this.left = left;
        this.right = right;
    }

    public clear() {
        this.dcBlocker.clear();
        for (const line of this.diffuser) line.clear();
        this.line.clear();
        this.fade.clear();
        this.left = this.right = 0;
    }

    /**
     * Places the taps for the pre delay and the gate time.
     */
    private place() {
        for (let i = 0; i < 12; i++) {
            const left =
                this.preDelay + Math.round(TAPS_LEFT[i] * this.gateTime) - 1;
            const right =
                this.preDelay +
                RIGHT_OFFSET +
                Math.round(TAPS_RIGHT[i] * this.gateTime);
            this.targetsLeft[i] = Math.max(0, left * this.step);
            this.targetsRight[i] = Math.max(0, right * this.step);
        }
        this.fade.request();
    }
}
