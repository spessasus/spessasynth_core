import { FirstOrderFilter } from "./first_order_filter";

/**
 * The LPF column's low pass per step (`value >> 3`): the hardware's bytes (gain A over 128 on both taps, pole B over
 * 128). The last step (13.5 kHz) is off.
 */
const CUTOFF_A = [3, 4, 5, 6, 7, 9, 11, 14, 18, 21, 26, 31, 37, 45, 53, 64];
const CUTOFF_B = [
    122, 120, 118, 116, 113, 109, 105, 100, 93, 86, 77, 66, 53, 39, 22, 0
];

/**
 * Sets a first order low pass from the Cut and LPF columns' bytes (the corner of the pole, the DC gain of the taps).
 * @param filter The filter.
 * @param value The parameter (0-127).
 * @param off Whether the last step bypasses the filter (the noise low passes).
 * @internal
 */
export function setColumnLowPass(
    filter: FirstOrderFilter,
    value: number,
    off: boolean
) {
    const step = value >> 3;
    if (off && step === 15) {
        filter.setGain(127 / 128);
        return;
    }
    const pole = CUTOFF_B[step] / 128;
    filter.setLowPass(
        (32_000 / Math.PI) * Math.atan((1 - pole) / (1 + pole)),
        (2 * CUTOFF_A[step]) / 128 / (1 - pole)
    );
}

/**
 * Sets a first order high pass from the Cut column's bytes (its taps are 128 - A over 128, the same pole).
 * @param filter The filter.
 * @param value The parameter (0-127).
 * @internal
 */
export function setColumnHighPass(filter: FirstOrderFilter, value: number) {
    const step = value >> 3;
    const pole = CUTOFF_B[step] / 128;
    filter.setHighPass(
        (32_000 / Math.PI) * Math.atan((1 - pole) / (1 + pole)),
        (2 * (128 - CUTOFF_A[step])) / 128 / (1 + pole)
    );
}

/**
 * The disc's turn words per type (LP, EP, SP, RND): 0.555, 0.750 and 1.299 turns per second.
 */
const DISC_WORDS = [0x04_8c, 0x06_24, 0x0a_a4, 0x04_8c];

/**
 * The hum's words per type: 50 and 60 Hz.
 */
const HUM_WORDS = [0x06_66, 0x07_ae];

/**
 * The disc's click window: the click sounds while the rotation phase is this close to its wrap.
 */
const CLICK = 0.5 / (0.500_061_035_156_25 + 1e-5);

/**
 * The hardware program's tiny offset against denormals, added after its clamps and wraps.
 */
const OFFSET = Math.fround(1e-8);

/**
 * The memory the hardware program starts from.
 */
const SEED = Math.fround(1e-5);

/**
 * The 1/8 that the white noise recursion adds through two delayed copies (0.297 in all). The copies still hold the
 * memory's seed for the first two samples.
 */
const WHITE_EIGHTH = Math.fround(0.125 + OFFSET);

/**
 * Wraps a phase to -1 to 1 in float precision with the offset, as the hardware program does.
 * @param x The phase.
 */
function wrap32(x: number) {
    let v = Math.fround(Math.fround(x) + OFFSET);
    while (v < -1) v = Math.fround(v + 2);
    while (v >= 1) v = Math.fround(v - 2);
    return v;
}

/**
 * The program's saturating step: in float with the offset, clamped to full scale.
 * @param x The value.
 */
function clamp32(x: number) {
    return Math.max(-1, Math.min(1, Math.fround(Math.fround(x) + OFFSET)));
}

/**
 * Lo-Fi 2's noise sources, each through its own low pass and level:
 *
 * - White (x 1/32) or "pink": the white noise times a 500 Hz saw (on the SC-88Pro too).
 * - Disc: one click per turn of a record at 33 1/3, 45 or 78 rpm, 0.125 + 0.25 abs(saw) while the turn's phase is
 *   within 0.012 % of its wrap. RND adds a second train whose phase is offset by twice the hum's (pseudo-random
 *   times).
 * - Hum: a unipolar 50 or 60 Hz square, 0 or 1/16 (it carries DC, on the hardware too).
 *
 * The phases run the hardware program's own arithmetic, in float, on a 32 kHz clock: the click lengths (8, 6 and 4
 * samples) and the RND train's times depend on where the phases land. The disc phase takes a step every second
 * sample (the program reads it two samples back, as two interleaved phases). The white noise is the program's
 * chaotic recursion at 32 kHz, uniform and white. It loops every 89843 samples, which gets short at high rates, so
 * other rates draw the same distribution from xorshift32 instead.
 * @internal
 */
