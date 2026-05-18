// Source curve type maps to a soundfont curve type in section 2.10, table 9
import type { ModulatorCurveType } from "../enums";

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

    pitchWheelRange: 0x1_00,
    fineTune: 0x1_01,
    coarseTune: 0x1_02
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

    modLfoFreq: 0x1_04, // Modulation LFO frequency
    modLfoDelay: 0x1_05, // Modulation LFO delay

    vibLfoFreq: 0x1_14, // Vibrato LFO frequency
    vibLfoDelay: 0x1_15, // Vibrato LFO delay

    volEnvAttack: 0x2_06, // Volume envelope attack
    volEnvDecay: 0x2_07, // Volume envelope decay
    reservedEG1: 0x2_08, // Reserved
    volEnvRelease: 0x2_09, // Volume envelope release
    volEnvSustain: 0x2_0a, // Volume envelope sustain
    volEnvDelay: 0x2_0b, // Volume envelope delay
    volEnvHold: 0x2_0c, // Volume envelope hold

    modEnvAttack: 0x3_0a, // Modulation envelope attack
    modEnvDecay: 0x3_0b, // Modulation envelope decay
    reservedEG2: 0x3_0c, // Reserved
    modEnvRelease: 0x3_0d, // Modulation envelope release
    modEnvSustain: 0x3_0e, // Modulation envelope sustain
    modEnvDelay: 0x3_0f, // Modulation envelope delay
    modEnvHold: 0x3_10, // Modulation envelope hold

    filterCutoff: 0x5_00, // Low pass filter cutoff frequency
    filterQ: 0x5_01 // Low pass filter resonance
} as const;
export type DLSDestination =
    (typeof DLSDestinations)[keyof typeof DLSDestinations];
export const DLSLoopTypes = {
    forward: 0x00_00,
    loopAndRelease: 0x00_01
} as const;
export type DLSLoopType = (typeof DLSLoopTypes)[keyof typeof DLSLoopTypes];
