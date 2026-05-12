import { DEFAULT_DRUM_REVERB, resetChannelInternal, resetRP15 } from "./reset";
import { renderVoice } from "./render_voice";
import { controllerChange, lockController } from "./controller_change";
import { dataEntry } from "./data_entry";
import { noteOn } from "./note_on";
import { noteOff } from "./note_off";
import { programChange } from "./program_change";
import {
    CONTROLLER_TABLE_SIZE,
    DEFAULT_PERCUSSION,
    GENERATOR_OVERRIDE_NO_CHANGE_VALUE,
    SPESSASYNTH_GAIN_FACTOR
} from "../synth_constants";
import { DynamicModulatorManager } from "./dynamic_modulator_system";
import {
    computeModulator,
    computeModulators
} from "../voice/compute_modulator";
import {
    GeneratorLimits,
    GENERATORS_AMOUNT,
    type GeneratorType
} from "../../../soundbank/basic_soundbank/generator_types";
import type { BasicPreset } from "../../../soundbank/basic_soundbank/basic_preset";
import { SpessaLog } from "../../../utils/loggin";
import { ConsoleColors } from "../../../utils/other";
import type { SynthesizerCore } from "../synthesizer_core";
import { ModulatorControllerSources } from "../../../soundbank/enums";
import type { MIDIPatch } from "../../../soundbank/basic_soundbank/midi_patch";
import { BankSelectHacks } from "../../../utils/midi_hacks";
import { DrumParameters } from "./drum_parameters";
import {
    applySnapshot,
    type ChannelSnapshot,
    getChannelSnapshot
} from "./channel_snapshot";
import type { ChannelGenerators } from "./awe32";
import {
    type ChannelMIDIParameter,
    DEFAULT_CHANNEL_MIDI_PARAMETERS
} from "./parameters/midi";
import type { ChannelMIDIParameterChange, CustomChannelVibrato } from "./types";
import {
    type ChannelSystemParameter,
    DEFAULT_CHANNEL_SYSTEM_PARAMETERS,
    setSystemParameterInternal
} from "./parameters/system";
import type { MIDISystem } from "../../../soundbank/types";

/**
 * This class represents a single MIDI Channel within the synthesizer.
 */
export class MIDIChannel {
    /**
     * @internal
     * An array of MIDI controllers for the channel.
     * This array is used to store the state of various MIDI controllers
     * such as volume, pan, modulation, etc.
     * @remarks
     * A bit of an explanation:
     * The controller table is stored as an int16 array, it stores 14-bit values, allowing for full 14-bit LSB resolution.
     * The only exception from this are the Registered and Non-Registered Parameter Numbers.
     * Data entries do store it!
     */
    public readonly midiControllers: Int16Array = new Int16Array(
        CONTROLLER_TABLE_SIZE
    );

    /**
     * An array for the MIDI 2.0 Per-note pitch wheels.
     * @internal
     */
    public readonly pitchWheels = new Int16Array(128).fill(8192);
    /**
     * An array indicating if a controller, at the equivalent index in the midiControllers array, is locked
     * (i.e., not allowed changing).
     * A locked controller cannot be modified.
     * @internal
     */
    public readonly lockedControllers: readonly boolean[] = new Array(
        CONTROLLER_TABLE_SIZE
    ).fill(false) as boolean[];
    /**
     * An array of octave tuning values for each note on the channel.
     * Each index corresponds to a note (0 = C, 1 = C#, ..., 11 = B).
     * Note: Repeated every 12 notes.
     * @internal
     */
    public readonly octaveTuning: Int8Array = new Int8Array(128);

