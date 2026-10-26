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
     * The sustain point index, -1 if there is no sustain.
     */
    sustainPoint: number;
    /**
     * The loop start point index, -1 if there is no loop.
     */
    loopStart: number;
    /**
     * The loop end point index, -1 if there is no loop.
     */
    loopEnd: number;
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
 * A sample of a tracker module, already decoded to floating point PCM.
 */
export interface TrackerSample {
    name: string;
    /**
     * The decoded PCM audio data.
     */
    data: Float32Array;
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
