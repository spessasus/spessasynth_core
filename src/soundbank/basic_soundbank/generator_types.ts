/**
 * @enum {number}
 */
export const generatorTypes = {
    INVALID: -1, // invalid generator
    startAddrsOffset: 0, // sample control - moves sample start point
    endAddrOffset: 1, // sample control - moves sample end point
    startloopAddrsOffset: 2, // loop control - moves loop start point
    endloopAddrsOffset: 3, // loop control - moves loop end point
    startAddrsCoarseOffset: 4, // sample control - moves sample start point in 32,768 increments
    modLfoToPitch: 5, // pitch modulation - modulation lfo pitch modulation in cents
    vibLfoToPitch: 6, // pitch modulation - vibrato lfo pitch modulation in cents
    modEnvToPitch: 7, // pitch modulation - modulation envelope pitch modulation in cents
    initialFilterFc: 8, // filter - lowpass filter cutoff in cents
    initialFilterQ: 9, // filter - lowpass filter resonance
    modLfoToFilterFc: 10, // filter modulation - modulation lfo lowpass filter cutoff in cents
    modEnvToFilterFc: 11, // filter modulation - modulation envelope lowpass filter cutoff in cents
    endAddrsCoarseOffset: 12, // ample control - move sample end point in 32,768 increments
    modLfoToVolume: 13, // modulation lfo - volume (tremolo), where 100 = 10dB
    unused1: 14, // unused
    chorusEffectsSend: 15, // effect send - how much is sent to chorus 0 - 1000
    reverbEffectsSend: 16, // effect send - how much is sent to reverb 0 - 1000
    pan: 17, // panning - where -500 = left, 0 = center, 500 = right
    unused2: 18, // unused
    unused3: 19, // unused
    unused4: 20, // unused
    delayModLFO: 21, // mod lfo - delay for mod lfo to start from zero
    freqModLFO: 22, // mod lfo - frequency of mod lfo, 0 = 8.176 Hz, units: f => 1200log2(f/8.176)
    delayVibLFO: 23, // vib lfo - delay for vibrato lfo to start from zero
    freqVibLFO: 24, // vib lfo - frequency of vibrato lfo, 0 = 8.176Hz, unit: f => 1200log2(f/8.176)
    delayModEnv: 25, // mod env - 0 = 1 s decay till mod env starts
    attackModEnv: 26, // mod env - attack of mod env
    holdModEnv: 27, // mod env - hold of mod env
    decayModEnv: 28, // mod env - decay of mod env
    sustainModEnv: 29, // mod env - sustain of mod env
    releaseModEnv: 30, // mod env - release of mod env
    keyNumToModEnvHold: 31, // mod env - also modulating mod envelope hold with key number
    keyNumToModEnvDecay: 32, // mod env - also modulating mod envelope decay with key number
    delayVolEnv: 33, // vol env - delay of envelope from zero (weird scale)
    attackVolEnv: 34, // vol env - attack of envelope
    holdVolEnv: 35, // vol env - hold of envelope
    decayVolEnv: 36, // vol env - decay of envelope
    sustainVolEnv: 37, // vol env - sustain of envelope
    releaseVolEnv: 38, // vol env - release of envelope
    keyNumToVolEnvHold: 39, // vol env - key number to volume envelope hold
    keyNumToVolEnvDecay: 40, // vol env - key number to volume envelope decay
    instrument: 41, // zone - instrument index to use for preset zone
    reserved1: 42, // reserved
    keyRange: 43, // zone - key range for which preset / instrument zone is active
    velRange: 44, // zone - velocity range for which preset / instrument zone is active
    startloopAddrsCoarseOffset: 45, // sample control - moves sample loop start point in 32,768 increments
    keyNum: 46, // zone - instrument only: always use this midi number (ignore what's pressed)
    velocity: 47, // zone - instrument only: always use this velocity (ignore what's pressed)
    initialAttenuation: 48, // zone - allows turning down the volume, 10 = -1dB
    reserved2: 49, // reserved
    endloopAddrsCoarseOffset: 50, // sample control - moves sample loop end point in 32,768 increments
    coarseTune: 51, // tune - pitch offset in semitones
    fineTune: 52, // tune - pitch offset in cents
    sampleID: 53, // sample - instrument zone only: which sample to use
    sampleModes: 54, // sample - 0 = no loop, 1 = loop, 2 = reserved, 3 = loop and play till the end in release phase
    reserved3: 55, // reserved
    scaleTuning: 56, // sample - the degree to which MIDI key number influences pitch, 100 = default
    exclusiveClass: 57, // sample - = cut = choke group
    overridingRootKey: 58, // sample - can override the sample's original pitch
    unused5: 59, // unused
    endOper: 60, // end marker

    // additional generators that are used in system exclusives and will not be saved
    vibLfoToVolume: 61,
    vibLfoToFilterFc: 62
} as const;

export type GeneratorType =
    (typeof generatorTypes)[keyof typeof generatorTypes];

export const GENERATORS_AMOUNT = Object.keys(generatorTypes).length;
export const MAX_GENERATOR = Math.max(...Object.values(generatorTypes));
/**
 * min: minimum value, max: maximum value, def: default value, nrpn: nrpn scale...
 */
const generatorLimits: {
    min: number;
    max: number;
    def: number;
    nrpn: number;
}[] = [];
// offsets
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

// pitch influence
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

// lowpass
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

// effects, pan
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

// lfo
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

// mod env
generatorLimits[generatorTypes.delayModEnv] = {
    min: -32768,
    max: 5000,
    def: -32768,
    nrpn: 2
}; // -32,768 indicates instant phase,
// this is done to prevent click at the start of filter modenv
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
    min: -7200,
    max: 8000,
    def: -12000,
    nrpn: 2
}; // min is set to -7200 to prevent lowpass clicks
// key num to mod env
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

// vol env
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
    min: -7200,
    max: 8000,
    def: -12000,
    nrpn: 2
}; // min is set to -7200 prevent clicks
// key num to vol env
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
}; // this generator is used as initial pitch, hence this range
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