    /**
     * Parameters for each drum instrument.
     * @internal
     */
    public readonly drumParams: DrumParameters[] = [];
    /**
     * A system for dynamic modulator assignment for advanced system exclusives.
     * @internal
     */
    public readonly dynamicModulators;
    /**
     * Indicates whether this channel is a drum channel.
     */
    public drumChannel = false;
    /**
     * SF2 NRPN LSB for selecting a generator value.
     * @internal
     */
    public sf2NRPNGeneratorLSB = 0;
    /**
     * The currently selected MIDI patch of the channel.
     * Note that the exact matching preset may not be available, but this represents exactly what MIDI asks for.
     */
    public readonly patch: MIDIPatch = {
        bankMSB: 0,
        bankLSB: 0,
        program: 0,
        isGMGSDrum: false
    };
    /**
     * The preset currently assigned to the channel.
     * Note that this may be undefined in some cases.
     */
    public preset?: BasicPreset;
    /**
     * Indicates the MIDI system when the preset was locked.
     * @internal
     */
    public lockedSystem: MIDISystem = "gs";
    /**
     * The vibrato settings for the channel.
     * @internal
     */
    public readonly vibrato: CustomChannelVibrato = {
        delay: 0,
        depth: 0,
        rate: 0
    };
    /**
     * Channel's current voice count.
     */
    public voiceCount = 0;
    /**
     * The channel's number (0-based index)
     */
    public readonly channel: number;
    /**
     * Core synthesis engine.
     * @internal
     */
    public readonly synthCore: SynthesizerCore;
    /*
    ==========
    PUBLIC API
    ==========
     */
    /**
     * Sets a system parameter of the channel.
     * @param parameter The type of the system parameter to set.
     * @param value The value to set for the system parameter.
     */
    public readonly setSystemParameter: typeof setSystemParameterInternal =
        setSystemParameterInternal.bind(this);
    // noinspection JSUnusedGlobalSymbols
    /**
     * Locks or unlocks a given controller.
     * This prevents any changes to it until it's unlocked.
     * @param controllerNumber The MIDI controller number (0-127).
     * @param isLocked If the controller should be locked.
     */
    public readonly lockController: typeof lockController =
        lockController.bind(this);
    /*
    =================
    END OF PUBLIC API
    =================
     */
    // MIDI messages
    /**
     * Sends a "MIDI Note on" message and starts a note.
     * @param midiNote The MIDI note number (0-127).
     * @param velocity The velocity of the note (0-127). If less than 1, it will send a note off instead.
     * @internal
     */
    public readonly noteOn = noteOn.bind(this);

    /**
     * Releases a note by its MIDI note number.
     * If the note is in high performance mode and the channel is not a drum channel,
     * it kills the note instead of releasing it.
     * @param midiNote The MIDI note number to release (0-127).
     * @internal
     */
    public readonly noteOff = noteOff.bind(this);
    /**
     * Changes the program (preset) of the channel.
     * @param programNumber The program number (0-127) to change to.
     * @internal
     */
    public readonly programChange = programChange.bind(this);
    // CC (Continuous Controller)
    /**
     * Handles MIDI controller changes for a channel.
     * @param controllerNumber The MIDI controller number (0-127).
     * @param controllerValue The value of the controller (0-127).
     * @param sendEvent If an event should be emitted.
     * @remarks
     * This function processes MIDI controller changes, updating the channel's
     * midiControllers table and handling special cases like bank select,
     * data entry, and sustain pedal. It also computes modulators for all voices
     * in the channel based on the controller change.
     * to allow changes.
     * @internal
     */
    public readonly controllerChange = controllerChange.bind(this);
    /**
     * Reset this channel to its default state.
     * Except for the locked controllers.
     * @internal
     */
    public readonly reset = resetChannelInternal.bind(this);
    // Voice rendering methods
    /**
     * Renders a voice to the stereo output buffer
     * @param voice the voice to render
     * @param timeNow current time in seconds
     * @param outputL the left output buffer
     * @param outputR the right output buffer
     * @param startIndex
     * @param sampleCount
     * @internal
     */
    public readonly renderVoice = renderVoice.bind(this);
    /**
     * https://amei.or.jp/midistandardcommittee/Recommended_Practice/e/rp15.pdf
     * Reset controllers according to RP-15 Recommended Practice.
     * @internal
     */
    protected readonly resetRP15 = resetRP15.bind(this);
    /**
     * Executes a data entry coarse (MSB) change for the current channel.
     * @param dataValue The value to set for the data entry coarse controller (0-127).
     * @internal
     */
    protected readonly dataEntry = dataEntry.bind(this);
    protected readonly _midiParameters: Readonly<ChannelMIDIParameter> = {
        ...DEFAULT_CHANNEL_MIDI_PARAMETERS
    };
    /**
     * All system parameters of this channel.
     * @internal
     */
    protected readonly _systemParameters: Readonly<ChannelSystemParameter> = {
        ...DEFAULT_CHANNEL_SYSTEM_PARAMETERS
    }; // Copy, not set!

