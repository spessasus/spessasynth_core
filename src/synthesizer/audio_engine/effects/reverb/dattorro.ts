/**
 * Dattorro Reverb Node
 * by khoin on GitHub, public domain.
 * https://github.com/khoin/DattorroReverbNode/
 * Adapted for spessasynth by spessasus.
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
    private excPhase = 0;
    private pDWrite = 0;
    private readonly taps;
    private readonly pDelay;
    private readonly pDLength;

    private delays = new Array<[Float32Array, number, number, number]>();
    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        // Pre-delay is always one-second long
        this.pDLength = sampleRate;
        this.pDelay = new Float32Array(this.pDLength);

        const delays = [
            0.004_771_345, 0.003_595_309, 0.012_734_787, 0.009_307_483,
            0.022_579_886, 0.149_625_349, 0.060_481_839, 0.124_995_8,
            0.030_509_727, 0.141_695_508, 0.089_244_313, 0.106_280_031
        ];
        for (const delay of delays) {
            this.makeDelayLine(delay);
        }

        this.taps = Int16Array.from(
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
    public process(
        input: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        startIndex: number,
        sampleCount: number
    ) {
        const pd = this.preDelay | 0;
        const fi = this.inputDiffusion1;
        const si = this.inputDiffusion2;
        const dc = this.decay;
        const ft = this.decayDiffusion1;
        const st = this.decayDiffusion2;
        const dp = 1 - this.damping;
        const ex = this.excursionRate / this.sampleRate;
        const ed = (this.excursionDepth * this.sampleRate) / 1000;
        const blockStart = this.pDWrite;
        // Write to predelay
        for (let j = 0; j < sampleCount; j++) {
            this.pDelay[(blockStart + j) % this.pDLength] = input[j];
        }

        for (let i = 0; i < sampleCount; i++) {
            this.lp1 +=
                this.preLPF *
                (this.pDelay[
                    (this.pDLength + this.pDWrite - pd + i) % this.pDLength
                ] -
                    this.lp1);

            // Pre-tank
            let pre = this.writeDelay(0, this.lp1 - fi * this.readDelay(0));
            pre = this.writeDelay(
                1,
                fi * (pre - this.readDelay(1)) + this.readDelay(0)
            );
            pre = this.writeDelay(
                2,
                fi * pre + this.readDelay(1) - si * this.readDelay(2)
            );
            pre = this.writeDelay(
                3,
                si * (pre - this.readDelay(3)) + this.readDelay(2)
            );

            const split = si * pre + this.readDelay(3);

            // Excursions
            // Could be optimized?
            const exc = ed * (1 + Math.cos(this.excPhase * 6.28));
            const exc2 = ed * (1 + Math.sin(this.excPhase * 6.2847));

            // Left loop
            let temp = this.writeDelay(
                4,
                split + dc * this.readDelay(11) + ft * this.readDelayCAt(4, exc)
            ); // Tank diffuse 1
            this.writeDelay(5, this.readDelayCAt(4, exc) - ft * temp); // Long delay 1
            this.lp2 += dp * (this.readDelay(5) - this.lp2); // Damp 1
            temp = this.writeDelay(6, dc * this.lp2 - st * this.readDelay(6)); // Tank diffuse 2
            this.writeDelay(7, this.readDelay(6) + st * temp); // Long delay 2
            // Right loop
            temp = this.writeDelay(
                8,
                split + dc * this.readDelay(7) + ft * this.readDelayCAt(8, exc2)
            ); // Tank diffuse 3
            this.writeDelay(9, this.readDelayCAt(8, exc2) - ft * temp); // Long delay 3
            this.lp3 += dp * (this.readDelay(9) - this.lp3); // Damp 2
            temp = this.writeDelay(10, dc * this.lp3 - st * this.readDelay(10)); // Tank diffuse 4
            this.writeDelay(11, this.readDelay(10) + st * temp); // Long delay 4

            // Mix down
            const leftSample =
                this.readDelayAt(9, this.taps[0]) +
                this.readDelayAt(9, this.taps[1]) -
                this.readDelayAt(10, this.taps[2]) +
                this.readDelayAt(11, this.taps[3]) -
                this.readDelayAt(5, this.taps[4]) -
                this.readDelayAt(6, this.taps[5]) -
                this.readDelayAt(7, this.taps[6]);
            const idx = i + startIndex;
            outputLeft[idx] += leftSample * this.gain;

            const rightSample =
                this.readDelayAt(5, this.taps[7]) +
                this.readDelayAt(5, this.taps[8]) -
                this.readDelayAt(6, this.taps[9]) +
                this.readDelayAt(7, this.taps[10]) -
                this.readDelayAt(9, this.taps[11]) -
                this.readDelayAt(10, this.taps[12]) -
                this.readDelayAt(11, this.taps[13]);

            outputRight[idx] += rightSample * this.gain;

            this.excPhase += ex;
            // Advance delays
            for (
                let j = 0, d = this.delays[0];
                j < this.delays.length;
                d = this.delays[++j]
            ) {
                d[1] = (d[1] + 1) & d[3];
                d[2] = (d[2] + 1) & d[3];
            }
        }
        // Update preDelay index
        this.pDWrite = (blockStart + sampleCount) % this.pDLength;
    }

    private makeDelayLine(length: number) {
        // Len, array, write, read, mask
        const len = Math.round(length * this.sampleRate);
        const nextPow2 = 2 ** Math.ceil(Math.log2(len));
        this.delays.push([
            new Float32Array(nextPow2),
            len - 1,
            0 | 0,
            nextPow2 - 1
        ]);
    }

    private writeDelay(index: number, sample: number) {
        return (this.delays[index][0][this.delays[index][1]] = sample);
    }

    private readDelay(index: number) {
        return this.delays[index][0][this.delays[index][2]];
    }

    // Cubic interpolation

    private readDelayAt(index: number, i: number) {
        const delay = this.delays[index];
        return delay[0][(delay[2] + i) & delay[3]];
    }

    // O. Niemitalo: https://www.musicdsp.org/en/latest/Other/49-cubic-interpollation.html
    private readDelayCAt(index: number, i: number) {
        const d = this.delays[index],
            frac = i - ~~i,
            mask = d[3];
        let int = ~~i + d[2] - 1;

        const x0 = d[0][int++ & mask],
            x1 = d[0][int++ & mask],
            x2 = d[0][int++ & mask],
            x3 = d[0][int & mask];

        const a = (3 * (x1 - x2) - x0 + x3) / 2,
            b = 2 * x2 + x0 - (5 * x1 + x3) / 2,
            c = (x2 - x0) / 2;

        return ((a * frac + b) * frac + c) * frac + x1;
    }
}
