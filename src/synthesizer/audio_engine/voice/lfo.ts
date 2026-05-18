/**
 * Lfo.ts
 * purpose: low frequency triangle oscillator
 */

const TWOPI = Math.PI * 2;
/**
 * Gets the current value of the LFO at a given time (sine wave).
 * @param startTime The time when the LFO started (in seconds).
 * @param frequency The frequency of the LFO (in Hz).
 * @param currentTime The current time (in seconds).
 * @returns The LFO value, which oscillates between -1 and 1.
 */
export function getLFOValueSine(
    startTime: number,
    frequency: number,
    currentTime: number
): number {
    if (currentTime < startTime) {
        return 0;
    }

    const elapsed = currentTime - startTime;

    // 2pif t gives a full sine cycle at the specified frequency
    return Math.sin(TWOPI * frequency * elapsed);
}
