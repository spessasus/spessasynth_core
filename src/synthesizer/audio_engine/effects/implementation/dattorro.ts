/**
 * Dattorro Reverb Node
 * by khoin on GitHub, public domain.
 * https://github.com/khoin/DattorroReverbNode/
 * Adapted for spessasynth by spessasus.
 * Further optimized with micro optimizations, check tsx performance_test before changing
 */
export class DattorroReverb {
    // Params
    // Min: 0, max: sample rate - 1
    public preDelay = 0;
    // Min: 0, max: 1
    public preLPF = 0.5;
    // Min: 0, max: 1
    public inputDiffusion1 = 0.75;
    // Min: 0, max: 1
    public inputDiffusion2 = 0.625;
    // Min: 0, max: 1
    public decay = 0.5;
    // Min: 0, max: 0.999999
    public decayDiffusion1 = 0.7;
    // Min: 0, max: 0.999999
    public decayDiffusion2 = 0.5;
    // Min: 0, max: 1
    public damping = 0.005;
    // Min: 0, max: 2
    public excursionRate = 0.1;
    // Min: 0, max: 2
    public excursionDepth = 0.2;
    public gain = 1;
    private readonly sampleRate;
    private lp1 = 0;
    private lp2 = 0;
    private lp3 = 0;

    // Separate lfo phases to allow safe wrapping at 2pi
    private excPhase1 = 0;
    private excPhase2 = 0;

    private pDWrite = 0;
    private readonly taps;
    private readonly pDelay;
    private readonly pDMask;

    // Flattened delays compared to original
    private readonly delayBuffers = new Array<Float32Array>(12);
    private readonly delayWrite = new Int32Array(12);
    private readonly delayRead = new Int32Array(12);
    private readonly delayMask = new Int32Array(12);

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;

        // Pre-delay is always one-second long
        this.pDMask = 2 ** Math.ceil(Math.log2(sampleRate)) - 1;
        this.pDelay = new Float32Array(this.pDMask + 1);

        const delays = [
            0.004_771_345, 0.003_595_309, 0.012_734_787, 0.009_307_483,
            0.022_579_886, 0.149_625_349, 0.060_481_839, 0.124_995_8,
            0.030_509_727, 0.141_695_508, 0.089_244_313, 0.106_280_031
        ];

        for (let i = 0; i < delays.length; i++)
            this.makeDelayLine(delays[i], i);

