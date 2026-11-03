/**
 * How long a delay change crossfades from the old reads to the new ones.
 */
const FADE_SECONDS = 0.01;

/**
 * The crossfade of a block whose delays jump when a parameter changes (a delay time, a pre delay, a depth): the
 * old reads fade out while the new ones fade in, so a change while playing does not click. The hardware jumps
 * (SC-VA mutes the wet path only while it writes the registers).
 *
 * The block keeps its settings twice, `current` and `previous`. A change only marks the target, the fade picks it
 * up when the running one is done, so a sweep becomes a chain of fades. After `clear()` the first change applies at
 * once (a type select or a reset).
 * @internal
 */
export class Crossfade {
    /**
     * The weight of the current reads, 1 when no fade runs (the previous reads get `1 - gain`).
     */
    public gain = 1;
    /**
     * Whether the previous reads are needed this sample.
     */
    public active = false;
    private readonly step: number;
    private pending = false;
    private immediate = true;

    public constructor(sampleRate: number) {
        this.step = 1 / (FADE_SECONDS * sampleRate);
    }

    /**
     * Marks the target settings as changed.
     */
    public request() {
        this.pending = true;
    }

    /**
     * Steps the fade, once per sample before the reads.
     * @returns Whether the block now takes its target: the current settings become the previous ones.
     */
    public tick() {
        let take = false;
        if (this.active) {
            this.gain += this.step;
            if (this.gain >= 1) {
                this.gain = 1;
                this.active = false;
            }
        } else if (this.pending) {
            this.pending = false;
            take = true;
            if (!this.immediate) {
                this.active = true;
                this.gain = 0;
            }
        }
        this.immediate = false;
        return take;
    }

    public clear() {
        this.gain = 1;
        this.active = false;
        this.immediate = true;
    }
}
