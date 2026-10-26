import {
    RETURN_GAIN,
    STEREO_SEND_LEVEL,
    toSigned16,
    VARIATION_INPUT_LEVEL,
    XGDSPProgram,
    type XGParameterRanges,
    type XGProgramPreset
} from "../xg_dsp_program";
import { DELAY_TABLE, DENSITY_TABLE, MIX_DRY, MIX_WET } from "../xg_dsp_tables";
import {
    DAMP_FEEDBACK,
    DAMP_FILTER,
    DIFFUSION_SCALE,
    DIFFUSION_STEP,
    DIFFUSION_TABLE,
    ROOM_GAIN,
    ROOM_SIZE,
    ROOM_STEP,
    ROOM_TIME_OFFSET,
    TIME_OFFSETS,
    TIME_TABLE
} from "./reverb_tables";

/**
 * The type-specific data of an XG reverb.
 */
export interface XGReverbPreset extends XGProgramPreset {
    /**
     * The type gain index, selecting the diffusion, density and damping table rows.
     */
    gain: number;
    /**
     * The early reflection level scale (/256).
     */
    earlyLevel: number;
    /**
     * The HPF gain offset from unity (in filter gain table steps).
     */
    hpfGain: number;
}

// Program layout: which coefficient and address indices the preset words fill
const COEFFICIENT_LIST = [
    0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x21, 0x22, 0x23, 0x24, 0x29, 0x2a,
    0x2b, 0x2c, 0x2d, 0x2e, 0x2f, 0x30, 0x31, 0x32, 0x33, 0x38, 0x39, 0x3a,
    0x3b, 0x45, 0x46, 0x47, 0x48, 0x51, 0x52, 0x53, 0x54, 0x59, 0x5a, 0x5b,
    0x5c, 0x5d, 0x5e, 0x62, 0x63, 0x64, 0x65, 0x66, 0x67
];
const ADDRESS_LIST = [
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x0b, 0x0c, 0x0d,
    0x10, 0x11, 0x12, 0x15, 0x17, 0x18, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x21,
    0x22, 0x23, 0x3f
];

// Converter push lists
const LIST_HPF = [0x2e, 0x2d, 0x2f];
const LIST_LPF = [0x31, 0x30, 0x32];
/**
 * Diffusion allpass addresses, 4 per line: base, density tap, write, read.
 */
const LIST_DIFFUSION = [
    0x1f, 0x0c, 0x00, 0x04, 0x21, 0x1c, 0x01, 0x05, 0x22, 0x1e, 0x02, 0x06,
    0x23, 0x20, 0x03, 0x07
];
/**
 * Damping line coefficients, 3 per line: feedback, filter, filter.
 */
const LIST_TIME = [
    0x5b, 0x5a, 0x59, 0x5e, 0x5d, 0x5c, 0x64, 0x63, 0x62, 0x67, 0x66, 0x65
];
const LIST_DENSITY_ADDRESS = [0x10, 0x0b, 0x15, 0x0d, 0x18, 0x12, 0x1d, 0x17];
const LIST_DENSITY_COEFFICIENT = [
    0x2c, 0x2b, 0x2a, 0x29, 0x3b, 0x3a, 0x39, 0x38, 0x48, 0x47, 0x46, 0x45,
    0x54, 0x53, 0x52, 0x51
];
const LIST_DELAY = [0x08, 0x3f];
const LIST_BALANCE = [
    0x1b, 0x20, 0x1c, 0x1d, 0x1e, 0x1f, 0x21, 0x22, 0x23, 0x24
];
const LIST_FEEDBACK = [0x33];
/**
 * The converters run when a type is loaded.
 */
const INIT_ORDER = [0, 1, 2, 3, 4, 11, 12, 14];

/**
 * Valid parameter ranges (min, max), the rest is 0-127.
 */
const PARAMETER_RANGES: XGParameterRanges = {
    0: [0, 69],
    1: [0, 10],
    2: [0, 63],
    3: [0, 52],
    4: [34, 60],
    5: [0, 37],
    6: [0, 73],
    7: [0, 104],
    8: [0, 30],
    10: [0, 63]
};

/**
 * Pan table value at center, part of the original output coefficients.
 * Divided out because the reverb block applies its own pan.
 */