export class NoiseGenerator {
    public output = 0;
    private readonly whiteFilter: FirstOrderFilter;
    private readonly discFilter: FirstOrderFilter;
    private readonly humFilter: FirstOrderFilter;
    /**
     * The 32 kHz clock: 32 kHz samples per host sample, and the time to the next one.
     */
    private readonly scale: number;
    private untilTick = 0;
    private saw = 0;
    private hum = 0;
    /**
     * The two interleaved disc phases, and which one this 32 kHz sample steps.
     */
    private readonly disc = new Float32Array(2);
    private discTrack = 0;
    private sawWord = 0.031_25;
    private humWord = 0;
    private discWord = 0;
    private pink = false;
    private random = false;
    private whiteLevel = 0;
    private discLevel = 0;
    private humLevel = 0;
    /**
     * The white noise recursion's last two values, and its gain at the host rate (the same noise density as at
     * 32 kHz).
     */
    private white1 = 0;
    private white2 = 0;
    private whiteAge = 0;
    private readonly whiteGain: number;
    private readonly exactWhite: boolean;
    private random32 = 1;

    public constructor(sampleRate: number) {
        this.whiteFilter = new FirstOrderFilter(sampleRate);
        this.discFilter = new FirstOrderFilter(sampleRate);
        this.humFilter = new FirstOrderFilter(sampleRate);
        this.scale = 32_000 / sampleRate;
        this.whiteGain = Math.sqrt(1 / this.scale) / 32;
        this.exactWhite = sampleRate === 32_000;
    }

    /**
     * @param pink The pink noise instead of the white.
     * @param lowPass The LPF column value.
     * @param level The level as a gain.
     */
    public setWhite(pink: boolean, lowPass: number, level: number) {
        this.pink = pink;
        setColumnLowPass(this.whiteFilter, lowPass, true);
        this.whiteLevel = level;
    }

    /**
     * @param type The disc type (0-3: LP, EP, SP, RND).
     * @param lowPass The LPF column value.
     * @param level The level as a gain.
     */
    public setDisc(type: number, lowPass: number, level: number) {
        const word = DISC_WORDS[type];
        this.discWord = Math.fround(Math.fround(word / 8192) * 2 ** -11);
        this.random = type === 3;
        setColumnLowPass(this.discFilter, lowPass, true);
        this.discLevel = level;
    }

    /**
     * @param type The hum type (0 50 Hz, 1 60 Hz).
     * @param lowPass The LPF column value.
     * @param level The level as a gain.
     */
    public setHum(type: number, lowPass: number, level: number) {
        const word = HUM_WORDS[type];
        this.humWord = Math.fround(Math.fround(word / 8192) * 2 ** -6);
        setColumnLowPass(this.humFilter, lowPass, true);
        this.humLevel = level;
    }

    public process() {
        // The phases step on the 32 kHz clock, with the program's own constants (its seeds included)
        for (
            this.untilTick -= 1;
            this.untilTick < 1e-9;
            this.untilTick += 1 / this.scale
        ) {
            this.saw = wrap32(this.saw + this.sawWord);
            this.hum = wrap32(this.hum + 1.5625e-7 + this.humWord);
            const track = this.discTrack;
            this.disc[track] = wrap32(
                this.disc[track] + 4.8828e-9 + this.discWord
            );
            this.discTrack = 1 - track;
        }
        const disc = this.disc[1 - this.discTrack];
        const noise =
            (this.pink ? this.saw : 1) * this.white() * this.whiteGain;
        const saw = clamp32(0.5 * Math.abs(this.saw));
        let click = clamp32(Math.abs(disc)) >= CLICK ? 0.5 * saw + 0.125 : 0;
        if (this.random) {
            const offset =
                2 * clamp32((127 / 128) * Math.abs(this.hum)) - disc + 5e-6;
            if (clamp32(Math.abs(wrap32(offset))) >= CLICK) click += 0.5 * saw;
        }
        const hum = this.hum < 0 ? 1 / 16 : 0;
        this.output =
            this.whiteLevel * this.whiteFilter.process(noise) +
            this.discLevel * this.discFilter.process(click) +
            this.humLevel * this.humFilter.process(hum);
        return this.output;
    }

    public clear() {
        this.whiteFilter.clear();
        this.discFilter.clear();
        this.humFilter.clear();
        this.saw = this.hum = SEED;
        this.disc.fill(SEED);
        this.discTrack = 0;
        this.untilTick = 1;
        this.white1 = this.white2 = SEED;
        this.whiteAge = 0;
        this.random32 = 1;
        this.output = 0;
    }

    /**
     * The white noise of this sample, -1 to 1.
     */
    private white() {
        if (!this.exactWhite) {
            let r = this.random32;
            r ^= r << 13;
            r ^= r >>> 17;
            r ^= r << 5;
            this.random32 = r;
            return r / 2_147_483_648;
        }
        // The hardware's white noise: a wrapped second order recursion, chaotic and close to uniform
        // It amplifies any rounding, so it runs in float precision in the hardware's order of operations
        const f = Math.fround;
        const first = this.whiteAge > 0 ? WHITE_EIGHTH : SEED;
        const second = this.whiteAge > 1 ? WHITE_EIGHTH : SEED;
        this.whiteAge = Math.min(this.whiteAge + 1, 2);
        const constant = f(
            f(0.25 * WHITE_EIGHTH) + f(f(first * 1.5) + f(0.625 * second))
        );
        const white = wrap32(
            f(f(f(3 * this.white1) + constant) + f(0.25 * this.white2))
        );
        this.white2 = this.white1;
        this.white1 = white;
        return white;
    }
}
