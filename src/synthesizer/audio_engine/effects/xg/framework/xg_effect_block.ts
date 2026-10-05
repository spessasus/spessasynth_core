import type {
    XGEffectProcessor,
    XGEffectProcessorConstructor
} from "./xg_effect_processor";

/**
 * A snapshot of a {@link XGEffectBlock}.
 */
export interface XGEffectBlockSnapshot {
    /**
     * The 16-bit effect type.
     */
    type: number;
    /**
     * The 16 parameter values (14-bit wide params, 7-bit single-byte params).
     */
    params: Int16Array;
}

/**
 * This class represents a single XG effect block.
 * Each block contains a specific processor and may be an insertion or system effect.
 * This class does the mixing and routing of the effect.
 */
export abstract class XGEffectBlock {
    /**
     * The currently used processor.
     */
    protected processor: XGEffectProcessor;
    /**
     * Staging buffers for the raw DSP output, before block mixing.
     * Always 0-based, up to `maxBufferSize` samples.
     */
    protected readonly outputLeft;
    protected readonly outputRight;
    /**
     * The list of effects available in this block.
     * Effect type: processor.
     */
    private readonly effectMap = new Map<number, XGEffectProcessor>();
    private readonly fallbackProcessor: XGEffectProcessor;
    private readonly defaultType;

    /**
     * Initializes the new XG effect block.
     * @param effectMap The map of all effect constructors to initialize.
     * @param fallbackProcessor The fallback processor in case the real processor is missing.
     * @param defaultType The default effect type.
     * @param sampleRate The sample rate, in Hertz.
     * @param maxBufferSize The maximum buffer size the synthesizer can render at once.
     * Attempting to `.process()` more samples than this will result in an error.
     */
    protected constructor(
        effectMap: Map<number, XGEffectProcessorConstructor>,
        fallbackProcessor: XGEffectProcessorConstructor,
        defaultType: number,
        sampleRate: number,
        maxBufferSize: number
    ) {
        for (const [key, value] of effectMap) {
            this.effectMap.set(key, new value(sampleRate, maxBufferSize));
        }
        this.fallbackProcessor = new fallbackProcessor(
            sampleRate,
            maxBufferSize
        );
        this.processor =
            this.effectMap.get(defaultType) ?? this.fallbackProcessor;
        this.defaultType = defaultType;
        this._type = defaultType;
        this.outputLeft = new Float32Array(maxBufferSize);
        this.outputRight = new Float32Array(maxBufferSize);
    }

    private _type;

    public get type() {
        return this._type;
    }

    /**
     * Sets the type of the processor.
     * Per XG spec, BASIC EFFECT (LSB = 0) will be used if the exact match is missing.
     * If both are missing, fallback will be used.
     * The newly selected processor is reset to its type defaults,
     * mirroring the GS insertion behavior.
     * @param type The 16-bit type value to use.
     */
    public setType(type: number) {
        this._type = type;
        this.processor =
            this.effectMap.get(type) ??
            this.effectMap.get(type & 0xff_00) ??
            this.fallbackProcessor;
        this.processor.reset();
    }

    /**
     * Resets this block to default values, including the processor type.
     */
    public reset() {
        this.setType(this.defaultType);
    }

    /**
     * Sets the given effect parameter to the given value.
     * @param param The parameter number (0-based).
     * @param value The value: 14-bit for two-byte params, 7-bit for single-byte params.
     */
    public setParameter(param: number, value: number) {
        this.processor.setParameter(param, value);
    }

    /**
     * Gets a snapshot of this XG effect block.
     */
    public getSnapshot(): XGEffectBlockSnapshot {
        return {
            type: this.type,
            params: this.processor.getSnapshot()
        };
    }

    /**
     * Restores this XG effect block from a snapshot.
     * @param snapshot The snapshot to restore.
     */
    public applySnapshot(snapshot: XGEffectBlockSnapshot) {
        this.setType(snapshot.type);
        const params = snapshot.params;
        for (let i = 0; i < 16 && i < params.length; i++) {
            this.setParameter(i, params[i]);
        }
    }
}