const CENTER_PAN = 362;
/**
 * Reverb return at its default, part of the original output coefficients.
 * The block scales by return / 64 on top, giving return / 127 like the original.
 */
const DEFAULT_RETURN = Math.fround(64 / 127);

/**
 * The reverb input level (the original send prescale).
 */
const INPUT_LEVEL = 2;
const OUTPUT_GAIN = 512 / CENTER_PAN;

/**
 * The S-YXG50 reverb program, shared by all reverb block types.
 *
 * Flow: mono input -> HPF -> LPF -> input node with feedback -> two diffusion allpasses
 * -> four damped delay lines -> per-side tap sums with early reflections -> output allpasses.
 */
export abstract class XGReverb extends XGDSPProgram {
    /**
     * The largest address word any reverb program can reach, plus one.
     */
    public static override readonly memorySize = 27_187;
    /**
     * True when running in the variation or insertion block.
     */
    protected readonly variation: boolean;
    protected abstract override readonly preset: XGReverbPreset;
    protected readonly coefficientList = COEFFICIENT_LIST;
    protected readonly addressList = ADDRESS_LIST;
    protected readonly initOrder = INIT_ORDER;
    /**
     * The dry/wet levels depend on the connection (only in the variation).
     */
    protected readonly connectionParameters = [9];
    protected readonly ranges = PARAMETER_RANGES;

    // Input filter state
    private x1 = 0;
    private y1 = 0;
    private y2 = 0;
    // Damping line filter states
    private z0 = 0;
    private z1 = 0;
    private z2 = 0;
    private z3 = 0;
    // Variation dry/wet
    private dryGain = 0;
    private wetGain = 1;

