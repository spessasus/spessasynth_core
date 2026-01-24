import type { Modulator } from "../../../soundbank/basic_soundbank/modulator";
import type { VoiceParameters } from "../../../soundbank/types";
import { generatorTypes } from "../../../soundbank/basic_soundbank/generator_types";
import type { SampleLoopingMode } from "../../types";

/**
 * Represents a cached voice
 */
export class CachedVoice {
    /**
     * Sample data of this voice.
     */
    public readonly sampleData: Float32Array;

    public readonly sampleName: string;

    /**
     * The unmodulated (copied to) generators of the voice.
     */
    public readonly generators: Int16Array;

    /**
     * The voice's modulators.
     */
    public readonly modulators: Modulator[];

    /**
     * Exclusive class number for hi-hats etc.
     */
    public readonly exclusiveClass;

    /**
     * Target key of the voice (can be overridden by generators)
     */
    public readonly targetKey;

    /**
     * Target velocity of the voice (can be overridden by generators)
     */
    public readonly velocity;

    /**
     * MIDI root key of the sample
     */
    public readonly rootKey;
    /**
     * Start position of the loop
     */
    public readonly loopStart;
    /**
     * End position of the loop
     */
    public readonly loopEnd;

    /**
     * Playback step (rate) for sample pitch correction
     */
    public readonly playbackStep: number;

    public readonly loopingMode: SampleLoopingMode;

    public constructor(
        voiceParams: VoiceParameters,
        midiNote: number,
        velocity: number,
        sampleRate: number
    ) {
        const sample = voiceParams.sample;
        const generators = voiceParams.generators;
        this.modulators = voiceParams.modulators;
        this.generators = generators;

        // Root key override
        this.rootKey = sample.originalKey;
        if (generators[generatorTypes.overridingRootKey] > -1) {
            this.rootKey = generators[generatorTypes.overridingRootKey];
        }

        // Key override
        this.targetKey = midiNote;
        if (generators[generatorTypes.keyNum] > -1) {
            this.targetKey = generators[generatorTypes.keyNum];
        }

        // Velocity override
        // Note: use a separate velocity to not override the cached velocity
        // Testcase: LiveHQ Natural SoundFont GM - the Glockenspiel preset
        this.velocity = velocity;
        if (generators[generatorTypes.velocity] > -1) {
            this.velocity = generators[generatorTypes.velocity];
        }
        this.exclusiveClass = generators[generatorTypes.exclusiveClass];

        // Create the sample for the wavetable oscillator
        // Offsets are calculated at note on time (to allow for modulation of them)
        this.loopStart = sample.loopStart;
        this.loopEnd = sample.loopEnd;
        this.sampleData = sample.getAudioData();
        this.sampleName = sample.name;
        this.playbackStep =
            (sample.sampleRate / sampleRate) *
            Math.pow(2, sample.pitchCorrection / 1200); // Cent tuning
        this.loopingMode = generators[
            generatorTypes.sampleModes
        ] as SampleLoopingMode;
    }
}
