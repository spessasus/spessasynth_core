import { WavetableOscillator } from "./wavetable_oscillator";

/**
 * Kernel resolution, the amount of table points per sample of distance.
 * The table is linearly interpolated, which keeps the error around -120 dB.
 */
const OVERSAMPLING = 256;

/**
 * The highest playback step the anti-aliased kernel gets stretched to.
 * The tap count grows with the step, so this keeps extreme pitch ups from becoming too slow.
 * Above it, the content between the new Nyquist frequency and 1/16 of the old one folds back.
 */
const MAX_STRETCH = 16;

interface SincKernel {
    /**
     * Half of the kernel width, in samples.
     */
    halfWidth: number;
    /**
     * Polyphase coefficients, `taps` per phase, `OVERSAMPLING` phases.
     * Each phase is normalized to unity gain at DC.
     */
    phases: Float32Array;
    /**
     * The difference between the next phase and this one, for interpolating between the phases.
     */
    phaseDeltas: Float32Array;
    /**
     * The continuous kernel from -halfWidth to halfWidth (plus a zero guard point),
     * used when the kernel is stretched for antialiasing.
     */
    table: Float32Array;
    /**
     * Differences between the neighboring table points.
     */
    tableDeltas: Float32Array;
}

/**
 * Zeroth order modified Bessel function of the first kind, for the Kaiser window.
 * @param x
 */
function besselI0(x: number) {
    const q = (x * x) / 4;
    let sum = 1;
    let term = 1;
    for (let k = 1; k < 100; k++) {
        term *= q / (k * k);
        sum += term;
        if (term < sum * 1e-17) break;
    }
    return sum;
}

/**
 * Builds a Kaiser windowed sinc kernel.
 * @param halfWidth Half of the kernel width, in samples. The kernel uses `2 * halfWidth` taps.
 * @param bandwidth The cutoff (-6 dB point) of the kernel, relative to the Nyquist frequency.
 * @param beta The Kaiser window beta, controls the stopband attenuation.
 */
function buildKernel(halfWidth: number, bandwidth: number, beta: number) {
    const windowNorm = besselI0(beta);
    const kernel = (x: number) => {
        const w = x / halfWidth;
        if (w <= -1 || w >= 1) return 0;
        const window = besselI0(beta * Math.sqrt(1 - w * w)) / windowNorm;
        const u = Math.PI * bandwidth * x;
        const sinc = u === 0 ? 1 : Math.sin(u) / u;
        return bandwidth * sinc * window;
    };

    // The polyphase table
    // Tap k of phase q is for the point (k + 1 - halfWidth) after the cursor,
    // When the cursor is q / OVERSAMPLING past the point before it
    const taps = halfWidth * 2;
    const rows = new Float64Array(taps * (OVERSAMPLING + 1));
    for (let q = 0; q <= OVERSAMPLING; q++) {
        const row = q * taps;
        let sum = 0;
        for (let k = 0; k < taps; k++) {
            const v = kernel(k + 1 - halfWidth - q / OVERSAMPLING);
            rows[row + k] = v;
            sum += v;
        }
        for (let k = 0; k < taps; k++) rows[row + k] /= sum;
    }
    const phases = new Float32Array(taps * OVERSAMPLING);
    const phaseDeltas = new Float32Array(taps * OVERSAMPLING);
    for (let i = 0; i < phases.length; i++) {
        phases[i] = rows[i];
        phaseDeltas[i] = rows[i + taps] - rows[i];
    }

    // The continuous table
    const tableLength = halfWidth * 2 * OVERSAMPLING + 2;
    const table = new Float32Array(tableLength);
    const tableDeltas = new Float32Array(tableLength);
    for (let i = 0; i < tableLength; i++) {
        table[i] = kernel(i / OVERSAMPLING - halfWidth);
    }
    for (let i = 0; i < tableLength - 1; i++) {
        tableDeltas[i] = table[i + 1] - table[i];
    }

    return { halfWidth, phases, phaseDeltas, table, tableDeltas };
}

/**
 * 32 points, meant for real time playback.
 */
const KERNEL_FAST = buildKernel(16, 0.92, 9);
/**
 * 128 points, for offline rendering.
 */
const KERNEL_BEST = buildKernel(64, 0.975, 12);

export class SincOscillator extends WavetableOscillator {
    private readonly kernel: SincKernel;
    /**
     * If the kernel gets stretched when the playback step is above 1.
     * This lowers the cutoff to the new Nyquist frequency so the sample content above it does not alias.
     */
    private readonly antiAlias;
    /**
     * The points around the cursor, gathered here when they need wrapping around the loop
     * or are outside the sample.
     */
    private readonly scratch;

    /**
     * Creates a new windowed sinc oscillator.
     * @param best If true, uses the larger, anti-aliased kernel. It is too slow for real time playback.
     */
    public constructor(best: boolean) {
        super();
        this.kernel = best ? KERNEL_BEST : KERNEL_FAST;
        this.antiAlias = best;
        this.scratch = new Float32Array(
            best
                ? Math.ceil(this.kernel.halfWidth * MAX_STRETCH) * 2 + 2
                : this.kernel.halfWidth * 2
        );
    }

