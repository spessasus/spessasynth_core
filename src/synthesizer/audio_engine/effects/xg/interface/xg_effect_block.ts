/**
 * A snapshot of a {@link XGEffectBlock}.
 *
 * @group Synthesizer.XG Effects
 */
export interface XGEffectBlockSnapshot {
    /**
     * The type of the processor.
     * Per XG spec, BASIC EFFECT (LSB = 0) will be used if the exact match is missing.
     * If both are missing, fallback will be used.
     * The newly selected processor is reset to its type defaults,
     * mirroring the GS insertion behavior.
     */
    type: number;

    /**
     * The 16 parameter values for this effect block (14-bit wide params, 7-bit single-byte params).
     */
    params: Int16Array;
}

/**
 * This is the base for all Yamaha XG effect interfaces.
 *
 * It represents a single effect block.
 *
 * There are 4 effect blocks types in XG:
 * - Reverb
 * - Chorus
 * - Variation
 * - Insertion
 *
 * @group Synthesizer.XG Effects
 */
export interface XGEffectBlock {
    /**
     * Sets the type of the processor.
     * Per XG spec, BASIC EFFECT (LSB = 0) should be used if the exact match is missing.
     *
     * Type change should reset the parameters.
     * Fallback behavior (no BASIC EFFECT) is up to the implementation.
     *
     * @param type The 16-bit type value to use.
     */
    setType(type: number): void;

    /**
     * Resets this block to default values, including the processor type.
     */
    reset(): void;

    /**
     * Sets the given effect parameter to the given value.
     * @param param The parameter number (0-based).
     * @param value The value: 14-bit for two-byte params, 7-bit for single-byte params.
     */
    setParameter(param: number, value: number): void;

    /**
     * Gets a snapshot of this XG effect block.
     */
    getSnapshot(): XGEffectBlockSnapshot;

    /**
     * Restores this XG effect block from a snapshot.
     * @param snapshot The snapshot to restore.
     */
    applySnapshot(snapshot: XGEffectBlockSnapshot): void;
}
