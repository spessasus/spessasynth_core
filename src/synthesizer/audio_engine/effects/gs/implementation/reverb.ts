import type {
    GSReverbParameter,
    GSReverbProcessor
} from "../interface/gs_reverb_processor";
import { DelayLine } from "./dsp/blocks/delay_line";
import { FirstOrderFilter } from "./dsp/blocks/first_order_filter";
import { LEVEL_UNITY, SendInput } from "./dsp/blocks/send_input";
import { HARDWARE_RATE } from "./dsp/hardware";

/**
 * The lines an output tap can read: the diffuser's four allpasses, then per tank its first allpass, first delay,
 * second allpass and second delay. An allpass line holds the allpass's sum node.
 */
const LINES = {
    diffuser1: 0,
    diffuser2: 1,
    diffuser3: 2,
    diffuser4: 3,
    leftAllpass1: 4,
    leftDelay1: 5,
    leftAllpass2: 6,
    leftDelay2: 7,
    rightAllpass1: 8,
    rightDelay1: 9,
    rightAllpass2: 10,
    rightDelay2: 11
} as const;
type Line = (typeof LINES)[keyof typeof LINES];

/**
 * An output tap: a line and its delay in 32 kHz samples.
 */
type Tap = [line: Line, delay: number];

/**
 * The delays of one tank in 32 kHz samples, in signal order.
 */
interface TankLengths {
    allpass1: number;
    delay1: number;
    allpass2: number;
    delay2: number;
}

interface TankSetup extends TankLengths {
    /**
     * The pole of the damping low pass at 32 kHz.
     */
    damping: number;
}

/**
 * A reverb character. Delays are in 32 kHz samples, as the Sound Canvas holds them.
 */
interface ReverbCharacter {
    /**
     * The gain into the pre delay.
     */
    inputGain: number;
    /**
     * The diffuser's four stages.
     */
    diffuser: [number, number, number, number];
    /**
     * Whether the fourth stage is an allpass like the other three, or a plain delay.
     */
    diffuser4Allpass: boolean;
    left: TankSetup;
    right: TankSetup;
    /**
     * Four taps per output, spread over both tanks (and the diffuser in the rooms).
     */
    outLeft: Tap[];
    outRight: Tap[];
}

const L = LINES;

// The poles of the three damping low passes the characters pick from
const DAMP_BRIGHT = 1 / 8;
const DAMP_MEDIUM = 2 / 8;
const DAMP_DARK = 31 / 64;

/**
 * The tanks feed back inverted, at 0.55 of the time gain. The DLL folds this into the damping filter's gain,
 * rounded to 1/64 (at pole 1/4 that is -0.55 (1 - 1/4) = -26.4/64, stored as -26/64).
 */
const DAMPING_GAIN = -0.55;

/**
 * The gain g of every allpass, H(z) = (g + z^-N) / (1 + g z^-N).
 */
const ALLPASS_GAIN = 0.5;

// Room 1 and Plate share the small tanks, Room 2, Room 3 and Hall 1 the medium ones
const SMALL_DIFFUSER: [number, number, number, number] = [323, 239, 143, 1];
const SMALL_LEFT: TankLengths = {
    allpass1: 247,
    delay1: 827,
    allpass2: 506,
    delay2: 1695
};
const SMALL_RIGHT: TankLengths = {
    allpass1: 267,
    delay1: 895,
    allpass2: 467,
    delay2: 1565
};
const MEDIUM_DIFFUSER: [number, number, number, number] = [917, 378, 111, 77];
const MEDIUM_LEFT: TankLengths = {
    allpass1: 666,
    delay1: 1914,
    allpass2: 814,
    delay2: 2340
};
const MEDIUM_RIGHT: TankLengths = {
    allpass1: 743,
    delay1: 2137,
    allpass2: 782,
    delay2: 2249
};
// Room 2 and Room 3 share their taps
const MEDIUM_TAPS_LEFT: Tap[] = [
    [L.diffuser4, 20],
    [L.leftDelay2, 585],
    [L.rightDelay1, 478],
    [L.rightDelay2, 562]
];
const MEDIUM_TAPS_RIGHT: Tap[] = [
    [L.diffuser4, 20],
    [L.leftDelay2, 1895],
    [L.rightDelay1, 1550],
    [L.rightDelay2, 1821]
];

/**
 * Room 1, Room 2, Room 3, Hall 1, Hall 2 and Plate, as Sound Canvas VA sets them up.
 */
