import type { SampleLoopingMode } from "../../types";

export class AudioSample {
    /**
     * The sample's audio data
     */
    public sampleData: Float32Array;
    /**
     * Current playback step (rate)
     */
    public playbackStep = 0;
    /**
     * Current position in the sample
     */
    public cursor = 0;
    /**
     * MIDI root key of the sample
     */
    public rootKey = 0;
    /**
     * Start position of the loop
     */
    public loopStart = 0;
    /**
     * End position of the loop
     */
    public loopEnd = 0;
    /**
     * End position of the sample
     */
    public end = 0;
    /**
     * Looping mode of the sample:
     * 0 - no loop
     * 1 - loop
     * 2 - UNOFFICIAL: polyphone 2.4 added start on release
     * 3 - loop then play when released
     */
    public loopingMode: SampleLoopingMode = 0;
    /**
     * Indicates if the sample is currently looping
     */
    public isLooping = false;

    /**
     * @param data
     * @param playbackStep the playback step, a single increment
     * @param cursorStart the sample id which starts the playback
     * @param rootKey MIDI root key
     * @param loopStart loop start index
     * @param loopEnd loop end index
     * @param endIndex sample end index (for end offset)
     * @param loopingMode sample looping mode
     */
    public constructor(
        data: Float32Array,
        playbackStep: number,
        cursorStart: number,
        rootKey: number,
        loopStart: number,
        loopEnd: number,
        endIndex: number,
        loopingMode: SampleLoopingMode
    ) {
        this.sampleData = data;
        this.playbackStep = playbackStep;
        this.cursor = cursorStart;
        this.rootKey = rootKey;
        this.loopStart = loopStart;
        this.loopEnd = loopEnd;
        this.end = endIndex;
        this.loopingMode = loopingMode;
        this.isLooping = this.loopingMode === 1 || this.loopingMode === 3;
    }
}