    /**
     * If the last Parameter was RPN.
     * If false then the last parameter was NRPN.
     * @protected
     */
    protected lastParameterIsRegistered = true;
    /**
     * Per-note pitch wheel mode uses the pitchWheels table as source
     * instead of the regular entry in the midiControllers table.
     */
    protected perNotePitch = false;
    /**
     * Current pan in range [-500;500]
     * Updated in `updateInternalParams`.
     * This is used to avoid a big addition for every voice rendering call.
     */
    protected currentPan = 0;
    /**
     * Current tuning in cents.
     * Updated in `updateInternalParams`.
     * This is used to avoid a big addition for every voice rendering call.
     */
    protected currentTuning = 0;
    /**
     * Current key-shift.
     * Updated in `updateInternalParams`.
     */
    protected currentKeyShift = 0;
    /**
     * Current gain.
     * Updated in `updateInternalParams`.
     * This is used to avoid a big multiplication for every voice rendering call.
     */
    protected currentGain = 0;

    /**
     * The last pressed note on this channel.
     * -1 means none.
     * This is not a `ChannelMIDIParameter` and is strictly internal,
     * mostly because we don't want to send events for every note on message.
     * It can be set with Portamento Control CC anyway.
     * @protected
     */
    protected lastNote = -1;
    /**
     * If the portamento should be executed once regardless of Portamento on/off.
     * Adhering to the MIDI spec, CC#84 ignores on/off.
     * This is also not a `ChannelMIDIParameter` for the same reason as `lastNote`
     * @protected
     */
    protected portamentoForce = false;
    protected readonly generators: ChannelGenerators = {
        offsets: new Int16Array(GENERATORS_AMOUNT),
        offsetsEnabled: false,
        overrides: new Int16Array(GENERATORS_AMOUNT),
        overridesEnabled: false
    };
    protected readonly computeModulator = computeModulator.bind(this);
    protected readonly computeModulators = computeModulators.bind(this);

    /**
     * Constructs a new MIDI channel.
     * @internal
     */
    public constructor(
        synthProps: SynthesizerCore,
        preset: BasicPreset | undefined,
        channelNumber: number
    ) {
        this.synthCore = synthProps;
        this.preset = preset;
        this.channel = channelNumber;
        // @ts-expect-error Rx Channel init here!
        this._midiParameters.rxChannel = channelNumber;
        this.dynamicModulators = new DynamicModulatorManager(channelNumber);
        this.resetGeneratorOverrides();
        this.resetGeneratorOffsets();
        for (let i = 0; i < 128; i++) {
            this.drumParams.push(new DrumParameters());
        }
        this.resetDrumParams();
        this.resetVibratoParams();
    }

    /*
    ==========
    PUBLIC API
    ==========
     */
    // noinspection JSUnusedGlobalSymbols
    /**
     * The channel system parameters of this channel.
     * These are only editable via the API.
     */
    public get systemParameters(): Readonly<ChannelSystemParameter> {
        return this._systemParameters;
    }

    /**
     * The channel MIDI parameters of this channel.
     * These are only editable via MIDI messages.
     */
    public get midiParameters(): Readonly<ChannelMIDIParameter> {
        return this._midiParameters;
    }

    /*
    =================
    END OF PUBLIC API
    =================
    */

    protected get channelSystem(): MIDISystem {
        return this._systemParameters.presetLock
            ? this.lockedSystem
            : this.synthCore.midiParameters.system;
    }

