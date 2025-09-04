/**
 * All SoundFont2 Generator enumerations.
 */
export const generatorTypes = {
    INVALID: -1, // Invalid generator
    startAddrsOffset: 0, // Sample control - moves sample start point
    endAddrOffset: 1, // Sample control - moves sample end point
    startloopAddrsOffset: 2, // Loop control - moves loop start point
    endloopAddrsOffset: 3, // Loop control - moves loop end point
    startAddrsCoarseOffset: 4, // Sample control - moves sample start point in 32,768 increments
    modLfoToPitch: 5, // Pitch modulation - modulation lfo pitch modulation in cents
    vibLfoToPitch: 6, // Pitch modulation - vibrato lfo pitch modulation in cents
    modEnvToPitch: 7, // Pitch modulation - modulation envelope pitch modulation in cents
    initialFilterFc: 8, // Filter - lowpass filter cutoff in cents
    initialFilterQ: 9, // Filter - lowpass filter resonance
    modLfoToFilterFc: 10, // Filter modulation - modulation lfo lowpass filter cutoff in cents
    modEnvToFilterFc: 11, // Filter modulation - modulation envelope lowpass filter cutoff in cents
    endAddrsCoarseOffset: 12, // Ample control - move sample end point in 32,768 increments
    modLfoToVolume: 13, // Modulation lfo - volume (tremolo), where 100 = 10dB
    unused1: 14, // Unused
    chorusEffectsSend: 15, // Effect send - how much is sent to chorus 0 - 1000
    reverbEffectsSend: 16, // Effect send - how much is sent to reverb 0 - 1000
    pan: 17, // Panning - where -500 = left, 0 = center, 500 = right
    unused2: 18, // Unused
    unused3: 19, // Unused
    unused4: 20, // Unused
    delayModLFO: 21, // Mod lfo - delay for mod lfo to start from zero
    freqModLFO: 22, // Mod lfo - frequency of mod lfo, 0 = 8.176 Hz, units: f => 1200log2(f/8.176)
    delayVibLFO: 23, // Vib lfo - delay for vibrato lfo to start from zero
    freqVibLFO: 24, // Vib lfo - frequency of vibrato lfo, 0 = 8.176Hz, unit: f => 1200log2(f/8.176)
    delayModEnv: 25, // Mod env - 0 = 1 s decay till mod env starts
    attackModEnv: 26, // Mod env - attack of mod env
    holdModEnv: 27, // Mod env - hold of mod env
    decayModEnv: 28, // Mod env - decay of mod env
    sustainModEnv: 29, // Mod env - sustain of mod env
    releaseModEnv: 30, // Mod env - release of mod env
    keyNumToModEnvHold: 31, // Mod env - also modulating mod envelope hold with key number
    keyNumToModEnvDecay: 32, // Mod env - also modulating mod envelope decay with key number
    delayVolEnv: 33, // Vol env - delay of envelope from zero (weird scale)
    attackVolEnv: 34, // Vol env - attack of envelope
    holdVolEnv: 35, // Vol env - hold of envelope
    decayVolEnv: 36, // Vol env - decay of envelope
    sustainVolEnv: 37, // Vol env - sustain of envelope
    releaseVolEnv: 38, // Vol env - release of envelope
    keyNumToVolEnvHold: 39, // Vol env - key number to volume envelope hold
    keyNumToVolEnvDecay: 40, // Vol env - key number to volume envelope decay
    instrument: 41, // Zone - instrument index to use for preset zone
    reserved1: 42, // Reserved
    keyRange: 43, // Zone - key range for which preset / instrument zone is active
    velRange: 44, // Zone - velocity range for which preset / instrument zone is active
    startloopAddrsCoarseOffset: 45, // Sample control - moves sample loop start point in 32,768 increments
    keyNum: 46, // Zone - instrument only: always use this midi number (ignore what's pressed)
    velocity: 47, // Zone - instrument only: always use this velocity (ignore what's pressed)
    initialAttenuation: 48, // Zone - allows turning down the volume, 10 = -1dB
    reserved2: 49, // Reserved
    endloopAddrsCoarseOffset: 50, // Sample control - moves sample loop end point in 32,768 increments
    coarseTune: 51, // Tune - pitch offset in semitones
    fineTune: 52, // Tune - pitch offset in cents
    sampleID: 53, // Sample - instrument zone only: which sample to use
    sampleModes: 54, // Sample - 0 = no loop, 1 = loop, 2 = start on release, 3 = loop and play till the end in release phase
    reserved3: 55, // Reserved
    scaleTuning: 56, // Sample - the degree to which MIDI key number influences pitch, 100 = default
    exclusiveClass: 57, // Sample - = cut = choke group
    overridingRootKey: 58, // Sample - can override the sample's original pitch
    unused5: 59, // Unused
    endOper: 60, // End marker

    // Additional generators that are used in system exclusives and will not be saved
    vibLfoToVolume: 61,
    vibLfoToFilterFc: 62
} as const;