const CHARACTERS: ReverbCharacter[] = [
    {
        // Room 1
        inputGain: 1 / 8,
        diffuser: SMALL_DIFFUSER,
        diffuser4Allpass: false,
        left: { ...SMALL_LEFT, damping: DAMP_MEDIUM },
        right: { ...SMALL_RIGHT, damping: DAMP_DARK },
        outLeft: [
            [L.leftAllpass1, 0],
            [L.leftDelay2, 942],
            [L.rightDelay1, 150],
            [L.rightDelay2, 261]
        ],
        outRight: [
            [L.leftAllpass1, 0],
            [L.leftDelay2, 283],
            [L.rightDelay1, 497],
            [L.rightDelay2, 869]
        ]
    },
    {
        // Room 2
        inputGain: 1 / 8,
        diffuser: MEDIUM_DIFFUSER,
        diffuser4Allpass: false,
        left: { ...MEDIUM_LEFT, damping: DAMP_BRIGHT },
        right: { ...MEDIUM_RIGHT, damping: DAMP_DARK },
        outLeft: MEDIUM_TAPS_LEFT,
        outRight: MEDIUM_TAPS_RIGHT
    },
    {
        // Room 3
        inputGain: 1 / 8,
        diffuser: MEDIUM_DIFFUSER,
        diffuser4Allpass: false,
        left: { ...MEDIUM_LEFT, damping: DAMP_DARK },
        right: { ...MEDIUM_RIGHT, damping: DAMP_DARK },
        outLeft: MEDIUM_TAPS_LEFT,
        outRight: MEDIUM_TAPS_RIGHT
    },
    {
        // Hall 1, the only one with twice the input (the DLL does not say why)
        inputGain: 1 / 4,
        diffuser: MEDIUM_DIFFUSER,
        diffuser4Allpass: false,
        left: { ...MEDIUM_LEFT, damping: DAMP_DARK },
        right: { ...MEDIUM_RIGHT, damping: DAMP_DARK },
        outLeft: [
            [L.leftDelay1, 1550],
            [L.leftDelay2, 1895],
            [L.rightDelay1, 534],
            [L.rightDelay2, 562]
        ],
        outRight: [
            [L.leftDelay1, 478],
            [L.leftDelay2, 585],
            [L.rightDelay1, 1730],
            [L.rightDelay2, 1821]
        ]
    },
    {
        // Hall 2
        inputGain: 1 / 8,
        diffuser: [926, 381, 112, 1],
        diffuser4Allpass: true,
        left: {
            allpass1: 774,
            delay1: 2227,
            allpass2: 950,
            delay2: 2731,
            damping: DAMP_DARK
        },
        right: {
            allpass1: 860,
            delay1: 2474,
            allpass2: 909,
            delay2: 1989,
            damping: DAMP_DARK
        },
        outLeft: [
            [L.leftDelay1, 1803],
            [L.leftDelay2, 2212],
            [L.rightDelay1, 618],
            [L.rightDelay2, 384]
        ],
        outRight: [
            [L.leftDelay1, 556],
            [L.leftDelay2, 682],
            [L.rightDelay1, 2003],
            [L.rightDelay2, 1734]
        ]
    },
    {
        // Plate
        inputGain: 1 / 8,
        diffuser: SMALL_DIFFUSER,
        diffuser4Allpass: true,
        left: { ...SMALL_LEFT, damping: DAMP_BRIGHT },
        right: { ...SMALL_RIGHT, damping: DAMP_MEDIUM },
        outLeft: [
            [L.leftDelay1, 459],
            [L.leftDelay2, 942],
            [L.rightDelay1, 150],
            [L.rightDelay2, 261]
        ],
        outRight: [
            [L.leftDelay1, 138],
            [L.leftDelay2, 283],
            [L.rightDelay1, 497],
            [L.rightDelay2, 869]
        ]
    }
];

/**
 * Characters 0 to 5 run the tanks, these two run a single feedback delay line.
 */
const CHARACTER_DELAY = 6;
const CHARACTER_PANNING_DELAY = 7;

// The longest any character makes each line, in 32 kHz samples
const MAX_DIFFUSER = [0, 1, 2, 3].map((stage) =>
    Math.max(...CHARACTERS.map((c) => c.diffuser[stage]))
);
const maxTank = (key: keyof TankLengths) =>
    Math.max(...CHARACTERS.flatMap((c) => [c.left[key], c.right[key]]));
const MAX_TANK: TankLengths = {
    allpass1: maxTank("allpass1"),
    delay1: maxTank("delay1"),
    allpass2: maxTank("allpass2"),
    delay2: maxTank("delay2")
};

/**
 * The longest pre delay, in ms.
 */
