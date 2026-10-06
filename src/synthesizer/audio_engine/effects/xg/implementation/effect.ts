import type {
    DefaultXGEffectProcesor,
    XGEffectProcessorConstructor
} from "./dsp/effect_processor";
import type {
    XGEffectBlock,
    XGEffectBlockSnapshot
} from "../interface/xg_effect_block";

/**
 * The default implementation for {@link XGEffectBlock}.
 *
 * This class represents a single XG effect block.
 * Each block contains a specific processor and may be an insertion or system effect.
 * This class does the mixing and routing of the effect.
 */
export abstract class DefaultXGEffect implements XGEffectBlock {
    /**
     * The currently used processor.
     */
    protected processor: DefaultXGEffectProcesor;
    protected readonly outputLeft;
    protected readonly outputRight;
    /**
     * The list of effects available in this block.
     * Effect type: processor.
     */
    private readonly effectMap = new Map<number, DefaultXGEffectProcesor>();
    private readonly fallbackProcessor: DefaultXGEffectProcesor;
    private readonly defaultType;
    private type;

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
        this.type = defaultType;

        this.outputLeft = new Float32Array(maxBufferSize);
        this.outputRight = new Float32Array(maxBufferSize);
    }

    public setType(type: number) {
        this.type = type;
        this.processor =
            this.effectMap.get(type) ??
            this.effectMap.get(type & 0xff_00) ??
            this.fallbackProcessor;
        this.processor.reset();
    }

    public reset() {
        this.setType(this.defaultType);
    }
    public setParameter(param: number, value: number) {
        this.processor.setParameter(param, value);
    }

    public getSnapshot() {
        return {
            type: this.type,
            params: this.processor.getSnapshot()
        };
    }

    public applySnapshot(snapshot: XGEffectBlockSnapshot) {
        this.setType(snapshot.type);
        const params = snapshot.params;
        for (let i = 0; i < 16 && i < params.length; i++) {
            this.setParameter(i, params[i]);
        }
    }
}
