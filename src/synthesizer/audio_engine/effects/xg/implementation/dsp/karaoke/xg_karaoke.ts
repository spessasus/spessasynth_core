import { XGFilterVariationProgram } from "../xg_filter_variation_program";
import { type XGParameterRanges } from "../xg_dsp_program";
import { MIX_DRY, MIX_WET } from "../xg_dsp_tables";
import { KARAOKE_DELAY } from "./karaoke_tables";

const PARAMETER_RANGES: XGParameterRanges = {
    1: [1, 127],
    2: [0, 52],
    3: [34, 60]
};

// Input filters (b0, b1, a1), echo taps and the density allpasses (four coefficients and two addresses per line)
const LIST_HIGH_PASS = [0x70, 0x6f, 0x71];
const LIST_LOW_PASS = [0x73, 0x72, 0x74];
const LIST_DELAY = [0x34, 0x2b, 0x2f];
const LIST_DENSITY_COEFFICIENT = [
    0x79, 0x78, 0x77, 0x76, 0x7d, 0x7c, 0x7b, 0x7a, 0xb2, 0xb1, 0xb0, 0xaf,
    0xa4, 0xa3, 0xa2, 0xa1
];
const LIST_DENSITY_ADDRESS = [0x28, 0x25, 0x29, 0x26, 0x3c, 0x37, 0x36, 0x33];

/**
 * The converter index of the mono input level, which depends on the connection.
 */
const MONO_INPUT = 16;

/**
 * The S-YXG50 karaoke program, shared by KARAOKE 1-3: a filtered mono echo with diffusion.
 *
 * The mono input goes through a high pass and a low pass, two diffusion allpasses and a damped feedback delay.
 * Two output allpasses decorrelate the left and right echoes.
 */
export abstract class XGKaraokeBase extends XGFilterVariationProgram {
    protected readonly initOrder = [0, 1, 2, 3, 9, 10, MONO_INPUT];
    protected readonly connectionParameters = [9, MONO_INPUT];
    protected readonly ranges = PARAMETER_RANGES;
    // Input filter, echo feedback filter states
    private filterX = 0;
    private filterY = 0;
    private lowY = 0;
    private echoX = 0;
    private readonly mono;
    private readonly dryLeft;
    private readonly dryRight;

    public constructor(
        sampleRate: number,
        maxBufferSize: number,
        memory: Float32Array
    ) {
        super(sampleRate, maxBufferSize, memory);
        this.mono = new Float32Array(maxBufferSize);
        this.dryLeft = new Float32Array(maxBufferSize);
        this.dryRight = new Float32Array(maxBufferSize);
    }

