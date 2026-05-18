// prettier-ignore
/**
 * All SoundFont2 Generator enumerations.
 */
export const GeneratorTypes = Object.freeze({
    invalid: -1,                     // Invalid generator
    startAddrsOffset: 0,             // Sample control - moves sample start point
    endAddrOffset: 1,                // Sample control - moves sample end point
    startloopAddrsOffset: 2,         // Loop control - moves loop start point
    endloopAddrsOffset: 3,           // Loop control - moves loop end point
    startAddrsCoarseOffset: 4,       // Sample control - moves sample start point in 32,768 increments
    modLfoToPitch: 5,                // Pitch modulation - modulation lfo pitch modulation in cents
    vibLfoToPitch: 6,                // Pitch modulation - vibrato lfo pitch modulation in cents
    modEnvToPitch: 7,                // Pitch modulation - modulation envelope pitch modulation in cents
    initialFilterFc: 8,              // Filter - lowpass filter cutoff in cents
    initialFilterQ: 9,               // Filter - lowpass filter resonance
    modLfoToFilterFc: 10,            // Filter modulation - modulation lfo lowpass filter cutoff in cents
    modEnvToFilterFc: 11,            // Filter modulation - modulation envelope lowpass filter cutoff in cents
    endAddrsCoarseOffset: 12,        // Sample control - move sample end point in 32,768 increments
    modLfoToVolume: 13,              // Modulation lfo - volume (tremolo), where 100 = 10dB
    // Unused1
    chorusEffectsSend: 15,           // Effect send - how much is sent to chorus 0 - 1000
    reverbEffectsSend: 16,           // Effect send - how much is sent to reverb 0 - 1000
    pan: 17,                         // Panning - where -500 = left, 0 = center, 500 = right
    // Unused2
    // Unused3
    // Unused4
    delayModLFO: 21,                 // Mod lfo - delay for mod lfo to start from zero
    freqModLFO: 22,                  // Mod lfo - frequency of mod lfo, 0 = 8.176 Hz, units: f => 1200log2(f/8.176)
    delayVibLFO: 23,                 // Vib lfo - delay for vibrato lfo to start from zero
    freqVibLFO: 24,                  // Vib lfo - frequency of vibrato lfo, 0 = 8.176Hz, unit: f => 1200log2(f/8.176)
    delayModEnv: 25,                 // Mod env - 0 = 1 s decay till mod env starts
    attackModEnv: 26,                // Mod env - attack of mod env
    holdModEnv: 27,                  // Mod env - hold of mod env
    decayModEnv: 28,                 // Mod env - decay of mod env
    sustainModEnv: 29,               // Mod env - sustain of mod env
    releaseModEnv: 30,               // Mod env - release of mod env
    keyNumToModEnvHold: 31,          // Mod env - also modulating mod envelope hold with key number
    keyNumToModEnvDecay: 32,         // Mod env - also modulating mod envelope decay with key number
    delayVolEnv: 33,                 // Vol env - delay of envelope from zero (weird scale)
    attackVolEnv: 34,                // Vol env - attack of envelope
    holdVolEnv: 35,                  // Vol env - hold of envelope
    decayVolEnv: 36,                 // Vol env - decay of envelope
    sustainVolEnv: 37,               // Vol env - sustain of envelope
    releaseVolEnv: 38,               // Vol env - release of envelope
    keyNumToVolEnvHold: 39,          // Vol env - key number to volume envelope hold
    keyNumToVolEnvDecay: 40,         // Vol env - key number to volume envelope decay
    instrument: 41,                  // Zone - instrument index to use for preset zone
    // Reserved1
    keyRange: 43,                    // Zone - key range for which preset / instrument zone is active
    velRange: 44,                    // Zone - velocity range for which preset / instrument zone is active
    startloopAddrsCoarseOffset: 45,  // Sample control - moves sample loop start point in 32,768 increments
    keyNum: 46,                      // Zone - instrument only: always use this midi number (ignore what's pressed)
    velocity: 47,                    // Zone - instrument only: always use this velocity (ignore what's pressed)
    initialAttenuation: 48,          // Zone - allows turning down the volume, 10 = -1dB
    // Reserved2
    endloopAddrsCoarseOffset: 50,    // Sample control - moves sample loop end point in 32,768 increments
    coarseTune: 51,                  // Tune - pitch offset in semitones
    fineTune: 52,                    // Tune - pitch offset in cents
    sampleID: 53,                    // Sample - instrument zone only: which sample to use
    sampleModes: 54,                 // Sample - 0 = no loop, 1 = loop, 2 = start on release, 3 = loop and play till the end in release phase
    // Reserved3
    scaleTuning: 56,                 // Sample - the degree to which MIDI key number influences pitch, 100 = default
    exclusiveClass: 57,              // Sample - = cut = choke group
    overridingRootKey: 58,           // Sample - can override the sample's original pitch
    // Unused5
    endOper: 60,                     // End marker

    // Additional generators that are used in system exclusives and will not be saved (controller matrix)

    // [-1000;1000] -> 1/10%
    amplitude: 61,
    // [-1000;1000] -> Hz/100
    vibLfoRate: 62,
    // [0;1000] -> 1/10%
    vibLfoAmplitudeDepth: 63,
    // Like modLfoToFilterFc
    vibLfoToFilterFc: 64,
    // [-1000;1000] -> Hz/100
    modLfoRate: 65,
    // [0;1000] -> 1/10%
    modLfoAmplitudeDepth: 66,

} as const);