    /*
    ==========
    PUBLIC API
    ==========
     */

    /**
     * Changes the preset to, or from drums.
     * Note that this executes a program change.
     * @param isDrum If the channel should be a drum preset or not.
     */
    public setDrums(isDrum: boolean) {
        if (BankSelectHacks.isSystemXG(this.channelSystem)) {
            if (isDrum) {
                this.setBankMSB(
                    BankSelectHacks.getDrumBank(this.channelSystem)
                );
                this.setBankLSB(0);
            } else {
                if (this.channel % 16 === DEFAULT_PERCUSSION) {
                    throw new Error(
                        `Cannot disable drums on channel ${this.channel} for XG.`
                    );
                }
                this.setBankMSB(0);
                this.setBankLSB(0);
            }
        } else {
            this.setGSDrums(isDrum);
        }
        this.setDrumFlag(isDrum);
        this.programChange(this.patch.program);
    }

    /*
    =================
    END OF PUBLIC API
    =================
     */

    /**
     * Stops all notes on the channel.
     * @param force If true, stops all notes immediately, otherwise applies release time.
     */
    public stopAllNotes(force = false) {
        if (force) {
            // Force stop all
            let vc = 0;
            if (this.voiceCount > 0)
                for (const v of this.synthCore.voices) {
                    if (v.channel === this.channel && v.isActive) {
                        v.isActive = false;
                        if (++vc >= this.voiceCount) break; // We already checked all the voices
                    }
                }
            this.clearVoiceCount();
        } else {
            // Gracefully stop
            let vc = 0;
            if (this.voiceCount > 0)
                for (const v of this.synthCore.voices) {
                    if (v.channel === this.channel && v.isActive) {
                        v.releaseVoice(this.synthCore.currentTime);
                        if (++vc >= this.voiceCount) break; // We already checked all the voices
                    }
                }
        }
        this.synthCore.callEvent("stopAll", {
            channel: this.channel,
            force
        });
    }

    /**
     * Sets a channel MIDI parameter of the synthesizer.
     * @param parameter The type of the channel MIDI parameter to set.
     * @param value The value to set for the channel MIDI parameter.
     * @internal
     */
    public setMIDIParameter<P extends keyof ChannelMIDIParameter>(
        this: MIDIChannel,
        parameter: P,
        value: ChannelMIDIParameter[P]
    ) {
        // @ts-expect-error This is the only place where we set them
        this._midiParameters[parameter] = value;

        switch (parameter) {
            case "pitchWheel": {
                this.computeModulatorsAll(
                    0,
                    ModulatorControllerSources.pitchWheel
                );
                break;
            }

            case "pressure": {
                this.computeModulatorsAll(
                    0,
                    ModulatorControllerSources.channelPressure
                );
                break;
            }
        }

        this.updateInternalParams();

        this.synthCore.callEvent("channelMIDIParamChange", {
            channel: this.channel,
            parameter,
            value
        } as ChannelMIDIParameterChange);
    }

    /**
     * @internal
     */
    public clearVoiceCount() {
        this.voiceCount = 0;
    }

    /**
     * Sets the octave tuning for a given channel.
     * @param tuning The tuning array of 12 values, each representing the tuning for a note in the octave.
     * @remarks
     * Cent tunings are relative.
     * @internal
     */
    public setOctaveTuning(tuning: Int8Array) {
        if (tuning.length !== 12) {
            throw new Error("Tuning is not the length of 12.");
        }
        for (let i = 0; i < 128; i++) {
            this.octaveTuning[i] = tuning[i % 12];
        }
    }

