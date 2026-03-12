export interface BiquadCoeffs {
    b0: number;
    b1: number;
    b2: number;
    a0: number;
    a1: number;
    a2: number;
}

export interface BiquadState {
    x1: number;
    x2: number;
    y1: number;
    y2: number;
}

const HALF_PI = Math.PI / 2;

const MIN_PAN = -64;
const MAX_PAN = 63;
const PAN_RESOLUTION = MAX_PAN - MIN_PAN;
// Initialize pan lookup tables
export const panTableLeft = new Float32Array(PAN_RESOLUTION + 1);
export const panTableRight = new Float32Array(PAN_RESOLUTION + 1);
for (let pan = MIN_PAN; pan <= MAX_PAN; pan++) {
    // Clamp to 0-1
    const realPan = (pan - MIN_PAN) / PAN_RESOLUTION;
    const tableIndex = pan - MIN_PAN;
    panTableLeft[tableIndex] = Math.cos(HALF_PI * realPan);
    panTableRight[tableIndex] = Math.sin(HALF_PI * realPan);
}

export function zeroState(h: BiquadState) {
    h.x1 = h.x2 = h.y1 = h.y2 = 0;
}

export const zeroCoeffs = {
    b0: 1,
    b1: 0,
    b2: 0,
    a0: 1,
    a1: 0,
    a2: 0
};

export function applyShelves(
    x: number,
    lowC: BiquadCoeffs,
    highC: BiquadCoeffs,
    lowS: BiquadState,
    highS: BiquadState
) {
    // Direct form I (inlined for performance)
    // Low shelf
    const l =
        lowC.b0 * x +
        lowC.b1 * lowS.x1 +
        lowC.b2 * lowS.x2 -
        lowC.a1 * lowS.y1 -
        lowC.a2 * lowS.y2;
    lowS.x2 = lowS.x1;
    lowS.x1 = x;
    lowS.y2 = lowS.y1;
    lowS.y1 = l;
    // High shelf
    const h =
        highC.b0 * l +
        highC.b1 * highS.x1 +
        highC.b2 * highS.x2 -
        highC.a1 * highS.y1 -
        highC.a2 * highS.y2;
    highS.x2 = highS.x1;
    highS.x1 = l;
    highS.y2 = highS.y1;
    highS.y1 = h;
    return h;
}

export function processBiquad(
    x: number,
    coeffs: BiquadCoeffs,
    state: BiquadState
) {
    // Direct form I
    const y =
        coeffs.b0 * x +
        coeffs.b1 * state.x1 +
        coeffs.b2 * state.x2 -
        coeffs.a1 * state.y1 -
        coeffs.a2 * state.y2;
    state.x2 = state.x1;
    state.x1 = x;
    state.y2 = state.y1;
    state.y1 = y;
    return y;
}

/**
 * Robert Bristow-Johnson cookbook formulas
 * (https://webaudio.github.io/Audio-EQ-Cookbook/audio-eq-cookbook.html)
 *
 * S - a "shelf slope" parameter (for shelving EQ only).
 * When S = 1, the shelf slope is as steep as it can be and remain monotonically increasing or decreasing gain with frequency.
 * The shelf slope, in dB/octave,
 * remains proportional to S for all other values for a fixed  f0/Fs and dB gain.
 */
export function computeShelfCoeffs(
    coeffs: BiquadCoeffs,
    dbGain: number,
    f0: number,
    fs: number,
    isLow: boolean
) {
    const A = Math.pow(10, dbGain / 40);
    const w0 = (2 * Math.PI * f0) / fs;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const S = 1;
    const alpha = (sinw0 / 2) * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);

    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;

    if (isLow) {
        // Low shelf
        b0 = A * (A + 1 - (A - 1) * cosw0 + 2 * Math.sqrt(A) * alpha);
        b1 = 2 * A * (A - 1 - (A + 1) * cosw0);
        b2 = A * (A + 1 - (A - 1) * cosw0 - 2 * Math.sqrt(A) * alpha);
        a0 = A + 1 + (A - 1) * cosw0 + 2 * Math.sqrt(A) * alpha;
        a1 = -2 * (A - 1 + (A + 1) * cosw0);
        a2 = A + 1 + (A - 1) * cosw0 - 2 * Math.sqrt(A) * alpha;
    } else {
        // High shelf
        b0 = A * (A + 1 + (A - 1) * cosw0 + 2 * Math.sqrt(A) * alpha);
        b1 = -2 * A * (A - 1 + (A + 1) * cosw0);
        b2 = A * (A + 1 + (A - 1) * cosw0 - 2 * Math.sqrt(A) * alpha);
        a0 = A + 1 - (A - 1) * cosw0 + 2 * Math.sqrt(A) * alpha;
        a1 = 2 * (A - 1 - (A + 1) * cosw0);
        a2 = A + 1 - (A - 1) * cosw0 - 2 * Math.sqrt(A) * alpha;
    }

    // Normalize
    coeffs.b0 = b0 / a0;
    coeffs.b1 = b1 / a0;
    coeffs.b2 = b2 / a0;
    coeffs.a0 = 1;
    coeffs.a1 = a1 / a0;
    coeffs.a2 = a2 / a0;
}
export const zeroStateC = { x1: 0, x2: 0, y1: 0, y2: 0 };
