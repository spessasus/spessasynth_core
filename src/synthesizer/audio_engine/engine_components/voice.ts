/**
 * Voice.ts
 * purpose: prepares Voices from sample and generator data
 */
import { SpessaSynthProcessor } from "../../processor";
import { SpessaSynthWarn } from "../../../utils/loggin";
import { LowpassFilter } from "./dsp_chain/lowpass_filter";
import { VolumeEnvelope } from "./dsp_chain/volume_envelope";
import { ModulationEnvelope } from "./dsp_chain/modulation_envelope";
import { Modulator } from "../../../soundbank/basic_soundbank/modulator";
import { generatorTypes } from "../../../soundbank/basic_soundbank/generator_types";
import type { SampleLoopingMode, VoiceList } from "../../types";
import type { BasicPreset } from "../../../soundbank/basic_soundbank/basic_preset";
import { AudioSample } from "./audio_sample";
import { MIN_EXCLUSIVE_LENGTH, MIN_NOTE_LENGTH } from "./synth_constants";

const EXCLUSIVE_CUTOFF_TIME = -2320;

/**
 * Voice represents a single instance of the
 * SoundFont2 synthesis model.
 * That is:
 * A wavetable oscillator (sample)
 * A volume envelope (volEnv)
 * A modulation envelope (modEnv)
 * Generators (generators and modulatedGenerators)
 * Modulators (modulators)
 * And MIDI params such as channel, MIDI note, velocity
 */
export class Voice {
    /**
     * The sample of the voice.
     */
    public sample: AudioSample;

    /**
     * Lowpass filter applied to the voice.
     */
    public filter: LowpassFilter;

    /**
     * Linear gain of the voice. Used with Key Modifiers.
     */
    public gainModifier = 1;

    /**
     * The unmodulated (copied to) generators of the voice.
     */
    public generators: Int16Array;

    /**
     * The voice's modulators.
     */
    public modulators: Modulator[] = [];

    /**
     * Resonance offset, it is affected by the default resonant modulator
     */
    public resonanceOffset = 0;

    /**
     * The generators in real-time, affected by modulators.
     * This is used during rendering.
     */
    public modulatedGenerators: Int16Array;

    /**
     * Indicates if the voice is finished.
     */
    public finished = false;

    /**
     * Indicates if the voice is in the release phase.
     */
    public isInRelease = false;

    /**
     * Velocity of the note.
     */
    public velocity = 0;

    /**
     * MIDI note number.
     */
    public midiNote = 0;

    /**
     * The pressure of the voice
     */
    public pressure = 0;

    /**
     * Target key for the note.
     */
    public targetKey = 0;

    /**
     * Modulation envelope.
     */
    public modEnv: ModulationEnvelope = new ModulationEnvelope();

    /**
     * Volume envelope.
     */
    public volEnv: VolumeEnvelope;

    /**
     * Start time of the voice, absolute.
     */
    public startTime = 0;

    /**
     * Start time of the release phase, absolute.
     */
    public releaseStartTime = Infinity;

    /**
     * Current tuning in cents.
     */
    public currentTuningCents = 0;

    /**
     * Current calculated tuning. (as in ratio)
     */
    public currentTuningCalculated = 1;

    /**
     * From -500 to 500. Used for smoothing.
     */
    public currentPan = 0;

    /**
     * From 0 to 1. Used for smoothing.
     */
    public currentGain = 1;

    /**
     * If MIDI Tuning Standard is already applied (at note-on time),
     * this will be used to take the values at real-time tuning as "midiNote"
     * property contains the tuned number.
     * see  SpessaSynth#29 comment by @paulikaro
     */
    public realKey: number;

    /**
     * Initial key to glide from, MIDI Note number. If -1, the portamento is OFF.
     */
    public portamentoFromKey = -1;

    /**
     * Duration of the linear glide, in seconds.
     */
    public portamentoDuration = 0;

    /**
     * From -500 to 500, where zero means disabled (use the channel pan). Used for random pan.
     */
    public overridePan = 0;

    /**
     * Exclusive class number for hi-hats etc.
     */
    public exclusiveClass = 0;

    /**
     * In timecents, where zero means disabled (use the modulatedGenerators table).
     * Used for exclusive notes and killing notes.
     */
    public overrideReleaseVolEnv = 0;

    /**
     * Creates a Voice.
     */
    public constructor(
        sampleRate: number,
        audioSample: AudioSample,
        midiNote: number,
        velocity: number,
        currentTime: number,
        targetKey: number,
        realKey: number,
        generators: Int16Array,
        modulators: Modulator[]
    ) {
        this.sample = audioSample;
        this.generators = generators;
        this.exclusiveClass = this.generators[generatorTypes.exclusiveClass];
        this.modulatedGenerators = new Int16Array(generators);
        this.modulators = modulators;
        this.filter = new LowpassFilter(sampleRate);
        this.velocity = velocity;
        this.midiNote = midiNote;
        this.startTime = currentTime;
        this.targetKey = targetKey;
        this.realKey = realKey;
        this.volEnv = new VolumeEnvelope(sampleRate);
    }