    public process(
        sampleCount: number,
        tuningRatio: number,
        outputBuffer: Float64Array
    ): boolean {
        const step = tuningRatio * this.playbackStep;
        const sampleData = this.sampleData!;
        const scratch = this.scratch;
        const { loopStart, loopEnd, loopLength, end, isLooping } = this;
        const { halfWidth } = this.kernel;
        let cursor = this.cursor;
        let hasLooped = this.hasLooped;

        // Points at or above this one have to be gathered (wrapped or silent)
        // The lower limit is checked in the loop since it changes after the first loop
        const upperLimit = isLooping ? loopEnd : end;

        const stretch =
            this.antiAlias && step > 1 ? Math.min(step, MAX_STRETCH) : 1;
        if (stretch === 1) {
            // Polyphase kernel, all taps share the same phase
            const { phases, phaseDeltas } = this.kernel;
            const taps = halfWidth * 2;
            for (let i = 0; i < sampleCount; i++) {
                if (isLooping) {
                    // Sample can loop more than once per frame! (that's why this 'while' is here)
                    // Testcase: saw_and_square_wave.sf2
                    if (cursor >= loopEnd) {
                        hasLooped = true;
                        while (cursor >= loopEnd) cursor -= loopLength;
                    }
                } else if (cursor + 1 >= end) {
                    // Same end condition as the other interpolators (the point after the cursor is missing)
                    // Fill the rest with zeros (testcase drum_spam_test.mid)
                    outputBuffer.fill(0, i, sampleCount);
                    this.cursor = cursor;
                    return false;
                }

                const y0 = cursor | 0;
                let first = y0 + 1 - halfWidth;
                let source = sampleData;
                if (
                    first < (isLooping && hasLooped ? loopStart : 0) ||
                    first + taps > upperLimit
                ) {
                    this.gather(first, taps, hasLooped);
                    source = scratch;
                    first = 0;
                }

                const phase = (cursor - y0) * OVERSAMPLING;
                const q = phase | 0;

                let row = q * taps;
                const fraction = phase - q;
                const rowEnd = row + taps;
                let out = 0;
                for (; row < rowEnd; row++) {
                    out +=
                        source[first++] *
                        (phases[row] + phaseDeltas[row] * fraction);
                }
                outputBuffer[i] = out;
                cursor += step;
            }
        } else {
            // Stretched kernel, every tap has its own position in the table
            const { table, tableDeltas } = this.kernel;
            const reach = halfWidth * stretch;
            const tableStep = OVERSAMPLING / stretch;
            const center = halfWidth * OVERSAMPLING;
            const gain = 1 / stretch;
            for (let i = 0; i < sampleCount; i++) {
                if (isLooping) {
                    if (cursor >= loopEnd) {
                        hasLooped = true;
                        while (cursor >= loopEnd) cursor -= loopLength;
                    }
                } else if (cursor + 1 >= end) {
                    outputBuffer.fill(0, i, sampleCount);
                    this.cursor = cursor;
                    return false;
                }

                // The points strictly inside the kernel's reach
                let first = Math.floor(cursor - reach) + 1;
                const taps = Math.floor(cursor + reach) - first + 1;
                let position = (first - cursor) * tableStep + center;
                let source = sampleData;
                if (
                    first < (isLooping && hasLooped ? loopStart : 0) ||
                    first + taps > upperLimit
                ) {
                    this.gather(first, taps, hasLooped);
                    source = scratch;
                    first = 0;
                }

                let out = 0;
                const last = first + taps;
                for (; first < last; first++) {
                    const index = position | 0;
                    out +=
                        source[first] *
                        (table[index] +
                            tableDeltas[index] * (position - index));
                    position += tableStep;
                }
                outputBuffer[i] = out * gain;

                cursor += step;
            }
        }
        this.cursor = cursor;
        this.hasLooped = hasLooped;
        return true;
    }

    /**
     * Copies the points into the scratch buffer, wrapping them around the loop.
     * Points outside the sample are silent.
     * @param first The index of the first point.
     * @param count The amount of points.
     * @param hasLooped If the cursor has already looped.
     */
    private gather(first: number, count: number, hasLooped: boolean) {
        const sampleData = this.sampleData!;
        const scratch = this.scratch;
        const { loopStart, loopEnd, loopLength, end } = this;
        if (this.isLooping) {
            // Bring the first point into the loop, the rest just wrap at the loop end
            // Modulo instead of a single wrap: the loop may be shorter than the kernel
            // Testcase: OmegaGMGS2.sf2 drum kit,
            // Crash Cymbal (loop length 1, shortest valid)
            let index = first;
            if (index >= loopEnd) {
                index = loopStart + ((index - loopStart) % loopLength);
            } else if (index < loopStart && hasLooped) {
                // After looping, the points before the loop start are the end of the loop
                index = loopEnd - 1 - ((loopStart - 1 - index) % loopLength);
            }
            for (let k = 0; k < count; k++) {
                // Before looping, there is no data before the sample start
                scratch[k] = index < 0 ? 0 : sampleData[index];
                if (++index >= loopEnd) index = loopStart;
            }
        } else {
            for (let k = 0; k < count; k++) {
                const index = first + k;
                scratch[k] = index >= 0 && index < end ? sampleData[index] : 0;
            }
        }
    }
}
