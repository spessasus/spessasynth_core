/**
 * voice.js
 * purpose: prepares Voices from sample and generator data
 */
import {
    MIN_EXCLUSIVE_LENGTH,
    MIN_NOTE_LENGTH,
    SpessaSynthProcessor
} from "../processor";
import { SpessaSynthWarn } from "../../../utils/loggin";
import { LowpassFilter } from "./dsp_chain/lowpass_filter";
import { VolumeEnvelope } from "./dsp_chain/volume_envelope";
import { ModulationEnvelope } from "./dsp_chain/modulation_envelope";
import { addAndClampGenerator } from "../../../soundbank/basic_soundbank/generator";
import { Modulator } from "../../../soundbank/basic_soundbank/modulator";
import {
    GENERATORS_AMOUNT,
    generatorTypes
} from "../../../soundbank/basic_soundbank/generator_types";
import type { SampleLoopingMode, VoiceList } from "../../types";
import type { BasicPreset } from "../../../soundbank/basic_soundbank/basic_preset";
import { AudioSample } from "./audio_sample";

const EXCLUSIVE_CUTOFF_TIME = -2320;
const EXCLUSIVE_MOD_CUTOFF_TIME = -1130; // less because filter shenanigans

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
    public sample: AudioSample;

    /**
     * Lowpass filter applied to the voice.
     */
    public filter: LowpassFilter;

    /**
     * Linear gain of the voice. Used with Key Modifiers.
     */
    public gain = 1;

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
    public modulationEnvelope: ModulationEnvelope = new ModulationEnvelope();

    /**
     * Volume envelope.
     */
    public volumeEnvelope: VolumeEnvelope;

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
     * From -500 to 500.
     */
    public currentPan = 0;

    /**
     * If MIDI Tuning Standard is already applied (at note-on time),
     * this will be used to take the values at real-time tuning as "midiNote"
     * property contains the tuned number.
     * see  SpessaSynth#29 comment by @paulikaro
     */
    public realKey: number;

    /**
     * @type {number} Initial key to glide from, MIDI Note number. If -1, the portamento is OFF.
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
        this.volumeEnvelope = new VolumeEnvelope(
            sampleRate,
            generators[generatorTypes.sustainVolEnv]
        );
    }

    /**
     * Copies a voice.
     */
    public static copy(voice: Voice, currentTime: number, realKey: number) {
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
    public exclusiveRelease(currentTime: number) {
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
    public release(currentTime: number, minNoteLength = MIN_NOTE_LENGTH) {
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
export function getVoicesForPresetInternal(
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
export function getVoicesInternal(
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
