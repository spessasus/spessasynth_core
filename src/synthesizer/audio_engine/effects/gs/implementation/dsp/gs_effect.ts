import type { DefaultGSInsertionProcessor } from "./insertion_processor";
import type { DelayMemory } from "./blocks/delay_memory";

/**
 * The number of EFX parameters (1-20 in the manuals, 0-19 here).
 */
const PARAMETER_COUNT = 20;

/**
 * The base of every clean GS insertion (EFX) type.
 *
 * It keeps the 20 parameters and the EFX control offsets. A type owns its blocks, turns the parameters into
 * block settings in `update` (called after every change) and runs the blocks in `process` at the host's rate.
 * @internal
 */
export abstract class GSEffect implements DefaultGSInsertionProcessor {
    public abstract readonly type: number;
    protected readonly sampleRate: number;
    /**
     * The current parameters (0-19, EFX parameter 1 is 0).
     */
    protected readonly parameters = new Uint8Array(PARAMETER_COUNT);
    /**
     * The default parameters of this type.
     */
    protected abstract readonly defaults: Uint8Array;
    /**
     * The largest valid value of the parameters that do not span 0-127 (switches, Q indices).
     * Like the hardware, a value above it is ignored.
     */
    protected readonly limits: Readonly<Record<number, number>> = {};
    /**
     * The smallest valid value of the parameters that do not start at 0 (a value below it is ignored too).
     */
    protected readonly minimums: Readonly<Record<number, number>> = {};
    /**
     * Set while `reset` applies the defaults, so blocks can jump to them instead of moving there.
     */
    protected resetting = false;
    private readonly control = new Int8Array(2);

    /**
     * @param sampleRate The host rate, in Hertz.
     * @param memory The shared delay memory, for the types with long delay lines.
     */
    protected constructor(sampleRate: number, memory?: DelayMemory) {
        this.sampleRate = sampleRate;
        // This type's lines start where every other type's do
        memory?.rewind();
    }

    public reset() {
        this.parameters.set(this.defaults);
        this.clear();
        this.resetting = true;
        this.update();
        this.resetting = false;
    }

    public setParameter(parameter: number, value: number) {
        if (
            parameter >= PARAMETER_COUNT ||
            value > (this.limits[parameter] ?? 127) ||
            value < (this.minimums[parameter] ?? 0)
        ) {
            return;
        }
        this.parameters[parameter] = value;
        this.update();
    }

    public setControl(offset1: number, offset2: number) {
        this.control[0] = offset1;
        this.control[1] = offset2;
        this.update();
    }

    public abstract process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ): void;

    /**
     * A parameter with the offset of an EFX control source added, clamped to 0-127.
     * @param source The control source (0 or 1).
     * @param parameter The parameter (0-19).
     */
    protected controlled(source: number, parameter: number) {
        return Math.max(
            0,
            Math.min(127, this.parameters[parameter] + this.control[source])
        );
    }

    /**
     * The offset of an EFX control source, a signed byte (for the parameters it moves by a scaled amount).
     * @param source The control source (0 or 1).
     */
    protected controlOffset(source: number) {
        return this.control[source];
    }

    /**
     * Clears the audio state (filter states, delay lines).
     */
    protected abstract clear(): void;

    /**
     * Applies the parameters and the control offsets to the blocks.
     */
    protected abstract update(): void;
}

/**
 * Creates a clean EFX type. All types of one insertion block share the memory.
 * @internal
 */
export type GSEffectConstructor = new (
    sampleRate: number,
    memory: DelayMemory
) => GSEffect;
