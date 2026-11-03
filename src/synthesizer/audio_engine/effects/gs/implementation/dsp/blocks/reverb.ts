import type { DelayMemory } from "./delay_memory";
import { Crossfade } from "./crossfade";
import type { DelayLine } from "./delay_line";
import { DC_BLOCKER_HZ, FirstOrderFilter } from "./first_order_filter";

/**
 * The lines of the reverb. Each holds what one stage writes: the pre delay, the diffuser's three allpasses, then per
 * tank the first allpass, its output (the first delay segment), the second allpass and its output (the second
 * segment, which feeds back). The diffuser's plain delay is part of the pre delay line (a delay in front of the
 * allpasses is the same as one after them).
 */
const LINES = {
    pre: 0,
    diffuser1: 1,
    diffuser2: 2,
    diffuser3: 3,
    leftAllpass1: 4,
    leftSegment1: 5,
    leftAllpass2: 6,
    leftSegment2: 7,
    rightAllpass1: 8,
    rightSegment1: 9,
    rightAllpass2: 10,
    rightSegment2: 11
} as const;
type Line = (typeof LINES)[keyof typeof LINES];

/**
 * An output tap: a line and its delay in 32 kHz samples.
 */
type Tap = [line: Line, delay: number];

/**
 * A character (Room, Stage, Hall). Delays are in 32 kHz samples, as the hardware holds them.
 */
interface ReverbCharacter {
    /**
     * The gain into the pre delay.
     */
    inputGain: number;
    /**
     * The pole of the "1" variant's input low pass (the "2" variant has none).
     */
    inputPole: number;
    /**
     * The diffuser's three allpasses and the plain delay after them.
     */
    diffuser: [number, number, number, number];
    /**
     * Each tank: allpass, delay, allpass, delay.
     */
    left: [number, number, number, number];
    right: [number, number, number, number];
    /**
     * Four taps per output, spread over both tanks (and the diffuser in Room).
     */
    outLeft: Tap[];
    outRight: Tap[];
}

const L = LINES;

/**
 * Room, Stage and Hall. The "1" and "2" types of each differ only in the input low pass.
 */
const CHARACTERS: ReverbCharacter[] = [
    {
        inputGain: 0.125,
        inputPole: 0.617_919_921_875,
        diffuser: [323, 238, 142, 1],
        left: [245, 826, 505, 1694],
        right: [266, 894, 466, 1564],
        outLeft: [
            [L.diffuser3, 142],
            [L.leftSegment2, 941],
            [L.rightSegment1, 149],
            [L.rightSegment2, 260]
        ],
        outRight: [
            [L.diffuser3, 142],
            [L.leftSegment2, 282],
            [L.rightSegment1, 496],
            [L.rightSegment2, 868]
        ]
    },
    {
        inputGain: 0.25,
        inputPole: 0.617_919_921_875,
        diffuser: [917, 377, 110, 76],
        left: [665, 1913, 813, 2339],
        right: [742, 2136, 781, 2248],
        outLeft: [
            [L.leftSegment1, 477],
            [L.leftSegment2, 584],
            [L.rightSegment1, 533],
            [L.rightSegment2, 561]
        ],
        outRight: [
            [L.leftSegment1, 1549],
            [L.leftSegment2, 1894],
            [L.rightSegment1, 1729],
            [L.rightSegment2, 1820]
        ]
    },
    {
        inputGain: 0.125,
        inputPole: 0.548_950_195_312_5,
        diffuser: [523, 339, 216, 1351],
        left: [993, 1536, 635, 3338],
        right: [1228, 2948, 1545, 1352],
        outLeft: [
            [L.leftSegment1, 1106],
            [L.leftSegment2, 2314],
            [L.rightAllpass2, 777],
            [L.rightSegment2, 1721]
        ],
        outRight: [
            [L.leftAllpass2, 205],
            [L.leftSegment2, 2969],
            [L.rightSegment2, 1403],
            [L.rightSegment2, 983]
        ]
    }
];

/**
 * The longest delay any character reads from each line, in 32 kHz samples (the pre delay up to 100 ms with the
 * diffuser's delay).
 */
