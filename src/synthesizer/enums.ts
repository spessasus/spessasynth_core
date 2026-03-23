export const interpolationTypes = {
    linear: 0,
    nearestNeighbor: 1,
    hermite: 2
} as const;
export type InterpolationType =
    (typeof interpolationTypes)[keyof typeof interpolationTypes];

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
    /**
     * Cents, RPN for fine-tuning
     */
    channelTuning: 0,
    /**
     * Cents, only the decimal tuning, (e.g., transpose is 4.5,
     * Then shift by 4 keys + tune by 50 cents)
     */
    channelTransposeFine: 1,
    /**
     * The MIDI specification assumes the default modulation depth is 50 cents,
     * but it may vary for different sound banks.
     * For example, if you want a modulation depth of 100 cents,
     * the multiplier will be 2,
     * which, for a preset with a depth of 50,
     * will create a total modulation depth of 100 cents.
     */
    modulationMultiplier: 2,
    /**
     * Cents, set by system exclusive
     */
    masterTuning: 3,
    /**
     * Semitones, for RPN coarse tuning
     */
    channelTuningSemitones: 4,
    /**
     * Key shift: for system exclusive
     */
    channelKeyShift: 5,
    /**
     * Sf2 NPRN LSB for selecting a generator value
     */
    sf2NPRNGeneratorLSB: 6
} as const;

export type CustomController =
    (typeof customControllers)[keyof typeof customControllers];
