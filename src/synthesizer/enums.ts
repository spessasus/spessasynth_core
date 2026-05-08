// Note: this is kept as an enum for performance reasons.
/**
 * The available interpolation types of the synthesizer.
 */
export const InterpolationTypes = {
    linear: 0,
    nearestNeighbor: 1,
    hermite: 2
} as const;
export type InterpolationType =
    (typeof InterpolationTypes)[keyof typeof InterpolationTypes];
