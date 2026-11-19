/**
 * The base of every effect interface of {@link SpessaSynthProcessor}.
 *
 * @group Synthesizer
 */
export interface SynthesizerEffect<Snapshot> {
    /**
     * Clears the internal buffers and resets the effect to a default state.
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
