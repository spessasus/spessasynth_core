/**
 * Voice.ts
 * purpose: prepares Voices from sample and generator data
 */
import { LowpassFilter } from "./lowpass_filter";
import { VolumeEnvelope } from "./volume_envelope";
import { ModulationEnvelope } from "./modulation_envelope";
import { GENERATORS_AMOUNT } from "../../../soundbank/basic_soundbank/generator_types";
import type { SampleLoopingMode } from "../../types";
import { MIN_EXCLUSIVE_LENGTH, MIN_NOTE_LENGTH } from "../synth_constants";
import {
    HermiteOscillator,
    LinearOscillator,
    NearestOscillator,
    WavetableOscillator
} from "./wavetable_oscillator";
import { type InterpolationType } from "../../enums";
import { DEFAULT_GLOBAL_SYSTEM_PARAMETERS } from "../parameters/system";
import type { VoiceModulator } from "./voice_modulator";

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
     * All oscillators currently available to the voice.
     */
    public readonly oscillators: Record<
        InterpolationType,
        WavetableOscillator
    > = [
        new LinearOscillator(),
        new NearestOscillator(),
        new HermiteOscillator()
    ];

    /**
     * The oscillator currently used by this voice.
     */
    public wavetable: WavetableOscillator =
        this.oscillators[DEFAULT_GLOBAL_SYSTEM_PARAMETERS.interpolationType];

    /**
     * Lowpass filter applied to the voice.
     */
    public readonly filter: LowpassFilter;

    /**
     * The unmodulated (copied to) generators of the voice.
     */
    public readonly generators = new Int16Array(GENERATORS_AMOUNT);

    /**
     * The generators in real-time, affected by modulators.
     * This is used during rendering.
     */
    public readonly modulatedGenerators = new Int16Array(GENERATORS_AMOUNT);

    /**
     * The voice's modulators.
     */
    public modulators = new Array<VoiceModulator>();

    /**
     * The current values for the respective modulators.
     * If there are more modulators, the array must be resized.
     */
    public modulatorValues = new Int16Array(64);

    /**
     * Modulation envelope.
     */
    public readonly modEnv: ModulationEnvelope = new ModulationEnvelope();

    /**
     * Volume envelope.
     */
    public readonly volEnv;

    /**
     * Resonance offset, it is affected by the default resonant modulator
     */
    public resonanceOffset = 0;

    /**
     * Priority of the voice. Used for stealing.
     */
    public priority = 0;

    /**
     * If the voice is currently active.
     * If not, it can be used.
     */
    public isActive = false;

    /**
     * Indicates if the voice has rendered at least one buffer.
     * Used for exclusive class to prevent killing voices set on the same note.
     */
    public hasRendered = false;

    /**
     * Indicates if the voice is in the release phase.
     */
    public isInRelease = false;

    /**
     * Indicates if the voice is currently held by the sustain pedal.
     */
    public isHeld = false;

    /**
     * MIDI channel number of the voice.
     */
    public channel = 0;

    /**
     * Grouping voices for specific Note On messages.
     * Used for overlapping Note Ons.
     */
    public noteID = 0;

    /**
     * MIDI note number of the voice.
     * Direct number from the Note On message and is
     * used for Note Off and external parameters:
     * MTS and Per note Pitch Wheel.
     */
    public midiNote = 0;

    /**
     * Target key of the voice.
     * This is the effective MIDI note number,
     * used to calculate scale tuning and envelope times,
     * and can be overridden by generators.
     * It is also used
     */
    public targetKey = 0;

    /**
     * MIDI Velocity of the voice.
     * This can be overridden by generators and is the effective velocity.
     * MIDI Note On velocity is only used for zone filtering.
     */
    public velocity = 0;

    /**
     * The root key of the voice.
     */
    public rootKey = 0;

    /**
     * The pressure of the voice
     */
    public pressure = 0;

    /**
     * Linear gain of the voice. Used with Key Modifiers.
     */
    public gainModifier = 1;

    /**
     * Looping mode of the sample:
     * 0 - no loop
     * 1 - loop
     * 2 - UNOFFICIAL: polyphone 2.4 added start on release
     * 3 - loop then play when released
     */
    public loopingMode: SampleLoopingMode = 0;

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
    public tuningCents = 0;

    /**
     * Current calculated tuning. (as in ratio)
     */
    public tuningRatio = 1;

    /**
     * From -500 to 500. Used for smoothing.
     */
    public currentPan = 0;

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
     * In cents.
     */
    public pitchOffset = 0;

    /**
     * Reverb send of the voice, used for drum parts, otherwise 1.
     */
    public reverbSend = 1;

    /**
     * Chorus send of the voice, used for drum parts, otherwise 1.
     */
    public chorusSend = 1;

    /**
     * Delay send of the voice, used for drum parts, otherwise 1.
     */
    public delaySend = 1;

    /**
     * Exclusive class number for hi-hats etc.
     */
    public exclusiveClass = 0;

    /**
     * In timecents, where zero means disabled (use the modulatedGenerators table).
     * Used for exclusive notes and killing notes.
     */
    public overrideReleaseVolEnv = 0;

    // Vibrato LFO data
    public vibLfoPhase = 0;
    public vibLfoStartTime = 0;
    // Mod LFO data
    public modLfoPhase = 0;
    public modLfoStartTime = 0;

    public constructor(sampleRate: number, bufferSize: number) {
        this.volEnv = new VolumeEnvelope(sampleRate, bufferSize);
        this.filter = new LowpassFilter(sampleRate);
    }

    /**
     * Releases the voice as exclusiveClass.
     */
    public exclusiveRelease(
        currentTime: number,
        minExclusiveLength = MIN_EXCLUSIVE_LENGTH
    ) {
        this.overrideReleaseVolEnv = EXCLUSIVE_CUTOFF_TIME; // Make the release nearly instant
        this.isInRelease = false;
        this.releaseVoice(currentTime, minExclusiveLength);
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

    public setup(
        currentTime: number,
        channel: number,
        midiNote: number,
        noteID: number
    ) {
        // Remember to add new values here!!!
        // Clear state
        this.isActive = true;
        this.isInRelease = false;
        this.hasRendered = false;
        this.isHeld = false;
        this.releaseStartTime = Infinity;
        this.pressure = 0;
        this.overrideReleaseVolEnv = 0;
        this.portamentoDuration = 0;
        this.portamentoFromKey = -1;
        // Important, these start at 1/4 way there!
        this.vibLfoPhase = 0.25;
        this.modLfoPhase = 0.25;

        // Set parameters
        this.startTime = currentTime;
        this.channel = channel;
        this.midiNote = midiNote;
        this.noteID = noteID;
    }
}
