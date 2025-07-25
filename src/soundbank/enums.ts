export const sampleTypes = {
    monoSample: 1,
    rightSample: 2,
    leftSample: 4,
    linkedSample: 8,
    romMonoSample: 32769,
    romRightSample: 32770,
    romLeftSample: 32772,
    romLinkedSample: 32776
} as const;

export type sampleTypes = (typeof sampleTypes)[keyof typeof sampleTypes];

export const modulatorSources = {
    noController: 0,
    noteOnVelocity: 2,
    noteOnKeyNum: 3,
    polyPressure: 10,
    channelPressure: 13,
    pitchWheel: 14,
    pitchWheelRange: 16,
    link: 127
} as const;

export type modulatorSources =
    (typeof modulatorSources)[keyof typeof modulatorSources];

export const modulatorCurveTypes = {
    linear: 0,
    concave: 1,
    convex: 2,
    switch: 3
} as const;

export type modulatorCurveTypes =
    (typeof modulatorCurveTypes)[keyof typeof modulatorCurveTypes];

export const modulatorTransformTypes = {
    linear: 0,
    absolute: 2
} as const;

export type modulatorTransformTypes =
    (typeof modulatorTransformTypes)[keyof typeof modulatorTransformTypes];