const MAX_PRE_DELAY = 127;

/**
 * The largest gain the reverb's feedback word holds. The time gain grows to it at REVERB TIME 108, the delay
 * characters' feedback at DELAY FEEDBACK 95 (95/64 is the same 380/256).
 */
const FEEDBACK_LIMIT = 380 / 256;
const TIME_AT_LIMIT = 108;

/**
 * The delay characters' line is `DELAY_BASE + DELAY_STEP * time` 32 kHz samples (0.4 to 445 ms).
 * The panning delay's left output sits at half the step.
 */
const DELAY_BASE = 13;
const DELAY_STEP = 112;

/**
 * The gain of the delay characters' feedback at DELAY FEEDBACK 64, where the feedback word is 1.
 * The DLL feeds back through the nearly flat low pass `-31/64 x + 1/64 y[n-1]`, this is its gain at DC.
 * The repeats come back inverted.
 */
const DELAY_FEEDBACK_GAIN = -31 / 63;

/**
 * A delay of the Sound Canvas in whole host samples, at least one.
 * @param samples The delay in 32 kHz samples.
 * @param step One 32 kHz sample in host samples.
 */
function toHostSamples(samples: number, step: number) {
    return Math.max(1, Math.round(samples * step));
}

/**
 * A Schroeder allpass: w = x - g w[n-N], y = w[n-N] + g w. Its line holds w, which some taps read.
 */
class Allpass {
    public readonly line;
    public gain = ALLPASS_GAIN;
    /**
     * N - 1, since the read comes before the write.
     * @private
     */
    private delay = 0;

    public constructor(maxDelay: number) {
        this.line = new DelayLine(maxDelay);
    }

    /**
     * @param samples N, in host samples.
     */
    public setLength(samples: number) {
        this.delay = samples - 1;
    }

    public process(x: number) {
        const delayed = this.line.read(this.delay);
        const w = x - this.gain * delayed;
        this.line.write(w);
        return delayed + this.gain * w;
    }
}

/**
 * One tank: allpass, delay, allpass, delay, then the damping low pass and the feedback gain back to its start.
 */
class ReverbTank {
    public readonly allpass1;
    public readonly delay1;
    public readonly allpass2;
    public readonly delay2;
    public readonly damping;
    private delay1Length = 1;
    private delay2Length = 1;

    public constructor(sampleRate: number, step: number) {
        this.allpass1 = new Allpass(Math.ceil(MAX_TANK.allpass1 * step));
        this.delay1 = new DelayLine(Math.ceil(MAX_TANK.delay1 * step));
        this.allpass2 = new Allpass(Math.ceil(MAX_TANK.allpass2 * step));
        this.delay2 = new DelayLine(Math.ceil(MAX_TANK.delay2 * step));
        this.damping = new FirstOrderFilter(sampleRate);
    }

    public setup(tank: TankSetup, step: number) {
        this.allpass1.setLength(toHostSamples(tank.allpass1, step));
        this.delay1Length = toHostSamples(tank.delay1, step);
        this.allpass2.setLength(toHostSamples(tank.allpass2, step));
        this.delay2Length = toHostSamples(tank.delay2, step);
        this.damping.setDampPole(tank.damping);
    }

    /**
     * @param x The diffused input.
     * @param feedback The gain of the way back, before the damping.
     */
    public process(x: number, feedback: number) {
        // The delays read before they write, so a delay of N reads N - 1
        const end = this.delay2.read(this.delay2Length - 1);
        const middle = this.delay1.read(this.delay1Length - 1);
        this.delay1.write(
            this.allpass1.process(x + feedback * this.damping.process(end))
        );
        this.delay2.write(this.allpass2.process(middle));
    }

    public clear() {
        this.allpass1.line.clear();
        this.delay1.clear();
        this.allpass2.line.clear();
        this.delay2.clear();
        this.damping.clear();
    }
}

/**
 * The default GS Reverb implementation for {@link SpessaSynthProcessor}.
 *
 * It is modeled on the reverb of the Sound Canvas (as Sound Canvas VA runs it): a mono input through a DC blocker
 * and the PRE-LPF into a pre delay, a diffuser of four Schroeder allpasses, then two independent tanks
 * (allpass, delay, allpass, delay, a damping low pass and the time gain back to the start).
 * The stereo image comes from the output taps alone, four per side.
 * The characters differ in the delays, the taps and the damping.
 * The two delay characters are a single delay line with a feedback. The DLL's 1/4 input gain and four equal 1/4
 * taps cancel there, so neither appears.
 *
 * The delays are the 32 kHz sample counts of the Sound Canvas, rounded to whole samples at the host rate.
 *
 * @group Synthesizer.GS Effects
 */
