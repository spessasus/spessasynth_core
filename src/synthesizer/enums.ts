// Note: this is kept as an enum for performance reasons.
/**
 * The available interpolation types of the synthesizer.
 * Interpolation defines how sample points between the sample data are calculated.
 * This has high cost on performance but can improve the quality.
 *
 * @group Synthesizer.Options
 */
export const InterpolationTypes = {
    /**
     * Linear interpolation. Fast with acceptable quality.
     */
    linear: 0,
    /**
     * Nearest neighbor, essentially no interpolation.
     * Fastest, but lowest quality.
     * It may be desirable in some cases to make the sound "crispier".
     */
    nearestNeighbor: 1,
    /**
     * Slowest, high quality with little artifacting. (Default)
     */
    hermite: 2
} as const;

/**
 * @inheritDoc InterpolationTypes
 *
 * @group Synthesizer.Options
 */
export type InterpolationType =
    (typeof InterpolationTypes)[keyof typeof InterpolationTypes];