        this.taps = Int32Array.from(
            [
                0.008_937_872, 0.099_929_438, 0.064_278_754, 0.067_067_639,
                0.066_866_033, 0.006_283_391, 0.035_818_689, 0.011_861_161,
                0.121_870_905, 0.041_262_054, 0.089_815_53, 0.070_931_756,
                0.011_256_342, 0.004_065_724
            ],
            (x) => Math.round(x * this.sampleRate)
        );
    }

    // Note: input is zero-based, while the outputs are startIndex based!
    // ADDS to the output
    public process(
        input: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        startIndex: number,
        sampleCount: number
    ) {
        // Cache everything we can
        const pd = this.preDelay | 0;
        const fi = this.inputDiffusion1;
        const si = this.inputDiffusion2;
        const dc = this.decay;
        const ft = this.decayDiffusion1;
        const st = this.decayDiffusion2;
        const dp = 1 - this.damping;
        const ex = this.excursionRate / this.sampleRate;
        const ed = (this.excursionDepth * this.sampleRate) / 1000;

        let lp1 = this.lp1,
            lp2 = this.lp2,
            lp3 = this.lp3;
        let p1 = this.excPhase1,
            p2 = this.excPhase2;

        const blockStart = this.pDWrite;
        const pDelay = this.pDelay;
        const pDMask = this.pDMask;
        const taps = this.taps;
        const gain = this.gain;

        // Cache array accesses too
        const d0 = this.delayBuffers[0];
        let w0 = this.delayWrite[0],
            r0 = this.delayRead[0];
        const m0 = this.delayMask[0];
        const d1 = this.delayBuffers[1];
        let w1 = this.delayWrite[1],
            r1 = this.delayRead[1];
        const m1 = this.delayMask[1];
        const d2 = this.delayBuffers[2];
        let w2 = this.delayWrite[2],
            r2 = this.delayRead[2];
        const m2 = this.delayMask[2];
        const d3 = this.delayBuffers[3];
        let w3 = this.delayWrite[3],
            r3 = this.delayRead[3];
        const m3 = this.delayMask[3];
        const d4 = this.delayBuffers[4];
        let w4 = this.delayWrite[4],
            r4 = this.delayRead[4];
        const m4 = this.delayMask[4];
        const d5 = this.delayBuffers[5];
        let w5 = this.delayWrite[5],
            r5 = this.delayRead[5];
        const m5 = this.delayMask[5];
        const d6 = this.delayBuffers[6];
        let w6 = this.delayWrite[6],
            r6 = this.delayRead[6];
        const m6 = this.delayMask[6];
        const d7 = this.delayBuffers[7];
        let w7 = this.delayWrite[7],
            r7 = this.delayRead[7];
        const m7 = this.delayMask[7];
        const d8 = this.delayBuffers[8];
        let w8 = this.delayWrite[8],
            r8 = this.delayRead[8];
        const m8 = this.delayMask[8];
        const d9 = this.delayBuffers[9];
        let w9 = this.delayWrite[9],
            r9 = this.delayRead[9];
        const m9 = this.delayMask[9];
        const d10 = this.delayBuffers[10];
        let w10 = this.delayWrite[10],
            r10 = this.delayRead[10];
        const m10 = this.delayMask[10];
        const d11 = this.delayBuffers[11];
        let w11 = this.delayWrite[11],
            r11 = this.delayRead[11];
        const m11 = this.delayMask[11];

        const TWO_PI = 6.283_185_307_179_586;

        for (let i = 0; i < sampleCount; i++) {
            // Write/read predelay
            pDelay[(blockStart + i) & pDMask] = input[i];
            const inSample = pDelay[(blockStart + i - pd) & pDMask];

            // Lowpass filter
            lp1 += this.preLPF * (inSample - lp1);

            // Pre-tank
            const read0 = d0[r0];
            let pre = lp1 - fi * read0;
            d0[w0] = pre;

            const read1 = d1[r1];
            pre = fi * (pre - read1) + read0;
            d1[w1] = pre;

            const read2 = d2[r2];
            pre = fi * pre + read1 - si * read2;
            d2[w2] = pre;

            const read3 = d3[r3];
            pre = si * (pre - read3) + read2;
            d3[w3] = pre;

            const split = si * pre + read3;

            // Excursions
            // Could be optimized?
            const exc = ed * (1 + Math.cos(p1));
            const exc2 = ed * (1 + Math.sin(p2));

            // Left loop
            const read11 = d11[r11];

            // Inlined readDelayCAt(4, exc)
            const f4 = exc - ~~exc;
            let i4 = ~~exc + r4 - 1;
            const x4_0 = d4[i4++ & m4],
                x4_1 = d4[i4++ & m4],
                x4_2 = d4[i4++ & m4],
                x4_3 = d4[i4 & m4];
            const a4 = (3 * (x4_1 - x4_2) - x4_0 + x4_3) * 0.5;
            const b4 = 2 * x4_2 + x4_0 - (5 * x4_1 + x4_3) * 0.5;
            const c4 = (x4_2 - x4_0) * 0.5;
            const readC4 = ((a4 * f4 + b4) * f4 + c4) * f4 + x4_1;
            // End of inline

            let temp = split + dc * read11 + ft * readC4;
            d4[w4] = temp; // Tank diffuse 1

            d5[w5] = readC4 - ft * temp; // Long delay 1

            const read5 = d5[r5];
            lp2 += dp * (read5 - lp2); // Damp 1

            const read6 = d6[r6];
            temp = dc * lp2 - st * read6;
            d6[w6] = temp; // Tank diffuse 2

            d7[w7] = read6 + st * temp; // Long delay 2

            // Right loop
            const read7 = d7[r7];

            // Inline readDelayCAt(8, exc2)
            const f8 = exc2 - ~~exc2;
            let i8 = ~~exc2 + r8 - 1;
            const x8_0 = d8[i8++ & m8],
                x8_1 = d8[i8++ & m8],
                x8_2 = d8[i8++ & m8],
                x8_3 = d8[i8 & m8];
            const a8 = (3 * (x8_1 - x8_2) - x8_0 + x8_3) * 0.5;
            const b8 = 2 * x8_2 + x8_0 - (5 * x8_1 + x8_3) * 0.5;
            const c8 = (x8_2 - x8_0) * 0.5;
            const readC8 = ((a8 * f8 + b8) * f8 + c8) * f8 + x8_1;
            // End of inline

            temp = split + dc * read7 + ft * readC8;
            d8[w8] = temp; // Tank diffuse 3

            d9[w9] = readC8 - ft * temp; // Long delay 3

            const read9 = d9[r9];
            lp3 += dp * (read9 - lp3); // Damp 2

            const read10 = d10[r10];
            temp = dc * lp3 - st * read10;
            d10[w10] = temp; // Tank diffuse 4

            d11[w11] = read10 + st * temp; // Long delay 4

            // Mix down
            const leftSample =
                d9[(r9 + taps[0]) & m9] +
                d9[(r9 + taps[1]) & m9] -
                d10[(r10 + taps[2]) & m10] +
                d11[(r11 + taps[3]) & m11] -
                d5[(r5 + taps[4]) & m5] -
                d6[(r6 + taps[5]) & m6] -
                d7[(r7 + taps[6]) & m7];

            const rightSample =
                d5[(r5 + taps[7]) & m5] +
                d5[(r5 + taps[8]) & m5] -
                d6[(r6 + taps[9]) & m6] +
                d7[(r7 + taps[10]) & m7] -
                d9[(r9 + taps[11]) & m9] -
                d10[(r10 + taps[12]) & m10] -
                d11[(r11 + taps[13]) & m11];

            // Write out
            const idx = i + startIndex;
            outputLeft[idx] += leftSample * gain;
            outputRight[idx] += rightSample * gain;

            // Update LFOs and wrap them
            // Different values for stereo effect
            p1 += ex * TWO_PI;
            p2 += ex * 6.2847;
            if (p1 > TWO_PI) p1 -= TWO_PI;
            if (p2 > TWO_PI) p2 -= TWO_PI;

            // Advance delays
            w0 = (w0 + 1) & m0;
            r0 = (r0 + 1) & m0;
            w1 = (w1 + 1) & m1;
            r1 = (r1 + 1) & m1;
            w2 = (w2 + 1) & m2;
            r2 = (r2 + 1) & m2;
            w3 = (w3 + 1) & m3;
            r3 = (r3 + 1) & m3;
            w4 = (w4 + 1) & m4;
            r4 = (r4 + 1) & m4;
            w5 = (w5 + 1) & m5;
            r5 = (r5 + 1) & m5;
            w6 = (w6 + 1) & m6;
            r6 = (r6 + 1) & m6;
            w7 = (w7 + 1) & m7;
            r7 = (r7 + 1) & m7;
            w8 = (w8 + 1) & m8;
            r8 = (r8 + 1) & m8;
            w9 = (w9 + 1) & m9;
            r9 = (r9 + 1) & m9;
            w10 = (w10 + 1) & m10;
            r10 = (r10 + 1) & m10;
            w11 = (w11 + 1) & m11;
            r11 = (r11 + 1) & m11;
        }
        // Update preDelay index
        this.pDWrite = (blockStart + sampleCount) & pDMask;

        // Save state
        this.lp1 = lp1;
        this.lp2 = lp2;
        this.lp3 = lp3;
        this.excPhase1 = p1;
        this.excPhase2 = p2;

        this.delayWrite[0] = w0;
        this.delayRead[0] = r0;
        this.delayWrite[1] = w1;
        this.delayRead[1] = r1;
        this.delayWrite[2] = w2;
        this.delayRead[2] = r2;
        this.delayWrite[3] = w3;
        this.delayRead[3] = r3;
        this.delayWrite[4] = w4;
        this.delayRead[4] = r4;
        this.delayWrite[5] = w5;
        this.delayRead[5] = r5;
        this.delayWrite[6] = w6;
        this.delayRead[6] = r6;
        this.delayWrite[7] = w7;
        this.delayRead[7] = r7;
        this.delayWrite[8] = w8;
        this.delayRead[8] = r8;
        this.delayWrite[9] = w9;
        this.delayRead[9] = r9;
        this.delayWrite[10] = w10;
        this.delayRead[10] = r10;
        this.delayWrite[11] = w11;
        this.delayRead[11] = r11;
    }

    private makeDelayLine(length: number, index: number) {
        // Len, array, write, read, mask
        const len = Math.round(length * this.sampleRate);
        const nextPow2 = 2 ** Math.ceil(Math.log2(len));
        this.delayBuffers[index] = new Float32Array(nextPow2);
        this.delayWrite[index] = len - 1;
        this.delayRead[index] = 0;
        this.delayMask[index] = nextPow2 - 1;
    }

    // Read delay methods inlined for performance
}
