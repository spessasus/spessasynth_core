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
     * Cubic Hermite interpolation. Good quality with little artifacting. (Default)
     *
     * Recommended for most use-cases.
     */
    hermite: 2,
    /**
     * 32-point windowed sinc interpolation.
     *
     * Very high quality with almost no aliasing or harmonic distortion,
     * usable in real time, but at a significantly higher CPU cost.
     */
    sinc32: 3,
    /**
     * 128-point windowed sinc interpolation with antialiasing.
     *
     * The best quality, but extremely high cpu cost.
     *
     * > **Warning**
     * >
     * > This is very slow (especially for pitched up samples) and is meant for offline rendering, not real time playback.
     */
    sinc128: 4
} as const;

/**
 * @inheritDoc InterpolationTypes
 *
 * @group Synthesizer.Options
 */
export type InterpolationType =
    (typeof InterpolationTypes)[keyof typeof InterpolationTypes];

/**
 * The special EFX control sources of a {@link GSInsertionBlock} (EFX CONTROL SOURCE 1/2).
 * Values `1-95` select the control change with that number, other values are off.
 *
 * @group Synthesizer.GS Effects
 */
export const GSInsertionControlSources = {
    /**
     * No control.
     */
    off: 0,
    /**
     * Channel aftertouch (channel pressure).
     */
    channelPressure: 0x70,
    /**
     * Pitch bend.
     */
    pitchBend: 0x71
} as const;

// noinspection JSUnusedGlobalSymbols
/**
 * @inheritDoc GSInsertionControlSources
 *
 * @group Synthesizer.GS Effects
 */
export type GSInsertionControlSource =
    (typeof GSInsertionControlSources)[keyof typeof GSInsertionControlSources];
