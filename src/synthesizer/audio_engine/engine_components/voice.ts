/**
 * Voice.ts
 * purpose: prepares Voices from sample and generator data
 */
import { LowpassFilter } from "./dsp_chain/lowpass_filter";
import { VolumeEnvelope } from "./dsp_chain/volume_envelope";
import { ModulationEnvelope } from "./dsp_chain/modulation_envelope";
import { Modulator } from "../../../soundbank/basic_soundbank/modulator";
import { GENERATORS_AMOUNT } from "../../../soundbank/basic_soundbank/generator_types";
import type { SampleLoopingMode } from "../../types";
import { MIN_EXCLUSIVE_LENGTH, MIN_NOTE_LENGTH } from "./synth_constants";
import { WavetableOscillator } from "./dsp_chain/wavetable_oscillator";

const EXCLUSIVE_CUTOFF_TIME = -2320;
const EFFECT_MODULATOR_TRANSFORM_MULTIPLIER = 1000 / 200;

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
    public readonly wavetable = new WavetableOscillator();

    /**
     * Looping mode of the sample:
     * 0 - no loop
     * 1 - loop
     * 2 - UNOFFICIAL: polyphone 2.4 added start on release
     * 3 - loop then play when released
     */
    public loopingMode: SampleLoopingMode = 0;

    /**
     * The root key of the voice.
     */
    public rootKey = 0;

    /**
     * Lowpass filter applied to the voice.
     */
    public readonly filter: LowpassFilter;

    /**
     * Linear gain of the voice. Used with Key Modifiers.
     */
    public gainModifier = 1;

    /**
     * The unmodulated (copied to) generators of the voice.
     */
    public readonly generators = new Int16Array(GENERATORS_AMOUNT);

    /**
     * The voice's modulators.
     */
    public modulators = new Array<Modulator>();

    /**
     * The current values for the respective modulators.
     * If there are more modulators, the array must be resized.
     */
    public modulatorValues = new Int16Array(64);

    /**
     * Resonance offset, it is affected by the default resonant modulator
     */
    public resonanceOffset = 0;

    /**
     * The generators in real-time, affected by modulators.
     * This is used during rendering.
     */
    public readonly modulatedGenerators = new Int16Array(GENERATORS_AMOUNT);

    /**
     * Priority of the voice. Used for stealing.
     */
    public priority = 0;

    /**
     * If the voice is currently active.
     * If not, it can be used.
     */
    public active = false;

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
     * MIDI channel number of the voice.
     */
    public channel = 0;

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
    public readonly modEnv: ModulationEnvelope = new ModulationEnvelope();

    /**
     * Volume envelope.
     */
    public readonly volEnv;

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
     * From 0 to 1. Used for smoothing.
     */
    public currentGain = 1;

    /**
     * If MIDI Tuning Standard is already applied (at note-on time),
     * this will be used to take the values at real-time tuning as "midiNote"
     * property contains the tuned number.
     * see  SpessaSynth#29 comment by @paulikaro
     */
    public realKey = 60;

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

    public sampleName = "";

    /**
     * In timecents, where zero means disabled (use the modulatedGenerators table).
     * Used for exclusive notes and killing notes.
     */
    public overrideReleaseVolEnv = 0;

    /**
     * The buffer to use when rendering the voice (to avoid memory allocations)
     * If the user supplied a larger one, it must be resized.
     */
    public buffer = new Float32Array(128);

    public constructor(sampleRate: number) {
        this.volEnv = new VolumeEnvelope(sampleRate);
        this.filter = new LowpassFilter(sampleRate);
    }

    /**
     * Computes a given modulator
     * @param controllerTable all midi controllers as 14bit values + the non-controller indexes, starting at 128
     * @param modulatorIndex the modulator to compute
     * @returns the computed value
     */
    public computeModulator(
        this: Voice,
        controllerTable: Int16Array,
        modulatorIndex: number
    ): number {
        const modulator = this.modulators[modulatorIndex];
        if (modulator.transformAmount === 0) {
            this.modulatorValues[modulatorIndex] = 0;
            return 0;
        }
        const sourceValue = modulator.primarySource.getValue(
            controllerTable,
            this
        );
        const secondSrcValue = modulator.secondarySource.getValue(
            controllerTable,
            this
        );

        // See the comment for isEffectModulator (modulator.ts in basic_soundbank) for explanation
        let transformAmount = modulator.transformAmount;
        if (modulator.isEffectModulator && transformAmount <= 1000) {
            transformAmount *= EFFECT_MODULATOR_TRANSFORM_MULTIPLIER;
            transformAmount = Math.min(transformAmount, 1000);
        }

        // Compute the modulator
        let computedValue = sourceValue * secondSrcValue * transformAmount;

        if (modulator.transformType === 2) {
            // Abs value
            computedValue = Math.abs(computedValue);
        }

        // Resonant modulator: take its value and ensure that it won't change the final gain
        if (modulator.isDefaultResonantModulator) {
            // Half the gain, negates the filter
            this.resonanceOffset = Math.max(0, computedValue / 2);
        }

        this.modulatorValues[modulatorIndex] = computedValue;
        return computedValue;
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
        velocity: number,
        realKey: number
    ) {
        this.startTime = currentTime;
        this.active = true;
        this.isInRelease = false;
        this.hasRendered = false;
        this.releaseStartTime = Infinity;
        this.pressure = 0;
        this.channel = channel;
        this.midiNote = midiNote;
        this.velocity = velocity;
        this.realKey = realKey;
        this.overrideReleaseVolEnv = 0;
        this.portamentoDuration = 0;
        this.portamentoFromKey = -1;
    }
}