    protected render(
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number,
        outputGain: number
    ) {
        const memory = this.memory;
        const c = this.coefficients;
        const inL = this.inputLeft;
        const inR = this.inputRight;
        const mono = this.mono;
        const dryL = this.dryLeft;
        const dryR = this.dryRight;
        // Dry copies, mono sum and the input filters (high pass, low pass)
        const leftGain = c[0x6d],
            rightGain = c[0x6e],
            dryLeftGain = c[0xb9],
            dryRightGain = c[0xac];
        const hb1 = c[0x6f],
            hb0 = c[0x70],
            ha1 = c[0x71],
            lb1 = c[0x72],
            lb0 = c[0x73],
            la1 = c[0x74];
        let { filterX, filterY, lowY, echoX, pointer } = this;
        for (let i = 0; i < sampleCount; i++) {
            const l = inL[i];
            const r = inR[i];
            dryL[i] = dryLeftGain * l;
            dryR[i] = dryRightGain * r;
            const x = leftGain * l + rightGain * r;
            const y = ha1 * filterY + hb1 * filterX + hb0 * x;
            lowY = lb1 * filterY + la1 * lowY + y * lb0;
            filterX = x;
            filterY = y;
            mono[i] = lowY;
        }

        const mask = this.mask;
        const t = this.taps;
        const t25 = t[0x25],
            t26 = t[0x26],
            t28 = t[0x28],
            t29 = t[0x29],
            t2b = t[0x2b],
            t2f = t[0x2f],
            t33 = t[0x33],
            t34 = t[0x34],
            t36 = t[0x36],
            t37 = t[0x37],
            t38 = t[0x38],
            t3c = t[0x3c];
        const outL = c[0xbb] * outputGain,
            outR = c[0xae] * outputGain;
        for (let i = 0; i < sampleCount; i++) {
            const x = mono[i];
            // Two diffusion allpasses
            const k25 = (t25 + pointer) & mask;
            memory[(t28 + pointer) & mask] =
                c[0x77] * x + memory[k25] * c[0x76];
            const k26 = (t26 + pointer) & mask;
            const diffused = c[0x79] * x + memory[k25] * c[0x78];
            memory[(t29 + pointer) & mask] =
                diffused * c[0x7b] + memory[k26] * c[0x7a];
            // Echo with averaged feedback
            const k34 = (t34 + pointer) & mask;
            memory[(t38 + pointer) & mask] =
                c[0xa5] * echoX +
                (diffused * c[0x7d] + memory[k26] * c[0x7c]) * c[0xa7] +
                memory[k34] * c[0xa6];
            echoX = memory[k34];
            // Output allpasses
            const left = memory[(t2b + pointer) & mask] * c[0x8f];
            const k37 = (t37 + pointer) & mask;
            memory[(t3c + pointer) & mask] =
                left * c[0xb0] + memory[k37] * c[0xaf];
            const wetL = left * c[0xb2] + memory[k37] * c[0xb1];
            const right = memory[(t2f + pointer) & mask] * c[0x9c];
            const k33 = (t33 + pointer) & mask;
            memory[(t36 + pointer) & mask] =
                right * c[0xa2] + memory[k33] * c[0xa1];
            const wetR = right * c[0xa4] + memory[k33] * c[0xa3];
            outputLeft[i] = outL * wetL + dryL[i] * outputGain;
            outputRight[i] = outR * wetR + dryR[i] * outputGain;
            pointer = (pointer - 1) & mask;
        }
        this.filterX = filterX;
        this.filterY = filterY;
        this.lowY = lowY;
        this.echoX = echoX;
        this.pointer = pointer;
    }

    protected override resetState() {
        this.filterX = this.filterY = this.lowY = 0;
        this.echoX = 0;
    }

    protected override clampParameter(param: number, value: number) {
        // The density is fixed per type
        if (param === 10) return this.params[10];
        return super.clampParameter(param, value);
    }

    protected convert(param: number) {
        const p = this.params;
        const w = this.coefficientWords;
        switch (param) {
            case 0: {
                const a = this.addressWords;
                const delay =
                    ((this.toAddress100us(KARAOKE_DELAY[p[0]]) << 16) >> 16) +
                    this.signedAddress(0x3e);
                a[0x2f] = a[0x2b] = a[0x34] = delay & 0xff_ff;
                this.pushAddresses(LIST_DELAY);
                break;
            }
            case 1: {
                // Both feedback taps take half of the level (64 is none)
                w[0xa5] = w[0xa6] = (((p[1] - 0x40) * 125) >> 5) & 0x3_ff;
                this.pushCoefficients([0xa6, 0xa5]);
                break;
            }
            case 2: {
                this.designFirstOrder("highPass", p[2], 0x40, LIST_HIGH_PASS);
                break;
            }
            case 3: {
                this.designFirstOrder("lowPass", p[3], 0x40, LIST_LOW_PASS);
                break;
            }
            case 9: {
                const mix = this.mixIndex();
                w[0xac] = w[0xb9] = MIX_DRY[mix] & 0x3_ff;
                w[0xae] = w[0xbb] = MIX_WET[mix] & 0x3_ff;
                this.pushCoefficients([0xb9]);
                this.pushCoefficients([0xbb]);
                this.pushCoefficients([0xae, 0xac]);
                break;
            }
            case 10: {
                this.densityAllpasses(
                    p[10],
                    10,
                    1,
                    0,
                    LIST_DENSITY_COEFFICIENT,
                    LIST_DENSITY_ADDRESS
                );
                this.pushCoefficients(LIST_DENSITY_COEFFICIENT);
                break;
            }
            case MONO_INPUT: {
                // L+R at 0.707 in the system mode, half of that in the insertion mode
                w[0x6d] = w[0x6e] = this.insertion ? 0xb5 : 0x1_6a;
                this.pushCoefficients([0x6d, 0x6e]);
                break;
            }
        }
    }
}