export class DefaultGSReverb implements GSReverbProcessor {
    private readonly sampleRate;
    /**
     * One 32 kHz sample in host samples.
     * @private
     */
    private readonly step;
    private readonly input;
    private readonly preDelayLine;
    private readonly diffuser: Allpass[];
    private readonly left;
    private readonly right;
    /**
     * Every line, in `LINES` order, for the taps to read.
     * @private
     */
    private readonly lines: DelayLine[];
    // The line each output tap reads and its delay in host samples, four left, then four right
    private readonly taps: DelayLine[];
    private readonly tapDelays = new Int32Array(8);
    /**
     * The line of the delay characters.
     * @private
     */
    private readonly delayLine;

    private inputGain = 0;
    /**
     * The gain per pass through a tank, before the damping.
     * @private
     */
    private timeGain = 0;
    private outputGain = 1;
    private preDelaySamples = 0;
    private delayCharacter = false;
    private panning = false;
    // The delay characters: the delay, the panning delay's left tap and the feedback gain
    private delaySamples = 1;
    private delayHalfSamples = 1;
    private delayFeedbackGain = 0;

    /**
     * Constructs a new default GS reverb processor.
     * @param sampleRate The sample rate, in Hertz.
     * @param maxBufferSize The maximum buffer size the synthesizer can render at once.
     * Processing more samples than this is not supported and produces undefined output.
     */
    public constructor(sampleRate: number, maxBufferSize: number) {
        this.sampleRate = sampleRate;
        const step = sampleRate / HARDWARE_RATE;
        this.step = step;
        this.input = new SendInput(sampleRate);
        this.preDelayLine = new DelayLine(
            Math.ceil((MAX_PRE_DELAY * sampleRate) / 1000)
        );
        this.diffuser = MAX_DIFFUSER.map(
            (length) => new Allpass(Math.ceil(length * step))
        );
        this.left = new ReverbTank(sampleRate, step);
        this.right = new ReverbTank(sampleRate, step);
        const { left, right } = this;
        this.lines = [
            ...this.diffuser.map((stage) => stage.line),
            left.allpass1.line,
            left.delay1,
            left.allpass2.line,
            left.delay2,
            right.allpass1.line,
            right.delay1,
            right.allpass2.line,
            right.delay2
        ];
        this.taps = new Array<DelayLine>(8).fill(this.lines[0]);
        this.delayLine = new DelayLine(
            Math.ceil((DELAY_BASE + DELAY_STEP * 127) * step)
        );
        this.reset();
        // For consistency across effects
        void maxBufferSize;
    }

    private _level = LEVEL_UNITY;

    public get level(): number {
        return this._level;
    }

    public set level(value: number) {
        this._level = value;
        this.outputGain = value / LEVEL_UNITY;
    }

    private _delayFeedback = 0;

    public get delayFeedback(): number {
        return this._delayFeedback;
    }

    public set delayFeedback(value: number) {
        this._delayFeedback = value;
        // DELAY FEEDBACK is the feedback word over 64
        this.delayFeedbackGain =
            DELAY_FEEDBACK_GAIN * Math.min(value / 64, FEEDBACK_LIMIT);
    }

    private _character = 0;

    public get character(): number {
        return this._character;
    }

    public set character(value: number) {
        // The lines hold the old character's sound
        if (value !== this._character) this.clear();
        this._character = value;
        this.delayCharacter =
            value === CHARACTER_DELAY || value === CHARACTER_PANNING_DELAY;
        this.panning = value === CHARACTER_PANNING_DELAY;

        // An unknown character is the first one
        const c = CHARACTERS[value] ?? CHARACTERS[0];
        const step = this.step;
        for (let stage = 0; stage < 4; stage++) {
            this.diffuser[stage].setLength(
                toHostSamples(c.diffuser[stage], step)
            );
        }
        this.diffuser[3].gain = c.diffuser4Allpass ? ALLPASS_GAIN : 0;
        this.left.setup(c.left, step);
        this.right.setup(c.right, step);
        for (let i = 0; i < 8; i++) {
            const [line, delay] = i < 4 ? c.outLeft[i] : c.outRight[i - 4];
            this.taps[i] = this.lines[line];
            this.tapDelays[i] = Math.round(delay * step);
        }
        this.inputGain = c.inputGain;
    }

    private _time = 0;

    public get time(): number {
        return this._time;
    }

