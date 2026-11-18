/**
 * The matrix sources, in the order of the GS and XG parameter blocks.
 * CC1 and CC2 are the assignable controllers (GS CC1 / CC2, XG AC1 / AC2).
 */
export const MatrixSources = {
    modulationWheel: 0,
    pitchWheel: 1,
    channelPressure: 2,
    polyPressure: 3,
    cc1: 4,
    cc2: 5
} as const;
export type MatrixSource = (typeof MatrixSources)[keyof typeof MatrixSources];

/**
 * The matrix destinations, in the GS order. XG uses the first three and the LFO1 depths.
 */
export const MatrixDestinations = {
    pitch: 0,
    cutoff: 1,
    amplitude: 2,
    lfo1Rate: 3,
    lfo1Pitch: 4,
    lfo1Filter: 5,
    lfo1Amplitude: 6,
    lfo2Rate: 7,
    lfo2Pitch: 8,
    lfo2Filter: 9,
    lfo2Amplitude: 10
} as const;
export type MatrixDestination =
    (typeof MatrixDestinations)[keyof typeof MatrixDestinations];
