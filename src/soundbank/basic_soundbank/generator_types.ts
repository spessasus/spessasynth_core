// prettier-ignore
/**
 * All SoundFont2 Generator enumerations.
 *
 * Also see [Generator Types](../../../docs/extra/generator-types.md).
 *
 * @group Sound Banks.Generators
 */
export const GeneratorTypes = Object.freeze({
    invalid: -1, // Invalid generator
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
    endAddrsCoarseOffset: 12, // Sample control - move sample end point in 32,768 increments
    modLfoToVolume: 13, // Modulation lfo - volume (tremolo), where 100 = 10dB
    // Unused1
    chorusEffectsSend: 15, // Effect send - how much is sent to chorus 0 - 1000
    reverbEffectsSend: 16, // Effect send - how much is sent to reverb 0 - 1000
    pan: 17, // Panning - where -500 = left, 0 = center, 500 = right
    // Unused2
    // Unused3
    // Unused4
    delayModLFO: 21, // Mod lfo - delay for mod lfo to start from zero
    freqModLFO: 22, // Mod lfo - frequency of mod lfo, 0 = 8.176 Hz, units: f => 1200log2(f/8.176)
    delayVibLFO: 23, // Vib lfo - delay for vibrato lfo to start from zero
    freqVibLFO: 24, // Vib lfo - frequency of vibrato lfo, 0 = 8.176Hz, unit: f => 1200log2(f/8.176)
    delayModEnv: 25, // Mod env - 0 = 1 s delay till mod env starts
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
    // Reserved1
    keyRange: 43, // Zone - key range for which preset / instrument zone is active
    velRange: 44, // Zone - velocity range for which preset / instrument zone is active
    startloopAddrsCoarseOffset: 45, // Sample control - moves sample loop start point in 32,768 increments
    keyNum: 46, // Zone - instrument only: always use this midi number (ignore what's pressed)
    velocity: 47, // Zone - instrument only: always use this velocity (ignore what's pressed)
    initialAttenuation: 48, // Zone - allows turning down the volume, 10 = -1dB
    // Reserved2
    endloopAddrsCoarseOffset: 50, // Sample control - moves sample loop end point in 32,768 increments
    coarseTune: 51, // Tune - pitch offset in semitones
    fineTune: 52, // Tune - pitch offset in cents
    sampleID: 53, // Sample - instrument zone only: which sample to use
    sampleModes: 54, // Sample - 0 = no loop, 1 = loop, 2 = start on release, 3 = loop and play till the end in release phase, 4 = alternating loop (SFe)
    // Reserved3
    scaleTuning: 56, // Sample - the degree to which MIDI key number influences pitch, 100 = default
    exclusiveClass: 57, // Sample - = cut = choke group
    overridingRootKey: 58, // Sample - can override the sample's original pitch
    // Unused5
    endOper: 60, // End marker

    // SFe generators, only read from and written to SFe banks.
    // The order follows SF2: filter, LFOs (mod before vib), envelopes, then the voice.

    // 0 = lowpass, 1 = highpass, 2 = bandpass, 3 = peak, 4 = notch
    filterType: 61,
    // Absolute cents, the cutoff can not go above this. 13500 = no ceiling
    maxFilterFc: 62,
    // Centibels, added to the resonance after initialFilterQ is clamped. Negative values go below SF2's minimum Q
    filterQOffset: 63,
    // Like modLfoToFilterFc
    vibLfoToFilterFc: 64,
    // Like modLfoToVolume
    vibLfoToVolume: 65,
    // [-1000;1000] -> 1/10%, linear amplitude modulation
    modLfoToAmplitude: 66,
    // [-1000;1000] -> 1/10%, linear amplitude modulation
    vibLfoToAmplitude: 67,
    // Timecents, mod LFO depth ramps in after its delay. -32768 = no fade
    fadeModLFO: 68,
    // Timecents, vibrato LFO depth ramps in after its delay. -32768 = no fade
    fadeVibLFO: 69,
    // 0 = triangle, 1 = sawtooth, 2 = sine, 3 = square
    modLfoWaveform: 70,
    // 0 = triangle, 1 = sawtooth, 2 = sine, 3 = square
    vibLfoWaveform: 71,
    // Degrees, added to the start phase of the mod LFO
    modLfoStartPhase: 72,
    // Degrees, added to the start phase of the vibrato LFO
    vibLfoStartPhase: 73,
    // Second modulation envelope, like the first one
    modEnv2ToPitch: 74,
    modEnv2ToFilterFc: 75,
    delayModEnv2: 76,
    attackModEnv2: 77,
    holdModEnv2: 78,
    decayModEnv2: 79,
    sustainModEnv2: 80,
    releaseModEnv2: 81,
    keyNumToModEnv2Hold: 82,
    keyNumToModEnv2Decay: 83,
    // Timecents for 100dB, the second decay segment from sustain to sustain + sustain2VolEnv
    decay2VolEnv: 84,
    // Centibels, relative to sustainVolEnv. 0 = no second decay segment
    sustain2VolEnv: 85,
    // Centibels, positive = louder
    gain: 86,
    // Timecents, the voice starts this late (sample, envelopes and LFOs). -32768 = no delay
    delayVoice: 87,
    // 0 = release on note off, 1 = ignore note off (the voice plays until its envelope or sample ends)
    ignoreNoteOff: 88,
    // Effect send - how much is sent to the variation effect (GS delay, XG variation) 0 - 1000
    variationEffectsSend: 89
} as const);