const MIN_PAN = 1;
const MAX_PAN = 127;
const PAN_RESOLUTION = MAX_PAN - MIN_PAN;

// Initialize pan lookup tables
const panTableLeft = new Float32Array(PAN_RESOLUTION + 1);
const panTableRight = new Float32Array(PAN_RESOLUTION + 1);
for (let pan = MIN_PAN; pan <= MAX_PAN; pan++) {
    // Clamp to 0-1
    const realPan = (pan - MIN_PAN) / PAN_RESOLUTION;
    const tableIndex = pan - MIN_PAN;
    panTableLeft[tableIndex] = Math.cos((Math.PI / 2) * realPan);
    panTableRight[tableIndex] = Math.sin((Math.PI / 2) * realPan);
}

/**
 * A snapshot of a {@link XGSystemEffectBlock}.
 */
export interface XGSystemEffectBlockSnapshot extends XGEffectBlockSnapshot {
    /**
     * The return (level) of the effect.
     */
    returnLevel: number;
    /**
     * The stereo panning of the effect.
     */
    pan: number;
}

/**
 * This class represents a single XG system effect block.
 *
 * System effects are global and have a send level for each channel, always adding wet output into them.
 */
export abstract class XGSystemEffectBlock extends XGEffectBlock {
    /**
     * The return (level) of the effect. 0 is silence (-Inf dB), 64 is normal (0 dB) and 127 is double the volume (+6 dB).
     */
    public returnLevel = 64;

    /**
     * The stereo panning of this effect.
     * 1 is hard left, 64 is center, 127 is hard right.
     */
    public pan = 64;

    public reset() {
        super.reset();
        this.returnLevel = 64;
        this.pan = 64;
    }

    public getSnapshot(): XGSystemEffectBlockSnapshot {
        return {
            ...super.getSnapshot(),
            returnLevel: this.returnLevel,
            pan: this.pan
        };
    }

    public applySnapshot(snapshot: XGSystemEffectBlockSnapshot) {
        super.applySnapshot(snapshot);
        this.returnLevel = snapshot.returnLevel;
        this.pan = snapshot.pan;
    }

    /**
     * Mixes the staged wet output into the system effect destination, applying return and pan.
     * @param outputLeft The left output buffer.
     * @param outputRight The right output buffer.
     * @param startIndex The index to start mixing at into the output buffers.
     * @param sampleCount The amount of samples to mix.
     */
    protected mixSystemEffect(
        outputLeft: Float32Array,
        outputRight: Float32Array,
        startIndex: number,
        sampleCount: number
    ) {
        const gain = this.returnLevel / 64;
        const panIndex =
            Math.min(MAX_PAN, Math.max(MIN_PAN, this.pan)) - MIN_PAN;
        const gainLeft = panTableLeft[panIndex] * gain;
        const gainRight = panTableRight[panIndex] * gain;

        for (let i = 0; i < sampleCount; i++) {
            const outIndex = startIndex + i;
            outputLeft[outIndex] += this.outputLeft[i] * gainLeft;
            outputRight[outIndex] += this.outputRight[i] * gainRight;
        }
    }

    /**
     * Adds the wet output into a send buffer (e.g. chorus into reverb).
     * Send reads from the wet signal before return, so it sounds even at return 0.
     * Mixing always starts at index 0.
     *
     * @param outputLeft The left send buffer.
     * @param outputRight The right send buffer.
     * @param sampleCount The amount of samples to mix.
     * @param send The send amount, where 64 is 100%;
     */
    protected addSend(
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number,
        send: number
    ) {
        // Common scenario
        if (send === 0) return;
        const gain = send / 64;

        for (let i = 0; i < sampleCount; i++) {
            outputLeft[i] += this.outputLeft[i] * gain;
            outputRight[i] += this.outputRight[i] * gain;
        }
    }
}
