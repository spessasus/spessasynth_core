/**
 * The base of every effect interface of {@link SpessaSynthProcessor}.
 *
 * @group Synthesizer
 */
export interface SynthesizerEffect<Snapshot> {
    /**
     * Clears the internal buffers and resets the effect to a default state, including its type and send levels
     * where it has them.
     * The synthesizer calls it on a system reset (unless the effect is locked) and then applies its own defaults,
     * such as the GS macros.
     */
    reset(): void;

    /**
     * Gets a snapshot of this effect.
     */
    getSnapshot(): Snapshot;

    /**
     * Restores this effect from a snapshot.
     * @param snapshot The snapshot to restore.
     */
    applySnapshot(snapshot: Snapshot): void;
}
