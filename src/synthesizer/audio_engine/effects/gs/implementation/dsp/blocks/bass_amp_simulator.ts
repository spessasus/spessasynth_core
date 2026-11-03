import { FirstOrderFilter } from "./first_order_filter";
import { StateVariableFilter } from "./state_variable_filter";

interface BassAmpModel {
    /**
     * The first order high pass in front (corner in Hz, gain at Nyquist), or none.
     */
    highPass?: [number, number];
    /**
     * The resonant high pass (corner in Hz, Q 4), or none.
     */
    resonantHighPass?: number;
    /**
     * The resonant low pass (corner in Hz, Q).
     */
    lowPass: [number, number];
    /**
     * The amp's flat gains put together.
     */
    gain: number;
}

/**
 * The three bass amps. The resonances are the hardware's Chamberlin filters at 32 kHz (their coefficient words
 * give the corners). The gains are the input gains of both filters and the output level.
 */
const BASS_AMP_MODELS: BassAmpModel[] = [
    {
        highPass: [39.945, 0.996_08],
        resonantHighPass: 162.43,
        lowPass: [2000, 4],
        gain: 0.5 * (127 / 128) * 0.9375
    },
    {
        highPass: [80.2, 1],
        lowPass: [2000, 8],
        // The resonant high pass is off, which leaves half of its input gain
        gain: 0.25 * (127 / 128) * 2.5
    },
    {
        resonantHighPass: 39.945,
        lowPass: [4000, 4],
        gain: (127 / 128) * 0.5 * (127 / 128) * 1.875
    }
];

/**
 * Bass Multi's amp simulator: a first order high pass, a resonant high pass and a resonant low pass (each Q 4 or
 * more), so a boost at the bottom and the top of the bass range.
 * @internal
 */
export class BassAmpSimulator {
    private readonly highPass: FirstOrderFilter;
    private readonly resonantHighPass: StateVariableFilter;
    private readonly lowPass: StateVariableFilter;
    private gain = 0;

    public constructor(sampleRate: number) {
        this.highPass = new FirstOrderFilter(sampleRate);
        this.resonantHighPass = new StateVariableFilter(sampleRate);
        this.lowPass = new StateVariableFilter(sampleRate);
    }

    /**
     * @param type The amp (0-2).
     */
    public setType(type: number) {
        const m = BASS_AMP_MODELS[type];
        if (m.highPass) {
            this.highPass.setHighPass(m.highPass[0], m.highPass[1]);
        } else {
            this.highPass.setOff();
        }
        if (m.resonantHighPass) {
            this.resonantHighPass.setHighPass(m.resonantHighPass, 4);
        } else {
            this.resonantHighPass.setOff();
        }
        this.lowPass.setLowPass(m.lowPass[0], m.lowPass[1]);
        this.gain = m.gain;
    }

    public process(x: number) {
        return (
            this.gain *
            this.lowPass.process(
                this.resonantHighPass.process(this.highPass.process(x))
            )
        );
    }

    public clear() {
        this.highPass.clear();
        this.resonantHighPass.clear();
        this.lowPass.clear();
    }
}