    public set time(value: number) {
        this._time = value;
        value = Math.max(0, Math.min(value, 127));
        this.timeGain =
            (FEEDBACK_LIMIT * Math.min(value, TIME_AT_LIMIT)) / TIME_AT_LIMIT;
        this.delaySamples = toHostSamples(
            DELAY_BASE + DELAY_STEP * value,
            this.step
        );
        this.delayHalfSamples = toHostSamples(
            DELAY_BASE + (DELAY_STEP / 2) * value,
            this.step
        );
    }

    private _preDelayTime = 0;

    public get preDelayTime(): number {
        return this._preDelayTime;
    }

    public set preDelayTime(value: number) {
        this._preDelayTime = value;
        this.preDelaySamples = Math.round(
            (Math.max(0, Math.min(value, MAX_PRE_DELAY)) * this.sampleRate) /
                1000
        );
    }

    private _preLowpass = 0;

    public get preLowpass(): number {
        return this._preLowpass;
    }

    public set preLowpass(value: number) {
        this._preLowpass = value;
        this.input.setPreLowPass(value);
    }

    /**
     * Process the effect and **adds** it to the output.
     * @param input The input buffer to process. It always starts at index 0.
     * @param outputLeft The left output buffer.
     * @param outputRight The right output buffer.
     * @param startIndex The index to start mixing at into the output buffers.
     * @param sampleCount The amount of samples to mix.
     */
    public process(
        input: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        startIndex: number,
        sampleCount: number
    ) {
        if (this.delayCharacter) {
            this.processDelay(
                input,
                outputLeft,
                outputRight,
                startIndex,
                sampleCount
            );
            return;
        }
        const {
            diffuser,
            left,
            right,
            taps,
            tapDelays,
            preDelayLine,
            preDelaySamples,
            inputGain,
            outputGain
        } = this;
        const feedback = this.timeGain * DAMPING_GAIN;
        for (let i = 0; i < sampleCount; i++) {
            preDelayLine.write(inputGain * this.input.process(input[i]));
            let x = preDelayLine.read(preDelaySamples);
            for (let stage = 0; stage < 4; stage++) {
                x = diffuser[stage].process(x);
            }

            left.process(x, feedback);
            right.process(x, feedback);

            let outLeft = 0;
            let outRight = 0;
            for (let tap = 0; tap < 4; tap++) {
                outLeft += taps[tap].read(tapDelays[tap]);
                outRight += taps[tap + 4].read(tapDelays[tap + 4]);
            }
            const o = startIndex + i;
            outputLeft[o] += outLeft * outputGain;
            outputRight[o] += outRight * outputGain;
        }
    }

    public reset() {
        this.clear();
        this.level = LEVEL_UNITY;
        this.preLowpass = 0;
        this.character = 0;
        this.time = 0;
        this.delayFeedback = 0;
        this.preDelayTime = 0;
    }

    public getSnapshot(): GSReverbParameter {
        return {
            level: this._level,
            preLowpass: this._preLowpass,
            character: this._character,
            time: this._time,
            delayFeedback: this._delayFeedback,
            preDelayTime: this._preDelayTime
        };
    }

    public applySnapshot(snapshot: GSReverbParameter) {
        this.level = snapshot.level;
        this.preLowpass = snapshot.preLowpass;
        this.character = snapshot.character;
        this.time = snapshot.time;
        this.delayFeedback = snapshot.delayFeedback;
        this.preDelayTime = snapshot.preDelayTime;
    }

    private clear() {
        this.input.clear();
        this.preDelayLine.clear();
        for (const stage of this.diffuser) stage.line.clear();
        this.left.clear();
        this.right.clear();
        this.delayLine.clear();
    }

    /**
     * The delay characters: one delay line that feeds back.
     * The panning delay takes its left output from the middle of the line, so the repeats alternate.
     */
    private processDelay(
        input: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        startIndex: number,
        sampleCount: number
    ) {
        const {
            delayLine,
            preDelayLine,
            delaySamples,
            delayHalfSamples,
            delayFeedbackGain,
            preDelaySamples,
            outputGain,
            panning
        } = this;
        for (let i = 0; i < sampleCount; i++) {
            preDelayLine.write(this.input.process(input[i]));
            const echo = delayLine.read(delaySamples - 1);
            delayLine.write(
                preDelayLine.read(preDelaySamples) + delayFeedbackGain * echo
            );
            const o = startIndex + i;
            outputLeft[o] +=
                outputGain *
                (panning ? delayLine.read(delayHalfSamples) : echo);
            outputRight[o] += outputGain * echo;
        }
    }
}
