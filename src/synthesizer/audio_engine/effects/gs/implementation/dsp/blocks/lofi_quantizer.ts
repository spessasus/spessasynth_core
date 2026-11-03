import { DC_BLOCKER_HZ, FirstOrderFilter } from "./first_order_filter";
import { DelayLine } from "./delay_line";

/**
 * Lo-Fi 1's types (0-8) as three resolutions by three hold rates.
 */
const RESOLUTIONS = [
    // 15 bits with the sign, a tiny DC offset, the wet inverted
    { steps: 2 ** 14, offset: 2 ** -10, sign: -1 },
    // 11 bits, a small offset, inverted
    { steps: 2 ** 10, offset: 2 ** -6, sign: -1 },
    // 11 bits, a quarter of full scale as offset (the positive peaks clip at 0.75), not inverted
    { steps: 2 ** 10, offset: 0.25, sign: 1 }
];

/**
 * The hold periods in 32 kHz samples: 16000, 10667 and 8000 Hz.
 */
const HOLD_PERIODS = [2, 3, 4];

/**
 * The newer samples the band-limited read needs around a hold instant.
 */
const LOOKAHEAD = 8;

/**
 * Lo-Fi 1's quantizer: truncation to 15 or 11 bits, a DC offset and a clamp at full scale, a DC blocker that takes
 * the offset out again, a sample and hold at 16000, 10667 or 8000 Hz and the hardware's two-sample average (a
 * first order low pass at 8 kHz).
 * @internal
 */
export class LoFiQuantizer {
    /**
     * How many host samples late the output is: `LOOKAHEAD` where the instants fall between samples, else 0.
     */
    public readonly latency: number;
    private readonly dcBlocker: FirstOrderFilter;
    private readonly smoothing: FirstOrderFilter;
    /**
     * One 32 kHz sample in host samples.
     */
    private readonly step: number;
    private resolution = RESOLUTIONS[0];
    /**
     * The hold period in host samples.
     */
    private period = 2;
    /**
     * Host samples from the start of this output sample to the next hold instant.
     */
    private untilHold = 0;
    private held = 0;
    /**
     * Where the hold instants fall between host samples, the hold reads its value at the exact instant from this line
     * (band-limited, which needs `LOOKAHEAD` newer samples).
     */
    private readonly line: DelayLine;

    public constructor(sampleRate: number) {
        this.step = sampleRate / 32_000;
        this.latency = Number.isInteger(this.step) ? 0 : LOOKAHEAD;
        this.line = new DelayLine(LOOKAHEAD + 2);
        this.dcBlocker = new FirstOrderFilter(sampleRate);
        this.dcBlocker.setHighPass(DC_BLOCKER_HZ);
        this.smoothing = new FirstOrderFilter(sampleRate);
        this.smoothing.setLowPass(8000, 127 / 128);
    }

    /**
     * @param type The Lo-Fi type (0-8).
     */
    public setType(type: number) {
        this.resolution = RESOLUTIONS[Math.floor(type / 3)];
        this.period = HOLD_PERIODS[type % 3] * this.step;
    }

    public process(x: number) {
        const { steps, offset, sign } = this.resolution;
        const q = (sign * Math.trunc(x * steps)) / steps;
        const d = this.dcBlocker.process(Math.max(-1, Math.min(1, q + offset)));
        // At 32 kHz the instants are whole samples
        // Elsewhere the value is read at the exact instant, `latency` samples back, and steps on the next sample
        this.line.write(d);
        if (this.untilHold < 1 - 1e-9) {
            this.held = this.latency
                ? this.line.readSinc(this.latency - Math.max(0, this.untilHold))
                : d;
            this.untilHold += this.period;
        }
        this.untilHold -= 1;
        return this.smoothing.process(this.held);
    }

    public clear() {
        this.dcBlocker.clear();
        this.smoothing.clear();
        // The first hold is one 32 kHz sample in, like the hardware's counter
        this.untilHold = this.step;
        this.held = 0;
        this.line.clear();
    }
}