    public constructor(
        sampleRate: number,
        maxBufferSize: number,
        memory: Float32Array,
        variation: boolean
    ) {
        super(sampleRate, maxBufferSize, memory, 0);
        this.variation = variation;
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number,
        isInsertion: boolean
    ) {
        this.updateConnection(isInsertion);
        const memory = this.memory;
        const mask = this.mask;
        const c = this.coefficients;
        const t = this.taps;

        // Input filters
        const hb1 = c[0x2d],
            hb0 = c[0x2e],
            ha1 = c[0x2f];
        const lb1 = c[0x30],
            lb0 = c[0x31],
            la1 = c[0x32];
        // Input node and diffusion
        const feedback = c[0x33];
        const d1a = c[0x29],
            d1b = c[0x2a],
            d1c = c[0x2b],
            d1d = c[0x2c];
        const d2a = c[0x38],
            d2b = c[0x39],
            d2c = c[0x3a],
            d2d = c[0x3b];
        // Damping lines: feedback-filter, input, read
        const k0z = c[0x59],
            k0r = c[0x5a],
            k0i = c[0x5b];
        const k1z = c[0x5c],
            k1r = c[0x5d],
            k1i = c[0x5e];
        const k2z = c[0x62],
            k2r = c[0x63],
            k2i = c[0x64];
        const k3z = c[0x65],
            k3r = c[0x66],
            k3i = c[0x67];
        // Outputs
        const erL = c[0x1b],
            revL = c[0x1c],
            oLa = c[0x45],
            oLb = c[0x46],
            oLc = c[0x47],
            oLd = c[0x48];
        const erR = c[0x20],
            revR = c[0x21],
            oRa = c[0x51],
            oRb = c[0x52],
            oRc = c[0x53],
            oRd = c[0x54];

        const tNode = t[0x11],
            tNodeRead = t[0x08],
            tD1Write = t[0x10],
            tD1Read = t[0x0b],
            tD2Write = t[0x15],
            tD2Read = t[0x0d];
        const tL0Read = t[0x0c],
            tL0Write = t[0x1f];
        const tL1Read = t[0x1c],
            tL1Write = t[0x21];
        const tL2Read = t[0x1e],
            tL2Write = t[0x22];
        const tL3Read = t[0x20],
            tL3Write = t[0x23];
        const tEarly = t[0x3f];
        const tL0 = t[0x00],
            tL1 = t[0x01],
            tL2 = t[0x02],
            tL3 = t[0x03];
        const tR0 = t[0x04],
            tR1 = t[0x05],
            tR2 = t[0x06],
            tR3 = t[0x07];
        const tOLWrite = t[0x18],
            tOLRead = t[0x12],
            tORWrite = t[0x1d],
            tORRead = t[0x17];

        // The reverb input is mono. The reverb block sums our panned stereo send,
        // The variation sums its (halved) stereo send, or half of the part in the insertion mode
        const insertion = this.variation && isInsertion;
        const inputGain =
            this.inputLevel *
            (this.variation
                ? insertion
                    ? 0.5
                    : STEREO_SEND_LEVEL
                : Math.SQRT1_2);
        const dryGain = this.dryGain * this.inputLevel;
        const wetGain =
            this.wetGain *
            (this.variation ? (insertion ? 1 : RETURN_GAIN) : OUTPUT_GAIN);
        let { pointer, x1, y1, y2, z0, z1, z2, z3 } = this;

        for (let i = 0; i < sampleCount; i++) {
            // HPF then LPF
            const x = (inputLeft[i] + inputRight[i]) * inputGain;
            const h = hb1 * x1 + hb0 * x + ha1 * y1;
            const l = lb1 * y1 + la1 * y2 + h * lb0;
            x1 = x;
            y1 = h;
            y2 = l;

            // Input node with feedback, then two diffusion allpasses.
            // Memory is re-read after every write, as some presets alias taps.
            const iNodeRead = (tNodeRead + pointer) & mask;
            const iD1Read = (tD1Read + pointer) & mask;
            memory[(tNode + pointer) & mask] = memory[iNodeRead] * feedback + l;
            memory[(tD1Write + pointer) & mask] =
                memory[iNodeRead] * d1b + memory[iD1Read] * d1a;
            let f = memory[iNodeRead] * d1d + memory[iD1Read] * d1c;
            const iD2Read = (tD2Read + pointer) & mask;
            memory[(tD2Write + pointer) & mask] =
                f * d2b + memory[iD2Read] * d2a;
            f = f * d2d + memory[iD2Read] * d2c;

            // Four damped delay lines
            let iRead = (tL0Read + pointer) & mask;
            memory[(tL0Write + pointer) & mask] =
                k0z * z0 + f * k0i + memory[iRead] * k0r;
            z0 = memory[iRead];
            iRead = (tL1Read + pointer) & mask;
            memory[(tL1Write + pointer) & mask] =
                k1z * z1 + f * k1i + memory[iRead] * k1r;
            z1 = memory[iRead];
            iRead = (tL2Read + pointer) & mask;
            memory[(tL2Write + pointer) & mask] =
                k2z * z2 + f * k2i + memory[iRead] * k2r;
            z2 = memory[iRead];
            iRead = (tL3Read + pointer) & mask;
            memory[(tL3Write + pointer) & mask] =
                k3z * z3 + f * k3i + memory[iRead] * k3r;
            z3 = memory[iRead];

            // Outputs: early reflection plus four line taps, then an allpass
            const iEarly = (tEarly + pointer) & mask;
            let sum =
                memory[iEarly] * erL +
                (memory[(tL3 + pointer) & mask] +
                    memory[(tL2 + pointer) & mask] +
                    memory[(tL1 + pointer) & mask] +
                    memory[(tL0 + pointer) & mask]) *
                    revL;
            let iAllpass = (tOLRead + pointer) & mask;
            memory[(tOLWrite + pointer) & mask] =
                sum * oLb + memory[iAllpass] * oLa;
            outputLeft[i] =
                (sum * oLd + memory[iAllpass] * oLc) * wetGain +
                inputLeft[i] * dryGain;

            sum =
                memory[iEarly] * erR +
                (memory[(tR2 + pointer) & mask] +
                    memory[(tR1 + pointer) & mask] +
                    memory[(tR0 + pointer) & mask] +
                    memory[(tR3 + pointer) & mask]) *
                    revR;
            iAllpass = (tORRead + pointer) & mask;
            memory[(tORWrite + pointer) & mask] =
                sum * oRb + memory[iAllpass] * oRa;
            outputRight[i] =
                (sum * oRd + memory[iAllpass] * oRc) * wetGain +
                inputRight[i] * dryGain;

            pointer = (pointer - 1) & mask;
        }
        this.pointer = pointer;
        this.x1 = x1;
        this.y1 = y1;
        this.y2 = y2;
        this.z0 = z0;
        this.z1 = z1;
        this.z2 = z2;
        this.z3 = z3;
        this.advanceFade(
            sampleCount,
            this.variation
                ? isInsertion
                    ? 1
                    : VARIATION_INPUT_LEVEL
                : INPUT_LEVEL
        );
    }

