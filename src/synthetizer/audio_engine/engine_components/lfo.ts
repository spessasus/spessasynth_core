/**
 * lfo.js
 * purpose: low frequency triangle oscillator
 */

/**
 * Gets the current value of the LFO at a given time.
 * @param startTime The time when the LFO started (in seconds).
 * @param frequency The frequency of the LFO (in Hz).
 * @param currentTime The current time (in seconds).
 * @returns The LFO value, which oscillates between -1 and 1.
 */
export function getLFOValue(
    startTime: number,
    frequency: number,
    currentTime: number
): number {
    if (currentTime < startTime) {
        return 0;
    }

    const xVal = (currentTime - startTime) / (1 / frequency) + 0.25;
    // offset by -0.25, otherwise we start at -1 and can have unexpected jump in pitch or low-pass
    // (happened with Synth Strings 2)

    // triangle, not sine
    return Math.abs(xVal - ~~(xVal + 0.5)) * 4 - 1;
}
