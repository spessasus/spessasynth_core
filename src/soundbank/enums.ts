export * from "./basic_soundbank/generator_types";
/**
 * All SF2 Sample Types.
 *
 * The only ones that are properly defined are mono, left and right.
 *
 * @group Sound Banks.Samples
 */
export const SampleTypes = {
    monoSample: 1,
    rightSample: 2,
    leftSample: 4,
    linkedSample: 8,
    romMonoSample: 32_769,
    romRightSample: 32_770,
    romLeftSample: 32_772,
    romLinkedSample: 32_776
} as const;

/**
 * @inheritDoc SampleTypes
 *
 * @group Sound Banks.Samples
 */
export type SampleType = (typeof SampleTypes)[keyof typeof SampleTypes];

/**
 * All SF2 {@link Modulator} controller sources.
 * These values are mapped on the range from 0 to 1 (or -1 to 1 for bipolar transform) with the transform specified.
 *
 * @group Sound Banks.Modulators
 */
export const ModulatorControllerSources = {
    /**
     * Value is equal to 1.
     */
    noController: 0,
    /**
     * Velocity of the note on event associated with the voice.
     */
    noteOnVelocity: 2,
    /**
     * MIDI note number of the note on event associated with the voice.
     */
    noteOnKeyNum: 3,
    /**
     * Current poly pressure on the same note as the voice.
     */
    polyPressure: 10,
    /**
     * Current channel pressure on the channel.
     */
    channelPressure: 13,
    /**
     * The current pitch wheel value on the channel.
     */
    pitchWheel: 14,
    /**
     * The current pitch wheel range (where 1 means 127 semitones) on the channel.
     */
    pitchWheelRange: 16,
    /**
     * Unsupported and discarded if encountered.
     */
    link: 127
} as const;

/**
 * @inheritDoc ModulatorControllerSources
 *
 * @group Sound Banks.Modulators
 */
export type ModulatorControllerSource =
    (typeof ModulatorControllerSources)[keyof typeof ModulatorControllerSources];

/**
 * All SF2 {@link Modulator} curve types.
 *
 * @group Sound Banks.Modulators
 */
export const ModulatorCurveTypes = {
    /**
     * Linear ramp.
     */
    linear: 0,
    /**
     * Logarithmic ramp. Using this ramp with decibels results in exactly squared volume increase in linear gain.
     */
    concave: 1,
    /**
     * Inverse of concave.
     */
    convex: 2,
    /**
     * First half is 0, second half is 1.
     */
    switch: 3
} as const;

/**
 * @inheritDoc ModulatorCurveTypes
 *
 * @group Sound Banks.Modulators
 */
export type ModulatorCurveType =
    (typeof ModulatorCurveTypes)[keyof typeof ModulatorCurveTypes];

/**
 * The additional operation to perform when computing a {@link Modulator} value.
 *
 * @group Sound Banks.Modulators
 */
export const ModulatorTransformTypes = {
    /**
     * No operation.
     */
    linear: 0,
    /**
     * Absolute value of the computed result. Rarely used.
     */
    absolute: 2
} as const;

/**
 * @inheritDoc ModulatorTransformTypes
 *
 * @group Sound Banks.Modulators
 */
export type ModulatorTransformType =
    (typeof ModulatorTransformTypes)[keyof typeof ModulatorTransformTypes];
