export * from "./basic_soundbank/generator_types";
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

export type SampleType = (typeof sampleTypes)[keyof typeof sampleTypes];

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

export type ModulatorSourceEnum =
    (typeof modulatorSources)[keyof typeof modulatorSources];

export const modulatorCurveTypes = {
    linear: 0,
    concave: 1,
    convex: 2,
    switch: 3
} as const;

export type ModulatorCurveType =
    (typeof modulatorCurveTypes)[keyof typeof modulatorCurveTypes];

export const modulatorTransformTypes = {
    linear: 0,
    absolute: 2
} as const;

export type ModulatorTransformType =
    (typeof modulatorTransformTypes)[keyof typeof modulatorTransformTypes];

// Source curve type maps to a soundfont curve type in section 2.10, table 9
export type DLSTransform = ModulatorCurveType;

export const DLSSources = {
    none: 0x0,
    modLfo: 0x1,
    velocity: 0x2,
    keyNum: 0x3,
    volEnv: 0x4,
    modEnv: 0x5,
    pitchWheel: 0x6,
    polyPressure: 0x7,
    channelPressure: 0x8,
    vibratoLfo: 0x9,

    modulationWheel: 0x81,
    volume: 0x87,
    pan: 0x8a,
    expression: 0x8b,
    // Note: these are flipped unintentionally in DLS2 table 9. Argh!
    chorus: 0xdd,
    reverb: 0xdb,

    pitchWheelRange: 0x100,
    fineTune: 0x101,
    coarseTune: 0x102
} as const;

export type DLSSource = (typeof DLSSources)[keyof typeof DLSSources];

export const DLSDestinations = {
    none: 0x0, // No destination
    gain: 0x1, // Linear gain
    reserved: 0x2, // Reserved
    pitch: 0x3, // Pitch in cents
    pan: 0x4, // Pan 10ths of a percent
    keyNum: 0x5, // MIDI key number
    // Nuh uh, the channel controllers are not supported!
    chorusSend: 0x80, // Chorus send level 10ths of a percent
    reverbSend: 0x81, // Reverb send level 10ths of a percent

    modLfoFreq: 0x104, // Modulation LFO frequency
    modLfoDelay: 0x105, // Modulation LFO delay

    vibLfoFreq: 0x114, // Vibrato LFO frequency
    vibLfoDelay: 0x115, // Vibrato LFO delay

    volEnvAttack: 0x206, // Volume envelope attack
    volEnvDecay: 0x207, // Volume envelope decay
    reservedEG1: 0x208, // Reserved
    volEnvRelease: 0x209, // Volume envelope release
    volEnvSustain: 0x20a, // Volume envelope sustain
    volEnvDelay: 0x20b, // Volume envelope delay
    volEnvHold: 0x20c, // Volume envelope hold

    modEnvAttack: 0x30a, // Modulation envelope attack
    modEnvDecay: 0x30b, // Modulation envelope decay
    reservedEG2: 0x30c, // Reserved
    modEnvRelease: 0x30d, // Modulation envelope release
    modEnvSustain: 0x30e, // Modulation envelope sustain
    modEnvDelay: 0x30f, // Modulation envelope delay
    modEnvHold: 0x310, // Modulation envelope hold

    filterCutoff: 0x500, // Low pass filter cutoff frequency
    filterQ: 0x501 // Low pass filter resonance
} as const;

export type DLSDestination =
    (typeof DLSDestinations)[keyof typeof DLSDestinations];

export const DLSLoopTypes = {
    forward: 0x0000,
    loopAndRelease: 0x0001
} as const;

export type DLSLoopType = (typeof DLSLoopTypes)[keyof typeof DLSLoopTypes];