    /**
     * Copies a voice.
     */
    public static copyFrom(voice: Voice, currentTime: number, realKey: number) {
        const sampleToCopy = voice.sample;
        const sample = new AudioSample(
            sampleToCopy.sampleData,
            sampleToCopy.playbackStep,
            sampleToCopy.cursor,
            sampleToCopy.rootKey,
            sampleToCopy.loopStart,
            sampleToCopy.loopEnd,
            sampleToCopy.end,
            sampleToCopy.loopingMode
        );
        return new Voice(
            voice.volEnv.sampleRate,
            sample,
            voice.midiNote,
            voice.velocity,
            currentTime,
            voice.targetKey,
            realKey,
            new Int16Array(voice.generators),
            voice.modulators.map(Modulator.copyFrom.bind(Modulator))
        );
    }

    /**
     * Releases the voice as exclusiveClass.
     */
    public exclusiveRelease(currentTime: number) {
        this.overrideReleaseVolEnv = EXCLUSIVE_CUTOFF_TIME; // Make the release nearly instant
        this.isInRelease = false;
        this.releaseVoice(currentTime, MIN_EXCLUSIVE_LENGTH);
    }

    /**
     * Stops the voice
     * @param currentTime
     * @param minNoteLength minimum note length in seconds
     */
    public releaseVoice(currentTime: number, minNoteLength = MIN_NOTE_LENGTH) {
        this.releaseStartTime = currentTime;
        // Check if the note is shorter than the min note time, if so, extend it
        if (this.releaseStartTime - this.startTime < minNoteLength) {
            this.releaseStartTime = this.startTime + minNoteLength;
        }
    }
}

/**
 * @param preset the preset to get voices for
 * @param midiNote the MIDI note to use
 * @param velocity the velocity to use
 * @param realKey the real MIDI note if the "midiNote" was changed by MIDI Tuning Standard
 * @returns output is an array of Voices
 */
export function getVoicesForPresetInternal(
    this: SpessaSynthProcessor,
    preset: BasicPreset,
    midiNote: number,
    velocity: number,
    realKey: number
): VoiceList {
    const cached = this.getCachedVoice(preset, midiNote, velocity);
    // If cached, return it!
    if (cached !== undefined) {
        return cached.map((v) =>
            Voice.copyFrom(v, this.currentSynthTime, realKey)
        );
    }
    // Not cached...
    // Create the voices
    const voices = new Array<Voice>();
    for (const voiceParams of preset.getVoiceParameters(midiNote, velocity)) {
        const sample = voiceParams.sample;
        if (sample.getAudioData() === undefined) {
            SpessaSynthWarn(`Discarding invalid sample: ${sample.name}`);
            continue;
        }
        const generators = voiceParams.generators;

        // Key override
        let rootKey = sample.originalKey;
        if (generators[generatorTypes.overridingRootKey] > -1) {
            rootKey = generators[generatorTypes.overridingRootKey];
        }

        let targetKey = midiNote;
        if (generators[generatorTypes.keyNum] > -1) {
            targetKey = generators[generatorTypes.keyNum];
        }

        // Determine looping mode now. if the loop is too small, disable
        const loopStart = sample.loopStart;
        const loopEnd = sample.loopEnd;
        const loopingMode = generators[
            generatorTypes.sampleModes
        ] as SampleLoopingMode;

        // Create the sample for the wavetable oscillator
        // Offsets are calculated at note on time (to allow for modulation of them)
        const sampleData = sample.getAudioData();
        const audioSample = new AudioSample(
            sampleData,
            (sample.sampleRate / this.sampleRate) *
                Math.pow(2, sample.pitchCorrection / 1200), // Cent tuning
            0,
            rootKey,
            loopStart,
            loopEnd,
            Math.floor(sampleData.length) - 1,
            loopingMode
        );

        // Velocity override
        // Note: use a separate velocity to not override the cached velocity
        // Testcase: LiveHQ Natural SoundFont GM - the Glockenspiel preset
        let voiceVelocity = velocity;
        if (generators[generatorTypes.velocity] > -1) {
            voiceVelocity = generators[generatorTypes.velocity];
        }

        voices.push(
            new Voice(
                this.sampleRate,
                audioSample,
                midiNote,
                voiceVelocity,
                this.currentSynthTime,
                targetKey,
                realKey,
                generators,
                voiceParams.modulators.map(Modulator.copyFrom.bind(Modulator))
            )
        );
    }
    // Cache the voice
    this.setCachedVoice(preset, midiNote, velocity, voices);
    return voices.map((v) => Voice.copyFrom(v, this.currentSynthTime, realKey));
}

/**
 * @param channel channel to get voices for
 * @param midiNote the MIDI note to use
 * @param velocity the velocity to use
 * @param realKey the real MIDI note if the "midiNote" was changed by MIDI Tuning Standard
 * @returns output is an array of Voices
 */
export function getVoicesInternal(
    this: SpessaSynthProcessor,
    channel: number,
    midiNote: number,
    velocity: number,
    realKey: number
): VoiceList {
    const channelObject = this.midiChannels[channel];

    // Override patch
    const overridePatch = this.keyModifierManager.hasOverridePatch(
        channel,
        midiNote
    );

    let preset = channelObject.preset;

    if (overridePatch) {
        const patch = this.keyModifierManager.getPatch(channel, midiNote);
        preset = this.soundBankManager.getPreset(
            patch,
            this.privateProps.masterParameters.midiSystem
        );
    }
    if (!preset) {
        SpessaSynthWarn(`No preset for channel ${channel}!`);
        return [];
    }
    return this.getVoicesForPreset(preset, midiNote, velocity, realKey);
}
