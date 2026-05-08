export * from "./basic_soundbank/generator_types";
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

export type SampleType = (typeof SampleTypes)[keyof typeof SampleTypes];

export const ModulatorControllerSources = {
    noController: 0,
    noteOnVelocity: 2,
    noteOnKeyNum: 3,
    polyPressure: 10,
    channelPressure: 13,
    pitchWheel: 14,
    pitchWheelRange: 16,
    link: 127
} as const;

export type ModulatorControllerSource =
    (typeof ModulatorControllerSources)[keyof typeof ModulatorControllerSources];

export const ModulatorCurveTypes = {
    linear: 0,
    concave: 1,
    convex: 2,
    switch: 3
} as const;

export type ModulatorCurveType =
    (typeof ModulatorCurveTypes)[keyof typeof ModulatorCurveTypes];

export const ModulatorTransformTypes = {
    linear: 0,
    absolute: 2
} as const;

export type ModulatorTransformType =
    (typeof ModulatorTransformTypes)[keyof typeof ModulatorTransformTypes];
