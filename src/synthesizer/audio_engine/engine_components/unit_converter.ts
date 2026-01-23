/**
 * Unit_converter.ts
 * purpose: converts soundfont units into more usable values with the use of lookup tables to improve performance
 */

// Timecent lookup table
const MIN_TIMECENT = -15_000;
const MAX_TIMECENT = 15_000;
const timecentLookupTable = new Float32Array(MAX_TIMECENT - MIN_TIMECENT + 1);
for (let i = 0; i < timecentLookupTable.length; i++) {
    const timecents = MIN_TIMECENT + i;
    timecentLookupTable[i] = Math.pow(2, timecents / 1200);
}

/**
 * Converts timecents to seconds.
 * @param timecents The timecents value.
 * @returns The time in seconds.
 */
export function timecentsToSeconds(timecents: number): number {
    if (timecents <= -32_767) {
        return 0;
    }
    return timecentLookupTable[timecents - MIN_TIMECENT];
}

// Abs cent lookup table
const MIN_ABS_CENT = -20_000; // FreqVibLfo
const MAX_ABS_CENT = 16_500; // FilterFc
const absoluteCentLookupTable = new Float32Array(
    MAX_ABS_CENT - MIN_ABS_CENT + 1
);
for (let i = 0; i < absoluteCentLookupTable.length; i++) {
    const absoluteCents = MIN_ABS_CENT + i;
    absoluteCentLookupTable[i] =
        440 * Math.pow(2, (absoluteCents - 6900) / 1200);
}

/**
 * Converts absolute cents to frequency in Hz.
 * @param cents The absolute cents value.
 * @returns The frequency in Hz.
 */
export function absCentsToHz(cents: number): number {
    if (cents < MIN_ABS_CENT || cents > MAX_ABS_CENT) {
        return 440 * Math.pow(2, (cents - 6900) / 1200);
    }
    return absoluteCentLookupTable[Math.trunc(cents) - MIN_ABS_CENT];
}

// Centibel lookup table (1 cB precision)
// 1 dB = 10 cB
const MIN_CENTIBELS = -16_600; // -1660 dB
const MAX_CENTIBELS = 16_000; //  1600 dB

const centibelLookUpTable = new Float32Array(MAX_CENTIBELS - MIN_CENTIBELS + 1);

for (let i = 0; i < centibelLookUpTable.length; i++) {
    const centibels = MIN_CENTIBELS + i;
    centibelLookUpTable[i] = Math.pow(10, -centibels / 200);
}

/**
 * Converts centibel attenuation to gain.
 * @param centibels The centibel value.
 * @return The gain value.
 */
export function cbAttenuationToGain(centibels: number): number {
    return centibelLookUpTable[Math.floor(centibels - MIN_CENTIBELS)];
}