export type GeneratorType =
    (typeof generatorTypes)[keyof typeof generatorTypes];

export const GENERATORS_AMOUNT = Object.keys(generatorTypes).length;
export const MAX_GENERATOR = Math.max(...Object.values(generatorTypes));
/**
 * Min: minimum value, max: maximum value, def: default value, nrpn: nrpn scale...
 */
const generatorLimits: {
    min: number;
    max: number;
    def: number;
    nrpn: number;
}[] = [];
// Offsets
generatorLimits[generatorTypes.startAddrsOffset] = {
    min: 0,
    max: 32768,
    def: 0,
    nrpn: 1
};
generatorLimits[generatorTypes.endAddrOffset] = {
    min: -32768,
    max: 32768,
    def: 0,
    nrpn: 1
};
generatorLimits[generatorTypes.startloopAddrsOffset] = {
    min: -32768,
    max: 32768,
    def: 0,
    nrpn: 1
};
generatorLimits[generatorTypes.endloopAddrsOffset] = {
    min: -32768,
    max: 32768,
    def: 0,
    nrpn: 1
};
generatorLimits[generatorTypes.startAddrsCoarseOffset] = {
    min: 0,
    max: 32768,
    def: 0,
    nrpn: 1
};

// Pitch influence
generatorLimits[generatorTypes.modLfoToPitch] = {
    min: -12000,
    max: 12000,
    def: 0,
    nrpn: 2
};
generatorLimits[generatorTypes.vibLfoToPitch] = {
    min: -12000,
    max: 12000,
    def: 0,
    nrpn: 2
};
generatorLimits[generatorTypes.modEnvToPitch] = {
    min: -12000,
    max: 12000,
    def: 0,
    nrpn: 2
};

// Lowpass
generatorLimits[generatorTypes.initialFilterFc] = {
    min: 1500,
    max: 13500,
    def: 13500,
    nrpn: 2
};
generatorLimits[generatorTypes.initialFilterQ] = {
    min: 0,
    max: 960,
    def: 0,
    nrpn: 1
};
generatorLimits[generatorTypes.modLfoToFilterFc] = {
    min: -12000,
    max: 12000,
    def: 0,
    nrpn: 2
};
generatorLimits[generatorTypes.vibLfoToFilterFc] = {
    min: -12000,
    max: 12000,
    def: 0,
    nrpn: 2
}; // NON-STANDARD
generatorLimits[generatorTypes.modEnvToFilterFc] = {
    min: -12000,
    max: 12000,
    def: 0,
    nrpn: 2
};

generatorLimits[generatorTypes.endAddrsCoarseOffset] = {
    min: -32768,
    max: 32768,
    def: 0,
    nrpn: 1
};

generatorLimits[generatorTypes.modLfoToVolume] = {
    min: -960,
    max: 960,
    def: 0,
    nrpn: 1
};
generatorLimits[generatorTypes.vibLfoToVolume] = {
    min: -960,
    max: 960,
    def: 0,
    nrpn: 1
}; // NON-STANDARD

// Effects, pan
generatorLimits[generatorTypes.chorusEffectsSend] = {
    min: 0,
    max: 1000,
    def: 0,
    nrpn: 1
};
generatorLimits[generatorTypes.reverbEffectsSend] = {
    min: 0,
    max: 1000,
    def: 0,
    nrpn: 1
};
generatorLimits[generatorTypes.pan] = { min: -500, max: 500, def: 0, nrpn: 1 };

// Lfo
generatorLimits[generatorTypes.delayModLFO] = {
    min: -12000,
    max: 5000,
    def: -12000,
    nrpn: 2
};
generatorLimits[generatorTypes.freqModLFO] = {
    min: -16000,
    max: 4500,
    def: 0,
    nrpn: 4
};
generatorLimits[generatorTypes.delayVibLFO] = {
    min: -12000,
    max: 5000,
    def: -12000,
    nrpn: 2
};
generatorLimits[generatorTypes.freqVibLFO] = {
    min: -16000,
    max: 4500,
    def: 0,
    nrpn: 4
};

