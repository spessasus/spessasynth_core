/**
 * voice.js
 * purpose: prepares Voices from sample and generator data
 */
import {
    MIN_EXCLUSIVE_LENGTH,
    MIN_NOTE_LENGTH,
    SpessaSynthProcessor
} from "../main_processor";
import { SpessaSynthWarn } from "../../../utils/loggin";
import { LowpassFilter } from "./lowpass_filter";
import { VolumeEnvelope } from "./volume_envelope";
import { ModulationEnvelope } from "./modulation_envelope";
import { addAndClampGenerator } from "../../../soundbank/basic_soundbank/generator";
import { Modulator } from "../../../soundbank/basic_soundbank/modulator";
import {
    GENERATORS_AMOUNT,
    generatorTypes
} from "../../../soundbank/basic_soundbank/generator_types";
import type { SampleLoopingMode, VoiceList } from "../../types";
import type { BasicPreset } from "../../../soundbank/basic_soundbank/basic_preset";

const EXCLUSIVE_CUTOFF_TIME = -2320;
const EXCLUSIVE_MOD_CUTOFF_TIME = -1130; // less because filter shenanigans

class AudioSample {
    /**
     * the sample's audio data
     */
    sampleData: Float32Array;
    /**
     * Current playback step (rate)
     */
    playbackStep: number = 0;
    /**
     * Current position in the sample
     */
    cursor: number = 0;
    /**
     * MIDI root key of the sample
     */
    rootKey: number = 0;
    /**
     * Start position of the loop
     */
    loopStart: number = 0;
    /**
     * End position of the loop
     */
    loopEnd: number = 0;
    /**
     * End position of the sample
     */
    end: number = 0;
    /**
     * Looping mode of the sample:
     * 0 - no loop
     * 1 - loop
     * 2 - UNOFFICIAL: polyphone 2.4 added start on release
     * 3 - loop then play when released
     */
    loopingMode: SampleLoopingMode = 0;
    /**
     * Indicates if the sample is currently looping
     */
    isLooping: boolean = false;

    /**
     * @param data
     * @param playbackStep the playback step, a single increment
     * @param cursorStart the sample id which starts the playback
     * @param rootKey MIDI root key
     * @param loopStart loop start index
     * @param loopEnd loop end index
     * @param endIndex sample end index (for end offset)
     * @param loopingMode sample looping mode
     */
    constructor(
        data: Float32Array,
        playbackStep: number,
        cursorStart: number,
        rootKey: number,
        loopStart: number,
        loopEnd: number,
        endIndex: number,
        loopingMode: SampleLoopingMode
    ) {
        this.sampleData = data;
        this.playbackStep = playbackStep;
        this.cursor = cursorStart;
        this.rootKey = rootKey;
        this.loopStart = loopStart;
        this.loopEnd = loopEnd;
        this.end = endIndex;
        this.loopingMode = loopingMode;
        this.isLooping = this.loopingMode === 1 || this.loopingMode === 3;
    }
}

/**
 * Voice represents a single instance of the
 * SoundFont2 synthesis model.
 * That is:
 * A wavetable oscillator (sample)
 * A volume envelope (volumeEnvelope)
 * A modulation envelope (modulationEnvelope)
 * Generators (generators and modulatedGenerators)
 * Modulators (modulators)
 * And MIDI params such as channel, MIDI note, velocity
 */
export class Voice {
    /**
     * The sample of the voice.
     */
    sample: AudioSample;

    /**
     * Lowpass filter applied to the voice.
     */
    filter: LowpassFilter;

    /**
     * Linear gain of the voice. Used with Key Modifiers.
     */
    gain: number = 1;

    /**
     * The unmodulated (copied to) generators of the voice.
     */
    generators: Int16Array;

    /**
     * The voice's modulators.
     */
    modulators: Modulator[] = [];

    /**
     * Resonance offset, it is affected by the default resonant modulator
     */
    resonanceOffset: number = 0;

    /**
     * The generators in real-time, affected by modulators.
     * This is used during rendering.
     */
    modulatedGenerators: Int16Array;

    /**
     * Indicates if the voice is finished.
     */
    finished: boolean = false;

    /**
     * Indicates if the voice is in the release phase.
     */
    isInRelease: boolean = false;

    /**
     * Velocity of the note.
     */
    velocity: number = 0;