    protected override resetState() {
        this.x1 = this.y1 = this.y2 = 0;
        this.z0 = this.z1 = this.z2 = this.z3 = 0;
    }

    protected convert(param: number) {
        const p = this.params;
        switch (param) {
            case 0: {
                this.reverbTime();
                this.pushCoefficients(LIST_TIME);
                break;
            }

            case 1: {
                this.diffusion();
                for (let line = 0; line < 4; line++) {
                    this.pushAddresses(LIST_DIFFUSION, 2, line * 4 + 2);
                }
                this.density();
                // The variation keeps the plain density output coefficients
                if (!this.variation) this.output();
                this.pushAddresses(LIST_DENSITY_ADDRESS, 1, 7);
                break;
            }

            case 2:
            case 10: {
                this.delays();
                break;
            }

            case 3: {
                // The per-type HPF gain only applies in the reverb block
                this.designFirstOrder(
                    "highPass",
                    p[3],
                    this.variation ? 0x40 : 0x40 + this.preset.hpfGain,
                    LIST_HPF
                );
                break;
            }

            case 9: {
                // Dry/wet, only in the variation (the system mode is always fully wet)
                if (!this.variation) break;
                const mix = this.mixIndex();
                this.dryGain = MIX_DRY[mix] / 512;
                this.wetGain = MIX_WET[mix] / 512;
                break;
            }

            case 4: {
                this.designFirstOrder("lowPass", p[4], 0x40, LIST_LPF);
                break;
            }

            case 11: {
                this.density();
                if (!this.variation) this.output();
                this.pushCoefficients(LIST_DENSITY_COEFFICIENT);
                break;
            }

            case 12: {
                this.balance();
                break;
            }

            case 14: {
                this.coefficientWords[0x33] = this.feedbackWord(p[14]);
                this.pushCoefficients(LIST_FEEDBACK);
                break;
            }
        }
    }

    /**
     * Writes the damping coefficients of all four lines from the reverb time.
     */
    protected reverbTime() {
        const base = TIME_TABLE[this.params[0]];
        const gain = this.preset.gain;
        for (let line = 0; line < 4; line++) {
            const index = (TIME_OFFSETS[gain * 4 + line] + base) & 0xff;
            this.writeDamping(index, LIST_TIME, line * 3);
        }
    }

    /**
     * Writes one damping line's coefficient words.
     * @param index The damping table index.
     * @param list The coefficient list.
     * @param offset The first list index.
     */
    protected writeDamping(
        index: number,
        list: ArrayLike<number>,
        offset: number
    ) {
        this.coefficientWords[list[offset]] = DAMP_FEEDBACK[index];
        const filter = index > 0xca ? 0xff : DAMP_FILTER[index];
        this.coefficientWords[list[offset + 1]] = filter;
        this.coefficientWords[list[offset + 2]] = filter;
    }

    /**
     * Places the diffusion allpasses from the diffusion parameter.
     */
    protected diffusion() {
        const scale = DIFFUSION_SCALE[this.params[1]];
        const row = this.preset.gain * 8;
        const a = this.addressWords;
        for (let line = 0; line < 4; line++) {
            const s3 = toSigned16(
                this.toAddress10us(DIFFUSION_TABLE[row + line * 2])
            );
            const s4 = toSigned16(
                this.toAddress10us(DIFFUSION_TABLE[row + line * 2 + 1])
            );
            const step = (DIFFUSION_STEP[line] * scale) >> 7;
            const g = line * 4;
            let base = this.signedAddress(LIST_DIFFUSION[g]);
            a[LIST_DIFFUSION[g + 1]] = base + s4;
            if ((line & 1) === 0) {
                a[LIST_DIFFUSION[g + 2]] = base + s3;
                base += step;
            } else {
                a[LIST_DIFFUSION[g + 2]] = base + step + s3;
            }
            a[LIST_DIFFUSION[g + 3]] = base + s3;
        }
    }

    /**
     * Writes the density allpass lengths and coefficients.
     */
    protected density() {
        this.densityAllpasses(
            this.params[11],
            this.params[1],
            this.preset.gain,
            0xc,
            LIST_DENSITY_COEFFICIENT,
            LIST_DENSITY_ADDRESS
        );
    }

