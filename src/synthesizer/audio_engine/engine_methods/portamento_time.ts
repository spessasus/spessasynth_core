// Tests were performed by John Novak
// https://github.com/dosbox-staging/dosbox-staging/pull/2705

/*
CC 5 value  Portamento time
----------  ---------------
     0          0.000 s
     1          0.006 s
     2          0.023 s
     4          0.050 s
     8          0.110 s
    16          0.250 s
    32          0.500 s
    64          2.060 s
    80          4.200 s
    96          8.400 s
   112         19.500 s
   116         26.700 s
   120         40.000 s
   124         80.000 s
   127        480.000 s
*/

const portamentoLookup: Record<number, number> = {
    0: 0.0,
    1: 0.006,
    2: 0.023,
    4: 0.05,
    8: 0.11,
    16: 0.25,
    32: 0.5,
    64: 2.06,
    80: 4.2,
    96: 8.4,
    112: 19.5,
    116: 26.7,
    120: 40.0,
    124: 80.0,
    127: 480.0
} as const;

function getLookup(value: number): number {
    if (portamentoLookup[value] !== undefined) {
        return portamentoLookup[value];
    }
    // Get the nearest lower and upper points from the lookup table
    let lower = null;
    let upper = null;

    for (const k of Object.keys(portamentoLookup)) {
        const key = parseInt(k);
        if (key < value && (lower === null || key > lower)) {
            lower = key;
        }
        if (key > value && (upper === null || key < upper)) {
            upper = key;
        }
    }

    // If we have found both lower and upper points, perform linear interpolation
    if (lower !== null && upper !== null) {
        const lowerTime = portamentoLookup[lower];
        const upperTime = portamentoLookup[upper];

        // Linear interpolation
        return (
            lowerTime +
            ((value - lower) * (upperTime - lowerTime)) / (upper - lower)
        );
    }
    return 0;
}

/**
 * Converts portamento time to seconds.
 * @param time MIDI portamento time (CC 5 value) (0-127)
 * @param distance Distance in semitones (keys) to slide over.
 * @returns The portamento time in seconds.
 */
export function portamentoTimeToSeconds(
    time: number,
    distance: number
): number {
    // This seems to work fine for the MIDIs I have.
    // Why? No idea, but it does. :-)
    // Note: Some tests about portamento were compared to SC-VA and SYXG50
    return getLookup(time) * (distance / 36);
}