/**
 * @inheritDoc GeneratorTypes
 *
 * @group Sound Banks.Generators
 */
export type GeneratorType =
    (typeof GeneratorTypes)[keyof typeof GeneratorTypes];

/**
 * The highest generator type number, including the non-standard generators.
 *
 * @group Sound Banks.Generators
 */
export const MAX_GENERATOR = Math.max(...Object.values(GeneratorTypes));

/**
 * The amount of generator types, including the non-standard generators.
 * Useful for allocating arrays indexed by {@link GeneratorType}.
 *
 * @group Sound Banks.Generators
 */
export const GENERATORS_AMOUNT = MAX_GENERATOR + 1;

/**
 * Generators that are only valid at the instrument level.
 * SF2 2.04 section 8.1.2 says that they must be ignored in preset zones.
 * @internal
 */
export const INSTRUMENT_ONLY_GENERATORS: ReadonlySet<GeneratorType> = new Set([
    GeneratorTypes.startAddrsOffset,
    GeneratorTypes.endAddrOffset,
    GeneratorTypes.startloopAddrsOffset,
    GeneratorTypes.endloopAddrsOffset,
    GeneratorTypes.startAddrsCoarseOffset,
    GeneratorTypes.endAddrsCoarseOffset,
    GeneratorTypes.startloopAddrsCoarseOffset,
    GeneratorTypes.endloopAddrsCoarseOffset,
    GeneratorTypes.keyNum,
    GeneratorTypes.velocity,
    GeneratorTypes.sampleModes,
    GeneratorTypes.exclusiveClass,
    GeneratorTypes.overridingRootKey,
    GeneratorTypes.ignoreNoteOff,
    GeneratorTypes.vibLfoWaveform,
    GeneratorTypes.modLfoWaveform,
    GeneratorTypes.filterType
]);

/**
 * The SFe generators whose values are a set of choices.
 * A stored value outside the defined ones (from a later version) counts as the default.
 * @internal
 */
export const ENUMERATED_GENERATORS: readonly GeneratorType[] = [
    GeneratorTypes.filterType,
    GeneratorTypes.modLfoWaveform,
    GeneratorTypes.vibLfoWaveform,
    GeneratorTypes.ignoreNoteOff
];

/**
 * Represents a single generator's range and default value.
 *
 * @group Sound Banks.Generators
 */