    /**
     * Writes the output allpass coefficients (with the default return and center pan).
     */
    protected output() {
        let a: number, b: number, c: number, d: number;
        if (this.params[11] === 0) {
            a = 0.5;
            b = 0.5;
            c = 0;
            d = 0;
        } else {
            const row = this.preset.gain * 8;
            a = Math.fround(-(DENSITY_TABLE[row + 5] / 1024));
            b = Math.fround(-(DENSITY_TABLE[row + 7] / 1024));
            c = Math.fround(0.5 - a);
            d = Math.fround(0.5 - b);
        }
        const level = Math.fround(CENTER_PAN * DEFAULT_RETURN);
        const w = this.coefficientWords;
        w[0x48] = Math.trunc(Math.fround(level * a)) & 0x3_ff;
        w[0x54] = Math.trunc(Math.fround(level * b)) & 0x3_ff;
        w[0x47] = Math.trunc(Math.fround(level * c)) & 0x3_ff;
        w[0x53] = Math.trunc(Math.fround(level * d)) & 0x3_ff;
    }

    /**
     * Places the early reflection and reverb start from the initial and reverb delays.
     */
    protected delays() {
        const early =
            this.toAddress100us(DELAY_TABLE[this.params[2]]) +
            this.signedAddress(0x11);
        this.addressWords[0x3f] = early;
        this.addressWords[0x08] =
            this.toAddress100us(DELAY_TABLE[this.params[10]]) +
            toSigned16(early);
        this.pushAddresses(LIST_DELAY);
    }

    /**
     * Writes the early reflection and reverb levels from the ER/Rev balance.
     */
    protected balance() {
        const p = this.params[12];
        const early = (MIX_DRY[p] * this.preset.earlyLevel) >> 8;
        const reverb = MIX_WET[p];
        const w = this.coefficientWords;
        w[0x1b] = w[0x20] = early & 0xff_ff;
        for (let k = 0x1c; k <= 0x24; k++) {
            if (k !== 0x20) w[k] = reverb & 0xff_ff;
        }
        this.pushCoefficients(LIST_BALANCE);
    }
}

/**
 * The room dimension a room-shaped reverb's wall vary applies to.
 */
export type XGRoomWall = "width" | "height" | "depth";

/**
 * The type-specific data of a room-shaped XG reverb.
 */
export interface XGRoomReverbPreset extends XGReverbPreset {
    /**
     * Selects the room damping interpolation row.
     */
    roomSelect: number;
    /**
     * Selects the room diffusion steps.
     */
    roomStep: number;
    /**
     * The dimension the wall vary parameter is added to.
     */
    wall: XGRoomWall;
}

/**
 * The room-shaped reverbs (white room, tunnel, basement) where width, height and depth
 * place the delay lines.
 */
export abstract class XGRoomReverb extends XGReverb {
    protected abstract override readonly preset: XGRoomReverbPreset;

    protected override convert(param: number) {
        const p = this.params;
        switch (param) {
            default: {
                super.convert(param);
                break;
            }

            case 0: {
                this.roomTime(0, p[5], 0);
                this.roomTime(1, p[6], 3);
                this.roomTime(2, p[7], 6);
                this.roomTime(this.wallDimension(), this.wallSize(), 9);
                this.pushCoefficients(LIST_TIME);
                break;
            }

            case 1: {
                this.roomDiffusion(0, p[5], 0);
                this.roomDiffusion(ROOM_STEP[this.preset.roomStep], p[6], 4);
                this.roomDiffusion(
                    ROOM_STEP[this.preset.roomStep + 1],
                    p[7],
                    8
                );
                this.roomDiffusion(
                    ROOM_STEP[this.preset.roomStep + 2],
                    this.wallSize(),
                    12
                );
                for (let line = 0; line < 4; line++) {
                    this.pushAddresses(LIST_DIFFUSION, 2, line * 4 + 2);
                }
                this.density();
                this.pushAddresses(LIST_DENSITY_ADDRESS, 1, 7);
                break;
            }

            case 3: {
                this.designFirstOrder("highPass", p[3], 0x40, LIST_HPF);
                break;
            }

            case 5: {
                this.roomDimension(0, 0, p[5], 0);
                break;
            }

            case 6: {
                this.roomDimension(1, ROOM_STEP[this.preset.roomStep], p[6], 1);
                if (this.preset.wall === "height") this.wall();
                break;
            }

            case 7: {
                this.roomDimension(
                    2,
                    ROOM_STEP[this.preset.roomStep + 1],
                    p[7],
                    2
                );
                if (this.preset.wall === "depth") this.wall();
                break;
            }

            case 8: {
                this.wall();
                break;
            }
        }
    }