export type GeneratorType =
    (typeof GeneratorTypes)[keyof typeof GeneratorTypes];

export const MAX_GENERATOR = Math.max(...Object.values(GeneratorTypes));
export const GENERATORS_AMOUNT = MAX_GENERATOR + 1;

interface GeneratorLimit {
    /**
     * Minimum value for this generator type.
     */
    min: number;
    /**
     * Maximum allowed value for this generator type.
     */
    max: number;
    /**
     * Default value for this generator type.
     */
    def: number;
    /**
     * SoundFont2 NRPN scale factor for this generator type.
     */
    nrpn: number;
}

/**
 * Min: minimum value, max: maximum value, def: default value, nrpn: nrpn scale
 */
// prettier-ignore
export const GeneratorLimits: Readonly<Record<GeneratorType, GeneratorLimit>> = Object.freeze({
    // Non-value generators
    [GeneratorTypes.invalid]:                     { min:       0, max:      0, def:       0, nrpn: 0},
    [GeneratorTypes.endOper]:                     { min:       0, max:      0, def:       0, nrpn: 0},
    [GeneratorTypes.instrument]:                  { min:       0, max:      0, def:       0, nrpn: 0},
    [GeneratorTypes.sampleID]:                    { min:       0, max:      0, def:       0, nrpn: 0},
    [GeneratorTypes.keyRange]:                    { min:       0, max:      0, def:       0, nrpn: 0},
    [GeneratorTypes.velRange]:                    { min:       0, max:      0, def:       0, nrpn: 0},

    // Offsets
    [GeneratorTypes.startAddrsOffset]:            { min:       0, max: 32_768, def:       0, nrpn: 1 },
    [GeneratorTypes.endAddrOffset]:               { min: -32_768, max: 32_768, def:       0, nrpn: 1 },
    [GeneratorTypes.startloopAddrsOffset]:        { min: -32_768, max: 32_768, def:       0, nrpn: 1 },
    [GeneratorTypes.endloopAddrsOffset]:          { min: -32_768, max: 32_768, def:       0, nrpn: 1 },
    [GeneratorTypes.startAddrsCoarseOffset]:      { min:       0, max: 32_768, def:       0, nrpn: 1 },

    // Pitch influence
    [GeneratorTypes.modLfoToPitch]:               { min: -12_000, max: 12_000, def:       0, nrpn: 2 },
    [GeneratorTypes.vibLfoToPitch]:               { min: -12_000, max: 12_000, def:       0, nrpn: 2 },
    [GeneratorTypes.modEnvToPitch]:               { min: -12_000, max: 12_000, def:       0, nrpn: 2 },

    // Lowpass
    [GeneratorTypes.initialFilterFc]:             { min:   1500,  max: 13_500, def:  13_500, nrpn: 2 },
    [GeneratorTypes.initialFilterQ]:              { min:       0, max:    960, def:       0, nrpn: 1 },
    [GeneratorTypes.modLfoToFilterFc]:            { min: -12_000, max: 12_000, def:       0, nrpn: 2 },
    [GeneratorTypes.modEnvToFilterFc]:            { min: -12_000, max: 12_000, def:       0, nrpn: 2 },

    [GeneratorTypes.endAddrsCoarseOffset]:        { min: -32_768, max: 32_768, def:       0, nrpn: 1 },

    // Volume modulation
    [GeneratorTypes.modLfoToVolume]:              { min:    -960, max:    960, def:       0, nrpn: 1 },

    // Effects / pan
    [GeneratorTypes.chorusEffectsSend]:           { min:       0, max:   1000, def:       0, nrpn: 1 },
    [GeneratorTypes.reverbEffectsSend]:           { min:       0, max:   1000, def:       0, nrpn: 1 },
    [GeneratorTypes.pan]:                         { min:    -500, max:    500, def:       0, nrpn: 1 },

    // LFO
    [GeneratorTypes.delayModLFO]:                 { min: -12_000, max:   5000, def: -12_000, nrpn: 2 },
    [GeneratorTypes.freqModLFO]:                  { min: -16_000, max:   4500, def:       0, nrpn: 4 },
    [GeneratorTypes.delayVibLFO]:                 { min: -12_000, max:   5000, def: -12_000, nrpn: 2 },
    [GeneratorTypes.freqVibLFO]:                  { min: -16_000, max:   4500, def:       0, nrpn: 4 },

    // Mod envelope
    [GeneratorTypes.delayModEnv]:                 { min: -32_768, max:   5000, def: -32_768, nrpn: 2 }, // -32768 = instant, this is done to prevent click for lowpass
    [GeneratorTypes.attackModEnv]:                { min: -32_768, max:   8000, def: -32_768, nrpn: 2 },
    [GeneratorTypes.holdModEnv]:                  { min: -12_000, max:   5000, def: -12_000, nrpn: 2 },
    [GeneratorTypes.decayModEnv]:                 { min: -12_000, max:   8000, def: -12_000, nrpn: 2 },
    [GeneratorTypes.sustainModEnv]:               { min:       0, max:   1000, def:       0, nrpn: 1 },
    [GeneratorTypes.releaseModEnv]:               { min: -12_000, max:   8000, def: -12_000, nrpn: 2 },
    [GeneratorTypes.keyNumToModEnvHold]:          { min:   -1200, max:   1200, def:       0, nrpn: 1 },
    [GeneratorTypes.keyNumToModEnvDecay]:         { min:   -1200, max:   1200, def:       0, nrpn: 1 },

    // Volume envelope
    [GeneratorTypes.delayVolEnv]:                 { min: -12_000, max:   5000, def: -12_000, nrpn: 2 },
    [GeneratorTypes.attackVolEnv]:                { min: -12_000, max:   8000, def: -12_000, nrpn: 2 },
    [GeneratorTypes.holdVolEnv]:                  { min: -12_000, max:   5000, def: -12_000, nrpn: 2 },
    [GeneratorTypes.decayVolEnv]:                 { min: -12_000, max:   8000, def: -12_000, nrpn: 2 },
    [GeneratorTypes.sustainVolEnv]:               { min:       0, max:   1440, def:       0, nrpn: 1 },
    [GeneratorTypes.releaseVolEnv]:               { min: -12_000, max:   8000, def: -12_000, nrpn: 2 },
    [GeneratorTypes.keyNumToVolEnvHold]:          { min:   -1200, max:   1200, def:       0, nrpn: 1 },
    [GeneratorTypes.keyNumToVolEnvDecay]:         { min:   -1200, max:   1200, def:       0, nrpn: 1 },

    // Misc
    [GeneratorTypes.startloopAddrsCoarseOffset]:  { min: -32_768, max: 32_768, def:       0, nrpn: 1 },
    [GeneratorTypes.keyNum]:                      { min:      -1, max:    127, def:      -1, nrpn: 1 },
    [GeneratorTypes.velocity]:                    { min:      -1, max:    127, def:      -1, nrpn: 1 },
    [GeneratorTypes.initialAttenuation]:          { min:       0, max:   1440, def:       0, nrpn: 1 },
    [GeneratorTypes.endloopAddrsCoarseOffset]:    { min: -32_768, max: 32_768, def:       0, nrpn: 1 },
    [GeneratorTypes.coarseTune]:                  { min:    -120, max:    120, def:       0, nrpn: 1 },
    [GeneratorTypes.fineTune]:                    { min: -12_700, max: 12_700, def:       0, nrpn: 1 },
    [GeneratorTypes.scaleTuning]:                 { min:       0, max:   1200, def:     100, nrpn: 1 },
    [GeneratorTypes.exclusiveClass]:              { min:       0, max: 99_999, def:       0, nrpn: 0 },
    [GeneratorTypes.overridingRootKey]:           { min:      -1, max:    127, def:      -1, nrpn: 0 },
    [GeneratorTypes.sampleModes]:                 { min:       0, max:      3, def:       0, nrpn: 0 },

    // Non-standard
    [GeneratorTypes.amplitude]:                   { min:   -1000, max:   1000, def:       0, nrpn: 1 },
    [GeneratorTypes.vibLfoRate]:                  { min:   -1000, max:   1000, def:       0, nrpn: 1 },
    [GeneratorTypes.vibLfoToFilterFc]:            { min: -12_000, max: 12_000, def:       0, nrpn: 2 },
    [GeneratorTypes.vibLfoAmplitudeDepth]:        { min:       0, max:   1000, def:       0, nrpn: 1 },
    [GeneratorTypes.modLfoRate]:                  { min:   -1000, max:   1000, def:       0, nrpn: 1 },
    [GeneratorTypes.modLfoAmplitudeDepth]:        { min:       0, max:   1000, def:       0, nrpn: 1 },
});
