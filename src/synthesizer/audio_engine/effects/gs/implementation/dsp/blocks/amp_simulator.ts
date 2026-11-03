import { FirstOrderFilter } from "./first_order_filter";
import { Biquad } from "./biquad";
import { StateVariableFilter } from "./state_variable_filter";
import { DelayLine } from "./delay_line";

/**
 * The cabinet echo of the 3 Stack (27 samples on the hardware).
 */
const COMB_SECONDS = 27 / 32_000;

interface AmpModel {
    /**
     * The low shelf in front of the amp (corner in Hz, gain in dB), or none.
     */
    shelf?: [number, number];
    highPass: [number, number];
    /**
     * The cabinet resonance: poles in Hz and Q, zeros in Hz and Q.
     */
    cabinet?: [number, number, number, number];
    lowPass: [number, number];
    gain: number;
    /**
     * The level of the cabinet echo.
     */
    echo: number;
}

/**
 * The four amps: Small, Built-In, 2 Stack and 3 Stack. The resonances are the hardware's (Q 1.5 is a damping of
 * 85/128). The gains are each amp's flat input gain, filter input gains and output level put together.
 */
const AMP_MODELS: AmpModel[] = [
    {
        shelf: [995, -6],
        highPass: [200, 128 / 85],
        // +6 dB at 500 Hz
        cabinet: [499.4, 2, 499.1, 1],
        lowPass: [4000, 128 / 85],
        gain: 0.565,
        echo: 0
    },
    {
        highPass: [100, 128 / 127],
        // -10 dB at 396 Hz
        cabinet: [395.7, 0.4946, 395.3, 1.5645],
        lowPass: [4000, 128 / 127],
        gain: 1.7543,
        echo: 0
    },
    {
        highPass: [100, 128 / 85],
        lowPass: [3500, 128 / 85],
        gain: 1.0749,
        echo: 0
    },
    {
        shelf: [1390, -6],
        highPass: [100, 2],
        // A resonance at 95 Hz over a dip at 109 Hz, +2.4 dB at DC
        cabinet: [94.94, 2.575, 109.1, 1.85],
        lowPass: [4000, 128 / 85],
        gain: 1.3038,
        echo: 0.4648
    }
];

/**
 * The guitar amp simulator: a low shelf, a resonant high pass, the cabinet resonance, a resonant low pass and
 * (3 Stack only) a short cabinet echo.
 * @internal
 */
export class AmpSimulator {
    private readonly shelf: FirstOrderFilter;
    private readonly highPass: StateVariableFilter;
    private readonly cabinet: Biquad;
    private readonly lowPass: StateVariableFilter;
    private readonly comb: DelayLine;
    private readonly combDelay: number;
    private gain = 0;
    private echo = 0;

    public constructor(sampleRate: number) {
        this.shelf = new FirstOrderFilter(sampleRate);
        this.highPass = new StateVariableFilter(sampleRate);
        this.cabinet = new Biquad(sampleRate);
        this.lowPass = new StateVariableFilter(sampleRate);
        this.combDelay = COMB_SECONDS * sampleRate;
        this.comb = new DelayLine(Math.ceil(this.combDelay) + 1);
    }

    /**
     * @param type The amp (0-3: Small, Built-In, 2 Stack, 3 Stack).
     */
    public setType(type: number) {
        const m = AMP_MODELS[type];
        if (m.shelf) {
            this.shelf.setLowShelf(m.shelf[0], m.shelf[1]);
        } else {
            this.shelf.setOff();
        }
        this.highPass.setHighPass(m.highPass[0], m.highPass[1]);
        if (m.cabinet) {
            this.cabinet.setPoleZero(...m.cabinet);
        } else {
            this.cabinet.setOff();
        }
        this.lowPass.setLowPass(m.lowPass[0], m.lowPass[1]);
        this.gain = m.gain;
        this.echo = m.echo;
    }

    public process(x: number) {
        const y = this.lowPass.process(
            this.cabinet.process(this.highPass.process(this.shelf.process(x)))
        );
        this.comb.write(y);
        return this.gain * y + this.echo * this.comb.readLinear(this.combDelay);
    }

    public clear() {
        this.shelf.clear();
        this.highPass.clear();
        this.cabinet.clear();
        this.lowPass.clear();
        this.comb.clear();
    }
}