// Mod env
generatorLimits[generatorTypes.delayModEnv] = {
    min: -32768,
    max: 5000,
    def: -32768,
    nrpn: 2
}; // -32,768 indicates instant phase,
// This is done to prevent click at the start of filter modenv
generatorLimits[generatorTypes.attackModEnv] = {
    min: -32768,
    max: 8000,
    def: -32768,
    nrpn: 2
};
generatorLimits[generatorTypes.holdModEnv] = {
    min: -12000,
    max: 5000,
    def: -12000,
    nrpn: 2
};
generatorLimits[generatorTypes.decayModEnv] = {
    min: -12000,
    max: 8000,
    def: -12000,
    nrpn: 2
};
generatorLimits[generatorTypes.sustainModEnv] = {
    min: 0,
    max: 1000,
    def: 0,
    nrpn: 1
};
generatorLimits[generatorTypes.releaseModEnv] = {
    min: -12000,
    max: 8000,
    def: -12000,
    nrpn: 2
};
// Key num to mod env
generatorLimits[generatorTypes.keyNumToModEnvHold] = {
    min: -1200,
    max: 1200,
    def: 0,
    nrpn: 1
};
generatorLimits[generatorTypes.keyNumToModEnvDecay] = {
    min: -1200,
    max: 1200,
    def: 0,
    nrpn: 1
};

// Vol env
generatorLimits[generatorTypes.delayVolEnv] = {
    min: -12000,
    max: 5000,
    def: -12000,
    nrpn: 2
};
generatorLimits[generatorTypes.attackVolEnv] = {
    min: -12000,
    max: 8000,
    def: -12000,
    nrpn: 2
};
generatorLimits[generatorTypes.holdVolEnv] = {
    min: -12000,
    max: 5000,
    def: -12000,
    nrpn: 2
};
generatorLimits[generatorTypes.decayVolEnv] = {
    min: -12000,
    max: 8000,
    def: -12000,
    nrpn: 2
};
generatorLimits[generatorTypes.sustainVolEnv] = {
    min: 0,
    max: 1440,
    def: 0,
    nrpn: 1
};
generatorLimits[generatorTypes.releaseVolEnv] = {
    min: -12000,
    max: 8000,
    def: -12000,
    nrpn: 2
};
// Key num to vol env
generatorLimits[generatorTypes.keyNumToVolEnvHold] = {
    min: -1200,
    max: 1200,
    def: 0,
    nrpn: 1
};
generatorLimits[generatorTypes.keyNumToVolEnvDecay] = {
    min: -1200,
    max: 1200,
    def: 0,
    nrpn: 1
};

generatorLimits[generatorTypes.startloopAddrsCoarseOffset] = {
    min: -32768,
    max: 32768,
    def: 0,
    nrpn: 1
};
generatorLimits[generatorTypes.keyNum] = {
    min: -1,
    max: 127,
    def: -1,
    nrpn: 1
};
generatorLimits[generatorTypes.velocity] = {
    min: -1,
    max: 127,
    def: -1,
    nrpn: 1
};

generatorLimits[generatorTypes.initialAttenuation] = {
    min: 0,
    max: 1440,
    def: 0,
    nrpn: 1
};

generatorLimits[generatorTypes.endloopAddrsCoarseOffset] = {
    min: -32768,
    max: 32768,
    def: 0,
    nrpn: 1
};

generatorLimits[generatorTypes.coarseTune] = {
    min: -120,
    max: 120,
    def: 0,
    nrpn: 1
};
generatorLimits[generatorTypes.fineTune] = {
    min: -12700,
    max: 12700,
    def: 0,
    nrpn: 1
}; // This generator is used as initial pitch, hence this range
generatorLimits[generatorTypes.scaleTuning] = {
    min: 0,
    max: 1200,
    def: 100,
    nrpn: 1
};
generatorLimits[generatorTypes.exclusiveClass] = {
    min: 0,
    max: 99999,
    def: 0,
    nrpn: 0
};
generatorLimits[generatorTypes.overridingRootKey] = {
    min: 0 - 1,
    max: 127,
    def: -1,
    nrpn: 0
};
generatorLimits[generatorTypes.sampleModes] = {
    min: 0,
    max: 3,
    def: 0,
    nrpn: 0
};
export { generatorLimits };