export interface GeneratorLimit {
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
 * Limits and defaults for all the {@link BasicSoundBank} generator types.
 *
 * @group Sound Banks.Generators
 */
// prettier-ignore
export const GeneratorLimits: Readonly<Record<GeneratorType, GeneratorLimit>> =
    Object.freeze({
        // Non-value generators
        [GeneratorTypes.invalid]: { min: 0, max: 0, def: 0, nrpn: 0 },
        [GeneratorTypes.endOper]: { min: 0, max: 0, def: 0, nrpn: 0 },
        [GeneratorTypes.instrument]: { min: 0, max: 0, def: 0, nrpn: 0 },
        [GeneratorTypes.sampleID]: { min: 0, max: 0, def: 0, nrpn: 0 },
        [GeneratorTypes.keyRange]: { min: 0, max: 0, def: 0, nrpn: 0 },
        [GeneratorTypes.velRange]: { min: 0, max: 0, def: 0, nrpn: 0 },

        // Offsets
        [GeneratorTypes.startAddrsOffset]: {
            min: 0,
            max: 32_768,
            def: 0,
            nrpn: 1
        },
        [GeneratorTypes.endAddrOffset]: {
            min: -32_768,
            max: 32_768,
            def: 0,
            nrpn: 1
        },
        [GeneratorTypes.startloopAddrsOffset]: {
            min: -32_768,
            max: 32_768,
            def: 0,
            nrpn: 1
        },
        [GeneratorTypes.endloopAddrsOffset]: {
            min: -32_768,
            max: 32_768,
            def: 0,
            nrpn: 1
        },
        [GeneratorTypes.startAddrsCoarseOffset]: {
            min: 0,
            max: 32_768,
            def: 0,
            nrpn: 1
        },

        // Pitch influence
        [GeneratorTypes.modLfoToPitch]: {
            min: -12_000,
            max: 12_000,
            def: 0,
            nrpn: 2
        },
        [GeneratorTypes.vibLfoToPitch]: {
            min: -12_000,
            max: 12_000,
            def: 0,
            nrpn: 2
        },
        [GeneratorTypes.modEnvToPitch]: {
            min: -12_000,
            max: 12_000,
            def: 0,
            nrpn: 2
        },

        // Lowpass
        [GeneratorTypes.initialFilterFc]: {
            min: 1500,
            max: 13_500,
            def: 13_500,
            nrpn: 2
        },
        [GeneratorTypes.initialFilterQ]: { min: 0, max: 960, def: 0, nrpn: 1 },
        [GeneratorTypes.modLfoToFilterFc]: {
            min: -12_000,
            max: 12_000,
            def: 0,
            nrpn: 2
        },
        [GeneratorTypes.modEnvToFilterFc]: {
            min: -12_000,
            max: 12_000,
            def: 0,
            nrpn: 2
        },

        [GeneratorTypes.endAddrsCoarseOffset]: {
            min: -32_768,
            max: 32_768,
            def: 0,
            nrpn: 1
        },

        // Volume modulation
        [GeneratorTypes.modLfoToVolume]: {
            min: -960,
            max: 960,
            def: 0,
            nrpn: 1
        },

        // Effects / pan
        [GeneratorTypes.chorusEffectsSend]: {
            min: 0,
            max: 1000,
            def: 0,
            nrpn: 1
        },
        [GeneratorTypes.reverbEffectsSend]: {
            min: 0,
            max: 1000,
            def: 0,
            nrpn: 1
        },
        [GeneratorTypes.pan]: { min: -500, max: 500, def: 0, nrpn: 1 },

        // LFO
        [GeneratorTypes.delayModLFO]: {
            min: -32_768,
            max: 5000,
            def: -12_000,
            nrpn: 2
        },
        [GeneratorTypes.freqModLFO]: {
            min: -16_000,
            max: 4500,
            def: 0,
            nrpn: 4
        },
        [GeneratorTypes.delayVibLFO]: {
            min: -32_768,
            max: 5000,
            def: -12_000,
            nrpn: 2
        },
        [GeneratorTypes.freqVibLFO]: {
            min: -16_000,
            max: 4500,
            def: 0,
            nrpn: 4
        },

        // Mod envelope
        [GeneratorTypes.delayModEnv]: {
            min: -32_768,
            max: 5000,
            def: -32_768,
            nrpn: 2
        }, // -32768 = instant, this is done to prevent click for lowpass
        [GeneratorTypes.attackModEnv]: {
            min: -32_768,
            max: 8000,
            def: -32_768,
            nrpn: 2
        },
        [GeneratorTypes.holdModEnv]: {
            min: -32_768,
            max: 5000,
            def: -12_000,
            nrpn: 2
        },
        [GeneratorTypes.decayModEnv]: {
            min: -12_000,
            max: 8000,
            def: -12_000,
            nrpn: 2
        },
        [GeneratorTypes.sustainModEnv]: { min: 0, max: 1000, def: 0, nrpn: 1 },
        [GeneratorTypes.releaseModEnv]: {
            min: -12_000,
            max: 8000,
            def: -12_000,
            nrpn: 2
        },
        [GeneratorTypes.keyNumToModEnvHold]: {
            min: -1200,
            max: 1200,
            def: 0,
            nrpn: 1
        },
        [GeneratorTypes.keyNumToModEnvDecay]: {
            min: -1200,
            max: 1200,
            def: 0,
            nrpn: 1
        },

        // Volume envelope
        [GeneratorTypes.delayVolEnv]: {
            min: -32_768,
            max: 5000,
            def: -12_000,
            nrpn: 2
        },
        [GeneratorTypes.attackVolEnv]: {
            min: -32_768,
            max: 8000,
            def: -12_000,
            nrpn: 2
        },
        [GeneratorTypes.holdVolEnv]: {
            min: -32_768,
            max: 5000,
            def: -12_000,
            nrpn: 2
        },
        [GeneratorTypes.decayVolEnv]: {
            min: -12_000,
            max: 8000,
            def: -12_000,
            nrpn: 2
        },
        [GeneratorTypes.sustainVolEnv]: { min: 0, max: 1440, def: 0, nrpn: 1 },
        [GeneratorTypes.releaseVolEnv]: {
            min: -12_000,
            max: 8000,
            def: -12_000,
            nrpn: 2
        },
        [GeneratorTypes.keyNumToVolEnvHold]: {
            min: -1200,
            max: 1200,
            def: 0,
            nrpn: 1
        },
        [GeneratorTypes.keyNumToVolEnvDecay]: {
            min: -1200,
            max: 1200,
            def: 0,
            nrpn: 1
        },

        // Misc
        [GeneratorTypes.startloopAddrsCoarseOffset]: {
            min: -32_768,
            max: 32_768,
            def: 0,
            nrpn: 1
        },
        [GeneratorTypes.keyNum]: { min: -1, max: 127, def: -1, nrpn: 1 },
        [GeneratorTypes.velocity]: { min: -1, max: 127, def: -1, nrpn: 1 },
        [GeneratorTypes.initialAttenuation]: {
            min: 0,
            max: 1440,
            def: 0,
            nrpn: 1
        },
        [GeneratorTypes.endloopAddrsCoarseOffset]: {
            min: -32_768,
            max: 32_768,
            def: 0,
            nrpn: 1
        },
        [GeneratorTypes.coarseTune]: { min: -120, max: 120, def: 0, nrpn: 1 },
        [GeneratorTypes.fineTune]: {
            min: -12_700,
            max: 12_700,
            def: 0,
            nrpn: 1
        },
        [GeneratorTypes.scaleTuning]: { min: 0, max: 1200, def: 100, nrpn: 1 },
        [GeneratorTypes.exclusiveClass]: {
            min: 0,
            max: 32_767,
            def: 0,
            nrpn: 0
        },
        [GeneratorTypes.overridingRootKey]: {
            min: -1,
            max: 127,
            def: -1,
            nrpn: 0
        },
        [GeneratorTypes.sampleModes]: { min: 0, max: 4, def: 0, nrpn: 0 },

        // SFe
        [GeneratorTypes.filterType]: { min: 0, max: 4, def: 0, nrpn: 0 },
        [GeneratorTypes.vibLfoToFilterFc]: {
            min: -12_000,
            max: 12_000,
            def: 0,
            nrpn: 2
        },
        [GeneratorTypes.vibLfoToVolume]: {
            min: -960,
            max: 960,
            def: 0,
            nrpn: 1
        },
        [GeneratorTypes.modLfoToAmplitude]: {
            min: -1000,
            max: 1000,
            def: 0,
            nrpn: 1
        },
        [GeneratorTypes.vibLfoToAmplitude]: {
            min: -1000,
            max: 1000,
            def: 0,
            nrpn: 1
        },
        [GeneratorTypes.gain]: { min: -1440, max: 1440, def: 0, nrpn: 1 },
        [GeneratorTypes.ignoreNoteOff]: { min: 0, max: 1, def: 0, nrpn: 0 },
        [GeneratorTypes.variationEffectsSend]: {
            min: 0,
            max: 1000,
            def: 0,
            nrpn: 1
        },
        [GeneratorTypes.delayVoice]: {
            min: -32_768,
            max: 5000,
            def: -32_768,
            nrpn: 2
        },
        [GeneratorTypes.fadeVibLFO]: {
            min: -32_768,
            max: 5000,
            def: -32_768,
            nrpn: 2
        },
        [GeneratorTypes.fadeModLFO]: {
            min: -32_768,
            max: 5000,
            def: -32_768,
            nrpn: 2
        },
        [GeneratorTypes.vibLfoWaveform]: { min: 0, max: 3, def: 0, nrpn: 0 },
        [GeneratorTypes.modLfoWaveform]: { min: 0, max: 3, def: 0, nrpn: 0 },
        [GeneratorTypes.vibLfoStartPhase]: { min: 0, max: 360, def: 0, nrpn: 1 },
        [GeneratorTypes.modLfoStartPhase]: { min: 0, max: 360, def: 0, nrpn: 1 },
        [GeneratorTypes.filterQOffset]: {
            min: -960,
            max: 960,
            def: 0,
            nrpn: 1
        },
        [GeneratorTypes.maxFilterFc]: {
            min: 1500,
            max: 13_500,
            def: 13_500,
            nrpn: 2
        },
        [GeneratorTypes.decay2VolEnv]: {
            min: -12_000,
            max: 8000,
            def: -12_000,
            nrpn: 2
        },
        [GeneratorTypes.sustain2VolEnv]: {
            min: -1440,
            max: 1440,
            def: 0,
            nrpn: 1
        },
        [GeneratorTypes.delayModEnv2]: {
            min: -32_768,
            max: 5000,
            def: -32_768,
            nrpn: 2
        },
        [GeneratorTypes.attackModEnv2]: {
            min: -32_768,
            max: 8000,
            def: -32_768,
            nrpn: 2
        },
        [GeneratorTypes.holdModEnv2]: {
            min: -32_768,
            max: 5000,
            def: -32_768,
            nrpn: 2
        },
        [GeneratorTypes.decayModEnv2]: {
            min: -12_000,
            max: 8000,
            def: -12_000,
            nrpn: 2
        },
        [GeneratorTypes.sustainModEnv2]: { min: 0, max: 1000, def: 0, nrpn: 1 },
        [GeneratorTypes.releaseModEnv2]: {
            min: -12_000,
            max: 8000,
            def: -12_000,
            nrpn: 2
        },
        [GeneratorTypes.keyNumToModEnv2Hold]: {
            min: -1200,
            max: 1200,
            def: 0,
            nrpn: 1
        },
        [GeneratorTypes.keyNumToModEnv2Decay]: {
            min: -1200,
            max: 1200,
            def: 0,
            nrpn: 1
        },
        [GeneratorTypes.modEnv2ToPitch]: {
            min: -12_000,
            max: 12_000,
            def: 0,
            nrpn: 2
        },
        [GeneratorTypes.modEnv2ToFilterFc]: {
            min: -12_000,
            max: 12_000,
            def: 0,
            nrpn: 2
        }
    });