    /**
     * Sets the modulation depth for the channel.
     * @param cents The modulation depth in cents to set.
     * @param log If true, logs the change to the console.
     * @remarks
     * This method sets the modulation depth for the channel by converting the given cents value into a
     * multiplier. The MIDI specification assumes the default modulation depth is 50 cents,
     * but it may vary for different sound banks.
     * For example, if you want a modulation depth of 100 cents,
     * the multiplier will be 2,
     * which, for a preset with a depth of 50,
     * will create a total modulation depth of 100 cents.
     * @internal
     */
    public modulationDepth(cents: number, log = true) {
        cents = Math.round(cents);
        this.setMIDIParameter("modulationDepth", cents / 50);
        if (!log) return;
        SpessaLog.info(
            `%cChannel ${this.channel} modulation depth. Cents: %c${cents}`,
            ConsoleColors.info,
            ConsoleColors.value
        );
    }

    /**
     * Sets the channel's key shift.
     * @param shift the key shift.
     * @param log If true, logs the change to the console.
     * @internal
     */
    public keyShift(shift: number, log = true) {
        if (this._midiParameters.keyShift === shift) return;
        this.setMIDIParameter("keyShift", shift);
        if (!log) return;
        SpessaLog.info(
            `%cKey shift for %c${this.channel}%c is now set to %c${shift}.`,
            ConsoleColors.info,
            ConsoleColors.recognized,
            ConsoleColors.info,
            ConsoleColors.value
        );
    }

    /**
     * Sets the channel's tuning.
     * @param cents The tuning in cents to set.
     * @param log If true, logs the change to the console.
     * @internal
     */
    public fineTune(cents: number, log = true) {
        cents = Math.round(cents);
        this.setMIDIParameter("fineTune", cents);
        if (!log) return;

        SpessaLog.info(
            `%cFine tuning for %c${this.channel}%c is now set to %c${cents}%c cents.`,
            ConsoleColors.info,
            ConsoleColors.recognized,
            ConsoleColors.info,
            ConsoleColors.value,
            ConsoleColors.info
        );
    }

