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
    // note: these are flipped unintentionally in DLS2 table 9. Argh!
    chorus: 0xdd,
    reverb: 0xdb,

    pitchWheelRange: 0x100,
    fineTune: 0x101,
    coarseTune: 0x102
} as const;

export type DLSSource = (typeof DLSSources)[keyof typeof DLSSources];

export const DLSDestinations = {
    none: 0x0, // no destination
    gain: 0x1, // linear gain
    reserved: 0x2, // reserved
    pitch: 0x3, // pitch in cents
    pan: 0x4, // pan 10ths of a percent
    keyNum: 0x5, // MIDI key number
    // nuh uh, the channel controllers are not supported!
    chorusSend: 0x80, // chorus send level 10ths of a percent
    reverbSend: 0x81, // reverb send level 10ths of a percent

    modLfoFreq: 0x104, // modulation LFO frequency
    modLfoDelay: 0x105, // modulation LFO delay

    vibLfoFreq: 0x114, // vibrato LFO frequency
    vibLfoDelay: 0x115, // vibrato LFO delay

    volEnvAttack: 0x206, // volume envelope attack
    volEnvDecay: 0x207, // volume envelope decay
    volEnvRelease: 0x209, // volume envelope release
    volEnvSustain: 0x20a, // volume envelope sustain
    volEnvDelay: 0x20b, // volume envelope delay
    volEnvHold: 0x20c, // volume envelope hold

    modEnvAttack: 0x30a, // modulation envelope attack
    modEnvDecay: 0x30b, // modulation envelope decay
    modEnvRelease: 0x30d, // modulation envelope release
    modEnvSustain: 0x30e, // modulation envelope sustain
    modEnvDelay: 0x30f, // modulation envelope delay
    modEnvHold: 0x310, // modulation envelope hold

    filterCutoff: 0x500, // low pass filter cutoff frequency
    filterQ: 0x501 // low pass filter resonance
} as const;

export type DLSDestination =
    (typeof DLSDestinations)[keyof typeof DLSDestinations];