const LINE_LENGTHS = [
    4552, 917, 377, 216, 993, 1913, 813, 3338, 1228, 2948, 1545, 2248
];

/**
 * How many host samples later the whole forward path runs, and how much earlier the outputs read, so that even the
 * shortest pre delay is read band-limited (the interpolator needs 7 newer samples). The outputs read 141 32 kHz
 * samples or more, so they have room.
 */
const LOOKAHEAD = 8;

/**
 * The gain of every allpass.
 */
const ALLPASS = 0.5;

/**
 * The pre delay line's write and read gains.
 */
const PRE_GAIN = (127 / 128) ** 2;

/**
 * The corner of the hardware's one-pole low pass `(1 - B) x + B y[n-1]` at 32 kHz (-3 dB, the inverse of
 * `FirstOrderFilter.setDamp`).
 * @param pole B.
 */
function dampCorner(pole: number) {
    const k = (1 + pole * pole) / (2 * pole);
    return (Math.acos(2 - k) * 32_000) / (2 * Math.PI);
}

/**
 * The Reverb: a mono input through a DC blocker and an input low pass into a pre delay, a diffuser of three
 * Schroeder allpasses and a delay, then two independent tanks (allpass, delay, allpass, delay, a damping low pass
 * and the time gain back to the start). The stereo image comes from the output taps alone, four per side spread
 * over both tanks.
 *
 * The delays are the hardware's 32 kHz sample counts, read band-limited at other rates. The left output is one
 * 32 kHz sample earlier than the program's (the shared stage reads the left input one sample late, so the program's
 * mono input is one sample behind the dry left), the right one is the program's (its output is one sample late).
 * @internal
 */
export class Reverb {
    public left = 0;
    public right = 0;
    private readonly lines: DelayLine[];
    private readonly dcBlocker: FirstOrderFilter;
    private readonly inputLowPass: FirstOrderFilter;
    private readonly dampLeft: FirstOrderFilter;
    private readonly dampRight: FirstOrderFilter;
    /**
     * One 32 kHz sample in host samples.
     */
    private readonly step: number;
    private character = CHARACTERS[0];
    /**
     * The pre delay read, the one set, and the one read before it while a change crossfades (32 kHz samples).
     */
    private preDelay = 1;
    private targetPreDelay = 1;
    private previousPreDelay = 1;
    private readonly fade: Crossfade;
    private time = 0;

    /**
     * @param sampleRate The sample rate.
     * @param memory The delay memory.
     */
    public constructor(sampleRate: number, memory: DelayMemory) {
        this.step = sampleRate / 32_000;
        this.lines = LINE_LENGTHS.map((length) =>
            memory.line(Math.ceil(length * this.step) + LOOKAHEAD)
        );
        this.dcBlocker = new FirstOrderFilter(sampleRate);
        this.dcBlocker.setHighPass(DC_BLOCKER_HZ);
        this.inputLowPass = new FirstOrderFilter(sampleRate);
        this.dampLeft = new FirstOrderFilter(sampleRate);
        this.dampRight = new FirstOrderFilter(sampleRate);
        this.fade = new Crossfade(sampleRate);
    }

    /**
     * @param type The Reverb type (0-5: Room 1, Room 2, Stage 1, Stage 2, Hall 1, Hall 2).
     */
    public setType(type: number) {
        this.character = CHARACTERS[type >> 1];
        if (type & 1) this.inputLowPass.setOff();
        else this.inputLowPass.setDamp(dampCorner(this.character.inputPole));
    }

    /**
     * @param ms The pre delay (the PreDly column).
     */
    public setPreDelay(ms: number) {
        // One 32 kHz sample more, the program reads the line before it writes it
        if (1 + ms * 32 === this.targetPreDelay) return;
        this.targetPreDelay = 1 + ms * 32;
        this.fade.request();
    }

    /**
     * @param gain The gain per pass through a tank (`reverbTime`).
     */
    public setTime(gain: number) {
        this.time = gain;
    }

    /**
     * @param hz The tanks' damping corner (the HF column), or infinite for none.
     */
    public setDamping(hz: number) {
        if (hz === Infinity) {
            this.dampLeft.setOff();
            this.dampRight.setOff();
        } else {
            this.dampLeft.setDamp(hz);
            this.dampRight.setDamp(hz);
        }
    }