    /**
     * MIDI note number.
     */
    midiNote: number = 0;

    /**
     * The pressure of the voice
     */
    pressure: number = 0;

    /**
     * Target key for the note.
     */
    targetKey: number = 0;

    /**
     * Modulation envelope.
     */
    modulationEnvelope: ModulationEnvelope = new ModulationEnvelope();

    /**
     * Volume envelope.
     */
    volumeEnvelope: VolumeEnvelope;

    /**
     * Start time of the voice, absolute.
     */
    startTime: number = 0;

    /**
     * Start time of the release phase, absolute.
     */
    releaseStartTime: number = Infinity;

    /**
     * Current tuning in cents.
     */
    currentTuningCents: number = 0;

    /**
     * Current calculated tuning. (as in ratio)
     */
    currentTuningCalculated: number = 1;

    /**
     * From -500 to 500.
     */
    currentPan: number = 0;

    /**
     * If MIDI Tuning Standard is already applied (at note-on time),
     * this will be used to take the values at real-time tuning as "midiNote"
     * property contains the tuned number.
     * see #29 comment by @paulikaro
     */
    realKey: number;

    /**
     * @type {number} Initial key to glide from, MIDI Note number. If -1, the portamento is OFF.
     */
    portamentoFromKey: number = -1;

    /**
     * Duration of the linear glide, in seconds.
     */
    portamentoDuration: number = 0;

    /**
     * From -500 to 500, where zero means disabled (use the channel pan). Used for random pan.
     */
    overridePan: number = 0;

    /**
     * Exclusive class number for hi-hats etc.
     */
    exclusiveClass: number = 0;

    /**
     * Creates a Voice.
     */
    constructor(
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
        this.volumeEnvelope = new VolumeEnvelope(
            sampleRate,
            generators[generatorTypes.sustainVolEnv]
        );
    }

    /**
     * Copies a voice.
     */
    static copy(voice: Voice, currentTime: number, realKey: number) {
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
            voice.volumeEnvelope.sampleRate,
            sample,
            voice.midiNote,
            voice.velocity,
            currentTime,
            voice.targetKey,
            realKey,
            new Int16Array(voice.generators),
            voice.modulators.map((m) => Modulator.copy(m))
        );
    }

    /**
     * Releases the voice as exclusiveClass.
     */
    exclusiveRelease(currentTime: number) {
        this.release(currentTime, MIN_EXCLUSIVE_LENGTH);
        this.modulatedGenerators[generatorTypes.releaseVolEnv] =
            EXCLUSIVE_CUTOFF_TIME; // make the release nearly instant
        this.modulatedGenerators[generatorTypes.releaseModEnv] =
            EXCLUSIVE_MOD_CUTOFF_TIME;
        VolumeEnvelope.recalculate(this);
        ModulationEnvelope.recalculate(this);
    }

    /**
     * Stops the voice
     * @param currentTime
     * @param minNoteLength minimum note length in seconds
     */
    release(currentTime: number, minNoteLength = MIN_NOTE_LENGTH) {
        this.releaseStartTime = currentTime;
        // check if the note is shorter than the min note time, if so, extend it
        if (this.releaseStartTime - this.startTime < minNoteLength) {
            this.releaseStartTime = this.startTime + minNoteLength;
        }
    }
}

/**
 * @param preset the preset to get voices for
 * @param bank the bank to cache the voices in
 * @param program program to cache the voices in
 * @param midiNote the MIDI note to use
 * @param velocity the velocity to use
 * @param realKey the real MIDI note if the "midiNote" was changed by MIDI Tuning Standard
 * @returns output is an array of Voices
 */
