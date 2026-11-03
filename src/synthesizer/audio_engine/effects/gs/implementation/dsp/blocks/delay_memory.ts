import { DelayLine } from "./delay_line";

/**
 * The delay memory of the insertion block, shared by every EFX type.
 *
 * Only one type runs at a time, so each type takes its lines from the start of the same buffer.
 * Every type is built at once, so lines of their own would cost too much memory at high rates.
 * The buffer grows while the types are built (never while they run) to fit the hungriest one.
 * @internal
 */
export class DelayMemory {
    private buffer = new Float32Array(0);
    private cursor = 0;
    private readonly lines = new Array<DelayLine>();
    private readonly offsets = new Array<number>();

    /**
     * Starts the lines of the next type at the beginning of the buffer.
     */
    public rewind() {
        this.cursor = 0;
    }

    /**
     * A delay line that lives in this memory.
     * @param maxDelay The longest delay that will be read, in samples.
     */
    public line(maxDelay: number) {
        const size = DelayLine.sizeFor(maxDelay);
        const offset = this.cursor;
        this.cursor += size;
        if (this.cursor > this.buffer.length) {
            // Move the lines handed out so far to the larger buffer
            this.buffer = new Float32Array(this.cursor);
            for (let i = 0; i < this.lines.length; i++) {
                const line = this.lines[i];
                line.buffer = this.buffer.subarray(
                    this.offsets[i],
                    this.offsets[i] + line.buffer.length
                );
            }
        }
        const line = new DelayLine(
            maxDelay,
            this.buffer.subarray(offset, offset + size)
        );
        this.lines.push(line);
        this.offsets.push(offset);
        return line;
    }
}
