export class DelayLine {
    public feedback = 0;
    public gain = 1;
    private readonly buffer;
    private readonly bufferLength;
    private writeIndex = 0;

    public constructor(maxDelay: number) {
        this.buffer = new Float32Array(maxDelay);
        this.bufferLength = this.buffer.length;
        this._time = maxDelay - 5;
    }

    /**
     * Samples
     */
    private _time: number;

    public get time(): number {
        return this._time;
    }

    public set time(value: number) {
        // Changing the time only moves the read position, so the delayed signal is kept.
        // A delay of 0 would read the slot before it is written, so 1 is the minimum.
        this._time = Math.max(1, Math.min(this.bufferLength - 1, value)) | 0;
    }

    public clear() {
        this.buffer.fill(0);
    }

    /**
     * OVERWRITES the output
     * @param input The input samples.
     * @param output The output buffer to overwrite.
     * @param sampleCount The number of samples to process.
     */
    public process(
        input: Float32Array,
        output: Float32Array,
        sampleCount: number
    ) {
        let writeIndex = this.writeIndex;
        const delay = this._time;
        const buffer = this.buffer;
        const bufferLength = this.bufferLength;
        const feedback = this.feedback;
        const gain = this.gain;
        for (let i = 0; i < sampleCount; i++) {
            // Read
            let readIndex = writeIndex - delay;
            if (readIndex < 0) readIndex += bufferLength;
            const delayed = buffer[readIndex];
            output[i] = delayed * gain;

            // Write
            buffer[writeIndex] = input[i] + delayed * feedback;

            // Then wrap!
            if (++writeIndex >= bufferLength) writeIndex = 0;
        }
        this.writeIndex = writeIndex;
    }
}
