/**
 * A single point of a tracker instrument envelope.
 */
export interface TrackerEnvelopePoint {
    /**
     * The position of the point, in ticks.
     */
    tick: number;
    /**
     * The value of the point (0-64).
     */
    value: number;
}

/**
 * A volume or panning envelope of a tracker instrument.
 */
export interface TrackerEnvelope {
    /**
     * If the envelope is enabled.
     */
    enabled: boolean;
    /**
     * The points of the envelope.
     */
    points: TrackerEnvelopePoint[];
    /**
     * The sustain point index (the sustain loop end), -1 if there is no sustain.
     */
    sustainPoint: number;
    /**
     * The sustain loop start point index, -1 if there is no sustain.
     * Equal to the sustain point for the formats with a single sustain point.
     */
    sustainStart: number;
    /**
     * The loop start point index, -1 if there is no loop.
     */
    loopStart: number;
    /**
     * The loop end point index, -1 if there is no loop.
     */
    loopEnd: number;
    /**
     * If a new note continues the envelope from where the previous note left it (Impulse Tracker envelope carry).
     */
    carry?: boolean;
}

/**
 * The loop modes of a tracker sample.
 */
export const TrackerLoopTypes = {
    none: 0,
    forward: 1,
    pingPong: 2
} as const;

export type TrackerLoopType =
    (typeof TrackerLoopTypes)[keyof typeof TrackerLoopTypes];

/**
 * The ways a sample can be played, each one is a separate preset in the sound bank.
 */
export const TrackerSampleVariants = {
    /**
     * Uses the sustain loop if the sample has one, otherwise the regular loop.
     */
    normal: 0,
    /**
     * The sample after its sustain loop has been released, with the regular loop.
     */
    release: 1,
    /**
     * Reversed playback.
     */
    reverse: 2
} as const;

export type TrackerSampleVariant =
    (typeof TrackerSampleVariants)[keyof typeof TrackerSampleVariants];

/**
 * A sample of a tracker module, already decoded to floating point PCM.
 */
export interface TrackerSample {
    name: string;
    /**
     * The decoded PCM audio data. The left channel of stereo samples.
     */
    data: Float32Array;
    /**
     * The right channel of a stereo sample, undefined for mono samples.
     */
    rightData?: Float32Array;
    /**
     * The loop type of the sample.
     */
    loopType: TrackerLoopType;
    /**
     * The loop start, in sample points.
     */
    loopStart: number;
    /**
     * The loop end (exclusive), in sample points.
     */
    loopEnd: number;
    /**
     * The sustain loop type, played while the key is held. Undefined if the format has no sustain loops.
     */
    sustainLoopType?: TrackerLoopType;
    /**
     * The sustain loop start, in sample points.
     */
    sustainLoopStart?: number;
    /**
     * The sustain loop end (exclusive), in sample points.
     */
    sustainLoopEnd?: number;
    /**
     * The default volume (0-64).
     */
    volume: number;
    /**
     * The default panning (0-255), -1 if the sample does not override the channel panning.
     */
    panning: number;
    /**
     * The fine-tuning of the sample. Its unit is specific to the module format:
     * 1/8 semitone (MOD), 1/128 semitone (XM) or the middle C rate in Hertz (S3M).
     */
    finetune: number;
    /**
     * The relative note of the sample, in semitones.
     */
    relativeNote: number;
    /**
     * The playback rate (in Hertz) for the middle C note.
     * Used as the sound bank sample rate.
     */
    middleCRate: number;
    /**
     * The automatic vibrato waveform.
     */
    vibratoType: number;
    /**
     * The automatic vibrato sweep, in ticks.
     */
    vibratoSweep: number;
    /**
     * The automatic vibrato depth.
     */
    vibratoDepth: number;
    /**
     * The automatic vibrato rate.
     */
    vibratoRate: number;
}

/**
 * An instrument of a tracker module.
 * Formats without instruments use one instrument per sample.
 */
export interface TrackerInstrument {
    name: string;
    /**
     * Maps a zero-based note number to the index of the sample in the module, -1 means no sample.
     */
    sampleMap: Int16Array;
    volumeEnvelope: TrackerEnvelope;
    panningEnvelope: TrackerEnvelope;
    /**
     * The volume fadeout speed after key off, in 1/65,536 per tick.
     */
    fadeout: number;
}

/**
 * A sample of an Impulse Tracker module.
 */
export interface ImpulseTrackerSample extends TrackerSample {
    /**
     * The sample global volume (0-64).
     */
    globalVolume: number;
}

/**
 * An instrument of an Impulse Tracker module.
 */
export interface ImpulseTrackerInstrument extends TrackerInstrument {
    /**
     * Maps a zero-based note to the zero-based note to play.
     */
    noteMap: Uint8Array;
    /**
     * The new note action (0 cut, 1 continue, 2 note off, 3 note fade).
     */
    newNoteAction: number;
    /**
     * The duplicate check type (0 off, 1 note, 2 sample, 3 instrument).
     */
    duplicateCheckType: number;
    /**
     * The duplicate check action (0 cut, 1 note off, 2 note fade).
     */
    duplicateCheckAction: number;
    /**
     * The instrument global volume (0-64).
     */
    globalVolume: number;
    /**
     * The default panning (0-256), -1 if the instrument does not set the panning.
     */
    panning: number;
    /**
     * The random volume variation, in percent (0-100).
     */
    volumeSwing: number;
    /**
     * The random panning variation (0-64).
     */
    panningSwing: number;
    /**
     * The random cutoff variation (0-64), an OpenMPT extension.
     */
    cutoffSwing: number;
    /**
     * The random resonance variation (0-64), an OpenMPT extension.
     */
    resonanceSwing: number;
    /**
     * The pitch-pan separation (-32 to 32).
     */
    pitchPanSeparation: number;
    /**
     * The zero-based center note of the pitch-pan separation.
     */
    pitchPanCenter: number;
    /**
     * The initial filter cutoff (0-127), -1 if not set.
     */
    cutoff: number;
    /**
     * The initial filter resonance (0-127), -1 if not set.
     */
    resonance: number;
    /**
     * The pitch envelope, values from 0 to 64 (32 is the center).
     */
    pitchEnvelope: TrackerEnvelope;
    /**
     * If the pitch envelope controls the filter cutoff instead of the pitch.
     */
    filterEnvelope: boolean;
}
