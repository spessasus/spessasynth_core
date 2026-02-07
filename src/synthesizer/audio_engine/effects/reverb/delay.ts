export class DelayLine {
    public gain = 1;
    public feedback = 0;
    /**
     * Samples
     */
    public time: number;
    private readonly buffer;
    private readonly bufferLength;
    private writeIndex = 0;

    public constructor(maxDelay: number) {
        this.buffer = new Float32Array(maxDelay);
        this.bufferLength = this.buffer.length;
        this.time = maxDelay - 5;
    }

    public clear() {
        this.buffer.fill(0);
    }

    public process(
        input: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        startIndex: number,
        endIndex: number
    ) {
        let writeIndex = this.writeIndex;
        const delay = this.time;
        const buffer = this.buffer;
        const bufferLength = this.bufferLength;
        const gain = this.gain;
        const feedback = this.feedback;
        for (let i = startIndex; i < endIndex; i++) {
            // Read
            let readIndex = writeIndex - delay;
            if (readIndex < 0) readIndex += bufferLength;
            const delayed = buffer[readIndex];
            const sample = delayed * gain;
            outputLeft[i] += sample;
            outputRight[i] += sample;

            // Write
            buffer[writeIndex] = input[i - startIndex] + delayed * feedback;

            // Then wrap!
            if (++writeIndex >= bufferLength) writeIndex = 0;
        }
        this.writeIndex = writeIndex;
    }
}