    public process(x: number) {
        const { lines, step, character: c } = this;
        const d1 = this.before(L.diffuser1, c.diffuser[0]);
        const d2 = this.before(L.diffuser2, c.diffuser[1]);
        const d3 = this.before(L.diffuser3, c.diffuser[2]);
        const l1 = this.before(L.leftAllpass1, c.left[0]);
        const lMid = this.before(L.leftSegment1, c.left[1]);
        const l2 = this.before(L.leftAllpass2, c.left[2]);
        const lLoop = this.before(L.leftSegment2, c.left[3]);
        const r1 = this.before(L.rightAllpass1, c.right[0]);
        const rMid = this.before(L.rightSegment1, c.right[1]);
        const r2 = this.before(L.rightAllpass2, c.right[2]);
        const rLoop = this.before(L.rightSegment2, c.right[3]);

        const { fade } = this;
        if (fade.tick()) {
            this.previousPreDelay = this.preDelay;
            this.preDelay = this.targetPreDelay;
        }
        const input = this.inputLowPass.process(this.dcBlocker.process(x));
        lines[L.pre].write(c.inputGain * PRE_GAIN * input);
        let pre = lines[L.pre].readSinc(
            (this.preDelay + c.diffuser[3]) * step + LOOKAHEAD
        );
        if (fade.active) {
            const old = lines[L.pre].readSinc(
                (this.previousPreDelay + c.diffuser[3]) * step + LOOKAHEAD
            );
            pre = old + fade.gain * (pre - old);
        }
        // The diffuser: w = x - g w[n-N], y = w[n-N] + g w
        const w1 = pre - ALLPASS * d1;
        const w2 = d1 + ALLPASS * w1 - ALLPASS * d2;
        const w3 = d2 + ALLPASS * w2 - ALLPASS * d3;
        lines[L.diffuser1].write(w1);
        lines[L.diffuser2].write(w2);
        lines[L.diffuser3].write(w3);
        const diffused = d3 + ALLPASS * w3;
        // The tanks, each fed by the diffused signal
        const lw1 =
            this.time * this.dampLeft.process(lLoop) + diffused - ALLPASS * l1;
        const lw2 = lMid - ALLPASS * l2;
        lines[L.leftAllpass1].write(lw1);
        lines[L.leftSegment1].write(l1 + ALLPASS * lw1);
        lines[L.leftAllpass2].write(lw2);
        lines[L.leftSegment2].write(l2 + ALLPASS * lw2);
        const rw1 =
            this.time * this.dampRight.process(rLoop) + diffused - ALLPASS * r1;
        const rw2 = rMid - ALLPASS * r2;
        lines[L.rightAllpass1].write(rw1);
        lines[L.rightSegment1].write(r1 + ALLPASS * rw1);
        lines[L.rightAllpass2].write(rw2);
        lines[L.rightSegment2].write(r2 + ALLPASS * rw2);

        let left = 0;
        let right = 0;
        for (let i = 0; i < 4; i++) {
            left += this.output(c.outLeft[i], 1);
            right += this.output(c.outRight[i], 0);
        }
        this.left = left;
        this.right = right;
    }

    public clear() {
        for (const line of this.lines) line.clear();
        this.dcBlocker.clear();
        this.inputLowPass.clear();
        this.dampLeft.clear();
        this.dampRight.clear();
        this.fade.clear();
        this.left = this.right = 0;
    }

    /**
     * An output tap, read after this sample's writes.
     * @param tap The tap.
     * @param early How many 32 kHz samples earlier than the program it reads.
     */
    private output(tap: Tap, early: number) {
        // The taps on the diffuser's lines come before its delay, which the pre delay holds here
        const shift = tap[0] <= L.diffuser3 ? this.character.diffuser[3] : 0;
        return this.lines[tap[0]].readSinc(
            (tap[1] - shift - early) * this.step - LOOKAHEAD
        );
    }

    /**
     * A read of what a stage wrote before this sample.
     * @param line The line.
     * @param delay The delay in 32 kHz samples.
     */
    private before(line: Line, delay: number) {
        return this.lines[line].readSinc(delay * this.step - 1);
    }
}