export function getVoicesForPreset(
    this: SpessaSynthProcessor,
    preset: BasicPreset,
    bank: number,
    program: number,
    midiNote: number,
    velocity: number,
    realKey: number
): VoiceList {
    const voices: VoiceList = preset
        .getSamplesAndGenerators(midiNote, velocity)
        .reduce((voices: VoiceList, sampleAndGenerators) => {
            if (sampleAndGenerators.sample.getAudioData() === undefined) {
                SpessaSynthWarn(
                    `Discarding invalid sample: ${sampleAndGenerators.sample.name}`
                );
                return voices;
            }

            // create the generator list
            const generators = new Int16Array(GENERATORS_AMOUNT);
            // apply and sum the gens
            for (let i = 0; i < 60; i++) {
                generators[i] = addAndClampGenerator(
                    i,
                    sampleAndGenerators.presetGenerators,
                    sampleAndGenerators.instrumentGenerators
                );
            }

            // EMU initial attenuation correction, multiply initial attenuation by 0.4!
            // all EMU sound cards have this quirk, and all sf2 editors and players emulate it too
            generators[generatorTypes.initialAttenuation] = Math.floor(
                generators[generatorTypes.initialAttenuation] * 0.4
            );

            // key override
            let rootKey = sampleAndGenerators.sample.originalKey;
            if (generators[generatorTypes.overridingRootKey] > -1) {
                rootKey = generators[generatorTypes.overridingRootKey];
            }

            let targetKey = midiNote;
            if (generators[generatorTypes.keyNum] > -1) {
                targetKey = generators[generatorTypes.keyNum];
            }

            // determine looping mode now. if the loop is too small, disable
            const loopStart = sampleAndGenerators.sample.loopStart;
            const loopEnd = sampleAndGenerators.sample.loopEnd;
            const loopingMode = generators[
                generatorTypes.sampleModes
            ] as SampleLoopingMode;
            /**
             * create the sample
             * offsets are calculated at note on time (to allow for modulation of them)
             */
            const sampleData = sampleAndGenerators.sample.getAudioData();
            const audioSample: AudioSample = new AudioSample(
                sampleData,
                (sampleAndGenerators.sample.sampleRate / this.sampleRate) *
                    Math.pow(
                        2,
                        sampleAndGenerators.sample.pitchCorrection / 1200
                    ), // cent tuning
                0,
                rootKey,
                loopStart,
                loopEnd,
                Math.floor(sampleData.length) - 1,
                loopingMode
            );
            // velocity override
            if (generators[generatorTypes.velocity] > -1) {
                velocity = generators[generatorTypes.velocity];
            }

            // uncomment to print debug info
            // SpessaSynthTable([{
            //     Sample: sampleAndGenerators.sample.sampleName,
            //     Generators: generators,
            //     Modulators: sampleAndGenerators.modulators.map(m => Modulator.debugString(m)),
            //     Velocity: velocity,
            //     TargetKey: targetKey,
            //     MidiNote: midiNote,
            //     AudioSample: audioSample
            // }]);
            voices.push(
                new Voice(
                    this.sampleRate,
                    audioSample,
                    midiNote,
                    velocity,
                    this.currentSynthTime,
                    targetKey,
                    realKey,
                    generators,
                    sampleAndGenerators.modulators.map((m) => Modulator.copy(m))
                )
            );
            return voices;
        }, []);
    // cache the voice
    this.setCachedVoice(bank, program, midiNote, velocity, voices);
    return voices.map((v) => Voice.copy(v, this.currentSynthTime, realKey));
}

/**
 * @param channel channel to get voices for
 * @param midiNote the MIDI note to use
 * @param velocity the velocity to use
 * @param realKey the real MIDI note if the "midiNote" was changed by MIDI Tuning Standard
 * @returns output is an array of Voices
 */
export function getVoices(
    this: SpessaSynthProcessor,
    channel: number,
    midiNote: number,
    velocity: number,
    realKey: number
): VoiceList {
    const channelObject = this.midiChannels[channel];

    // override patch
    const overridePatch = this.keyModifierManager.hasOverridePatch(
        channel,
        midiNote
    );

    let bank = channelObject.getBankSelect();

    let preset = channelObject.preset;
    if (!preset) {
        SpessaSynthWarn(`No preset for channel ${channel}!`);
        return [];
    }
    let program = preset.program;
    if (overridePatch) {
        const override = this.keyModifierManager.getPatch(channel, midiNote);
        bank = override.bank;
        program = override.program;
    }

    const cached = this.getCachedVoice(bank, program, midiNote, velocity);
    // if cached, return it!
    if (cached !== undefined) {
        return cached.map((v) => Voice.copy(v, this.currentSynthTime, realKey));
    }

    // not cached...
    if (overridePatch) {
        preset = this.getPreset(bank, program);
    }
    return this.getVoicesForPreset(
        preset,
        bank,
        program,
        midiNote,
        velocity,
        realKey
    );
}
