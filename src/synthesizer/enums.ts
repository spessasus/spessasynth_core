export const interpolationTypes = {
    linear: 0,
    nearestNeighbor: 1,
    hermite: 2
} as const;
export type InterpolationType =
    (typeof interpolationTypes)[keyof typeof interpolationTypes];
// Types of synthesizer message displays.
export const synthDisplayTypes = {
    // This message type is used to display text on the SoundCanvas display.
    soundCanvasText: 0,
    // This message type is used to display text on a Yamaha XG synthesizer.
    yamahaXGText: 1,
    // This message type is used to display a dot matrix display (pixelated graphics) on a SoundCanvas synthesizer.
    soundCanvasDotMatrix: 2
} as const;
export type SynthDisplayType =
    (typeof synthDisplayTypes)[keyof typeof synthDisplayTypes];

// Data entry states for the MIDI data entry system.
// These states are used to track the current state of data entry for MIDI controllers.
export const dataEntryStates = {
    Idle: 0,
    RPCoarse: 1,
    RPFine: 2,
    NRPCoarse: 3,
    NRPFine: 4,
    DataCoarse: 5,
    DataFine: 6
} as const;

export type DataEntryState =
    (typeof dataEntryStates)[keyof typeof dataEntryStates];

export const customControllers = {
    channelTuning: 0, // Cents, RPN for fine tuning
    channelTransposeFine: 1, // Cents, only the decimal tuning, (e.g., transpose is 4.5,
    // Then shift by 4 keys + tune by 50 cents)
    modulationMultiplier: 2, // Cents, set by modulation depth RPN
    masterTuning: 3, // Cents, set by system exclusive
    channelTuningSemitones: 4, // Semitones, for RPN coarse tuning
    channelKeyShift: 5, // Key shift: for system exclusive
    sf2NPRNGeneratorLSB: 6 // Sf2 NPRN LSB for selecting a generator value
} as const;

export type CustomController =
    (typeof customControllers)[keyof typeof customControllers];