    /**
     * The room damping gain for a dimension.
     * @param dimension 0 width, 1 height, 2 depth.
     */
    private roomGain(dimension: number) {
        return ROOM_GAIN[this.preset.roomSelect * 6 + dimension];
    }

    /**
     * The dimension index the wall vary applies to.
     */
    private wallDimension() {
        switch (this.preset.wall) {
            case "width": {
                return 0;
            }
            case "height": {
                return 1;
            }
            case "depth": {
                return 2;
            }
        }
    }

    /**
     * The size of the wall line (its dimension plus the wall vary).
     */
    private wallSize() {
        return this.params[5 + this.wallDimension()] + this.params[8];
    }

    /**
     * Writes a damping line from the reverb time and a room dimension.
     * @param dimension The dimension selecting the room gain.
     * @param size The dimension size.
     * @param offset The first damping list index.
     */
    private roomTime(dimension: number, size: number, offset: number) {
        const time = this.params[0];
        const gain = this.roomGain(dimension);
        const timeOffset = ROOM_TIME_OFFSET[size];
        const extra = timeOffset < 0x38 ? 0 : timeOffset - 0x38;
        let base: number;
        if (gain < 0) {
            base =
                time === 0
                    ? 0
                    : (Math.trunc(
                          ((TIME_TABLE[time] - TIME_TABLE[time - 1]) * gain) /
                              10
                      ) +
                          TIME_TABLE[time]) &
                      0xff;
        } else {
            base =
                (Math.trunc(
                    ((TIME_TABLE[time + 1] - TIME_TABLE[time]) * gain) / 10
                ) +
                    TIME_TABLE[time]) &
                0xff;
        }
        this.writeDamping((extra + base) & 0xff, LIST_TIME, offset);
    }

    /**
     * Places a diffusion allpass from a room dimension.
     * @param step The room diffusion step index.
     * @param size The dimension size.
     * @param offset The first diffusion list index.
     */
    private roomDiffusion(step: number, size: number, offset: number) {
        const length = this.toAddress10us(ROOM_SIZE[size]) & 0xff_ff;
        const a = this.addressWords;
        const base = this.signedAddress(LIST_DIFFUSION[offset]);
        const half = length >> 1;
        a[LIST_DIFFUSION[offset + 1]] = length + base;
        const shift =
            (DIFFUSION_STEP[step] * DIFFUSION_SCALE[this.params[1]]) >> 7;
        if ((step & 1) === 0) {
            a[LIST_DIFFUSION[offset + 2]] = half + base;
            a[LIST_DIFFUSION[offset + 3]] = base + shift + half;
        } else {
            a[LIST_DIFFUSION[offset + 2]] = shift + base + half;
            a[LIST_DIFFUSION[offset + 3]] = base + half;
        }
    }

    /**
     * Updates one dimension's damping line and allpass, then pushes them.
     * @param dimension 0 width, 1 height, 2 depth.
     * @param step The room diffusion step index.
     * @param size The dimension size.
     * @param line The line index.
     */
    private roomDimension(
        dimension: number,
        step: number,
        size: number,
        line: number
    ) {
        this.roomTime(dimension, size, line * 3);
        this.roomDiffusion(step, size, line * 4);
        this.pushAddresses(LIST_DIFFUSION, 3, line * 4 + 1);
        this.pushCoefficients(LIST_TIME, 3, line * 3);
    }

    /**
     * Updates the wall line (the fourth line).
     */
    private wall() {
        const size = this.wallSize();
        this.roomTime(this.wallDimension(), size, 9);
        this.roomDiffusion(ROOM_STEP[this.preset.roomStep + 2], size, 12);
        this.pushAddresses(LIST_DIFFUSION, 3, 13);
        this.pushCoefficients(LIST_TIME, 3, 9);
    }
}