    /**
     * Sets the pitch of the given channel.
     * @param pitch The pitch (0 - 16383)
     * @param midiNote The MIDI note number, pass -1 for the regular pitch wheel
     * @internal
     */
    public pitchWheel(pitch: number, midiNote = -1) {
        if (midiNote === -1) {
            // Disable the per note pitch mode
            this.perNotePitch = false;
            this.setMIDIParameter("pitchWheel", pitch);
        } else {
            if (!this.perNotePitch) {
                // Enable the per-note pitch (fill the pitches with the current CC value)
                this.pitchWheels.fill(this._midiParameters.pitchWheel);
            }
            this.perNotePitch = true;

            this.pitchWheels[midiNote] = pitch;

            // Recompute only specific modulators
            this.computeModulatorsAll(0, ModulatorControllerSources.pitchWheel);
        }
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Sets the pressure of the given note on a specific channel.
     * This is used for polyphonic pressure (aftertouch).
     * @param midiNote 0 - 127, the MIDI note number to set the pressure for.
     * @param pressure 0 - 127, the pressure value to set for the note.
     * @internal
     */
    public polyPressure(midiNote: number, pressure: number) {
        // Note to self: don't use computeModulatorsAll here as we're setting the pressure!
        let vc = 0;
        if (this.voiceCount > 0)
            for (const v of this.synthCore.voices) {
                if (
                    v.isActive &&
                    v.channel === this.channel &&
                    v.midiNote === midiNote
                ) {
                    v.pressure = pressure;
                    this.computeModulators(
                        v,
                        0,
                        ModulatorControllerSources.polyPressure
                    );
                    if (++vc >= this.voiceCount) break; // We already checked all the voices
                }
            }
        this.synthCore.callEvent("polyPressure", {
            channel: this.channel,
            midiNote: midiNote,
            pressure: pressure
        });
    }

    /**
     * Sets the pitch wheel range for this channel.
     * @param range range in semitones.
     * @param log If true, logs the change to the console.
     * @internal
     */
    public pitchWheelRange(range: number, log = true) {
        this.setMIDIParameter("pitchWheelRange", range);
        if (!log) return;
        SpessaLog.coolInfo(
            `Pitch Wheel Range for ${this.channel}`,
            range,
            "semitones"
        );
    }

    /**
     * @internal
     */
    public updateInternalParams() {
        const globalSystem = this.synthCore.systemParameters;
        const channelSystem = this._systemParameters;
        const globalMIDI = this.synthCore.midiParameters;
        const channelMIDI = this._midiParameters;
        // Note:
        // - System -> System Parameter
        // - MIDI -> MIDI Parameter
        //
        this.currentTuning =
            // Global System (disabled for drums)
            (this.drumChannel ? 0 : globalSystem.fineTune) +
            // Global MIDI (disabled for drums)
            (this.drumChannel ? 0 : globalMIDI.fineTune) +
            // Channel System
            channelSystem.fineTune +
            // Channel MIDI
            channelMIDI.fineTune;

        // [-1;1] normalized
        const currentPanNormalized =
            // Global System
            globalSystem.pan +
            // Global MIDI
            globalMIDI.pan +
            // Channel System
            channelSystem.pan;
        // Channel MIDI is the pan controller

        // For faster renderVoice calculation
        this.currentPan = currentPanNormalized * 500;

        this.currentKeyShift = Math.floor(
            // Global System (disabled for drums)
            (this.drumChannel ? 0 : globalSystem.keyShift) +
                // Global MIDI (disabled for drums)
                (this.drumChannel ? 0 : globalMIDI.keyShift) +
                // Channel System
                channelSystem.keyShift +
                // Channel MIDI
                channelMIDI.keyShift
        );

        this.currentGain =
            // Global forced
            SPESSASYNTH_GAIN_FACTOR *
            // Global System
            globalSystem.gain *
            // Global MIDI
            globalMIDI.gain *
            // Channel System
            channelSystem.gain;
        // Channel MIDI are the volume/expression controllers
    }

    /**
     * Sets the channel to a given MIDI patch.
     * Note that this executes a program change.
     * @param patch The MIDI patch to set the channel to.
     * @internal
     */
    public setPatch(patch: MIDIPatch) {
        this.setBankMSB(patch.bankMSB);
        this.setBankLSB(patch.bankLSB);
        this.setGSDrums(patch.isGMGSDrum);
        this.programChange(patch.program);
    }

    /**
     * Sets the GM/GS drum flag.
     * @param drums
     * @internal
     */
    public setGSDrums(drums: boolean) {
        if (drums === this.patch.isGMGSDrum) {
            return;
        }
        this.setBankLSB(0);
        this.setBankMSB(0);
        this.patch.isGMGSDrum = drums;
    }

    /**
     * Stops a note nearly instantly.
     * @param midiNote The note to stop.
     * @param releaseTime in timecents, defaults to -12000 (very short release).
     * @internal
     */
    public killNote(midiNote: number, releaseTime = -12_000) {
        let vc = 0;
        if (this.voiceCount > 0)
            for (const v of this.synthCore.voices) {
                if (
                    v.channel === this.channel &&
                    v.isActive &&
                    v.midiNote === midiNote
                ) {
                    v.overrideReleaseVolEnv = releaseTime; // Set release to be very short
                    v.isInRelease = false; // Force release again
                    v.releaseVoice(this.synthCore.currentTime);
                    if (++vc >= this.voiceCount) break; // We already checked all the voices
                }
            }
    }

    /**
     * Applies the snapshot to this `MIDIChannel` instance.
     * @param snapshot The snapshot to apply.
     */
    public applySnapshot(snapshot: ChannelSnapshot) {
        applySnapshot.call(this, snapshot);
    }

    /**
     * @internal
     */
    public getSnapshot() {
        return getChannelSnapshot.call(this);
    }

    /**
     * Strictly internal, used by the sequencer for
     * very accurate portamento recreation.
     * @internal
     * @param midiNote
     */
    public setLastNote(midiNote: number) {
        this.lastNote = midiNote;
    }

    /**
     * @internal
     */
    public destroy() {
        this.preset = undefined;
        // @ts-expect-error destruction
        this.lockedControllers = undefined;
        // @ts-expect-error destruction
        this._systemParameters = undefined;
        // @ts-expect-error destruction
        this.midiControllers = undefined;
        // @ts-expect-error destruction
        this._midiParameters = undefined;
    }

    protected resetGeneratorOverrides() {
        this.generators.overrides.fill(GENERATOR_OVERRIDE_NO_CHANGE_VALUE);
        this.generators.overridesEnabled = false;
    }

    protected setGeneratorOverride(
        gen: GeneratorType,
        value: number,
        realtime = false
    ) {
        this.generators.overrides[gen] = value;
        this.generators.overridesEnabled = true;
        if (realtime) {
            let vc = 0;
            if (this.voiceCount > 0)
                for (const v of this.synthCore.voices) {
                    if (v.channel === this.channel && v.isActive) {
                        v.generators[gen] = value;
                        this.computeModulators(v);
                        if (++vc >= this.voiceCount) break; // We already checked all the voices
                    }
                }
        }
    }

    protected resetGeneratorOffsets() {
        this.generators.offsets.fill(0);
        this.generators.offsetsEnabled = false;
    }

    protected setGeneratorOffset(gen: GeneratorType, value: number) {
        this.generators.offsets[gen] = value * GeneratorLimits[gen].nrpn;
        this.generators.offsetsEnabled = true;
        let vc = 0;
        if (this.voiceCount > 0)
            for (const v of this.synthCore.voices) {
                if (v.channel === this.channel && v.isActive) {
                    this.computeModulators(v);
                    if (++vc >= this.voiceCount) break; // We already checked all the voices
                }
            }
    }

    protected resetDrumParams() {
        if (this.synthCore.systemParameters.drumLock || !this.drumChannel)
            return;
        for (let i = 0; i < 128; i++) {
            const p = this.drumParams[i];
            p.pitch = 0;
            p.gain = 1;
            p.exclusiveClass = 0;
            p.pan = 64;
            p.reverbGain = DEFAULT_DRUM_REVERB[i] / 127;
            p.chorusGain =
                this.channelSystem === "xg" ? DEFAULT_DRUM_REVERB[i] / 127 : 0; // Mirror reverb on XG only, GS has no chorus by default
            p.delayGain = 0; // No drums have delay
            p.rxNoteOn = true;
            p.rxNoteOff = false;
        }
    }

    protected resetVibratoParams() {
        if (
            this._systemParameters.customVibratoLock ??
            this.synthCore.systemParameters.customVibratoLock
        )
            return;
        this.vibrato.rate = 0;
        this.vibrato.depth = 0;
        this.vibrato.delay = 0;
    }

    protected computeModulatorsAll(
        sourceUsesCC: -1 | 0 | 1,
        sourceIndex: number
    ) {
        let vc = 0;
        if (this.voiceCount > 0)
            for (const v of this.synthCore.voices) {
                if (v.channel === this.channel && v.isActive) {
                    this.computeModulators(v, sourceUsesCC, sourceIndex);
                    if (++vc >= this.voiceCount) break; // We already checked all the voices
                }
            }
    }

    protected setBankMSB(bankMSB: number) {
        if (this._systemParameters.presetLock) return;
        this.patch.bankMSB = bankMSB;
    }

    protected setBankLSB(bankLSB: number) {
        if (this._systemParameters.presetLock) return;
        this.patch.bankLSB = bankLSB;
    }

    /**
     * Sets drums on channel.
     */
    protected setDrumFlag(isDrum: boolean) {
        if (
            this._systemParameters.presetLock ||
            !this.preset ||
            this.drumChannel === isDrum
        )
            return;

        if (isDrum) {
            // Clear transpose
            this.keyShift(0, false);
            this.drumChannel = true;
        } else {
            this.drumChannel = false;
        }
    }

    protected addDefaultVibrato() {
        if (
            this.vibrato.delay === 0 &&
            this.vibrato.rate === 0 &&
            this.vibrato.depth === 0
        ) {
            this.vibrato.depth = 50;
            this.vibrato.rate = 8;
            this.vibrato.delay = 0.6;
        }
    }
}
