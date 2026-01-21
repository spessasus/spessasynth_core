import { CONTROLLER_TABLE_SIZE, CUSTOM_CONTROLLER_TABLE_SIZE, NON_CC_INDEX_OFFSET } from "./controller_tables";
import {
    resetControllers,
    resetControllersRP15Compliant,
    resetParameters,
    resetPreset
} from "../engine_methods/controller_control/reset_controllers";
import { renderVoice } from "./dsp_chain/render_voice";
import { panAndMixVoice } from "./dsp_chain/stereo_panner";
import { dataEntryFine } from "../engine_methods/controller_control/data_entry/data_entry_fine";
import { controllerChange } from "../engine_methods/controller_control/controller_change";
import { dataEntryCoarse } from "../engine_methods/controller_control/data_entry/data_entry_coarse";
import { noteOn } from "../engine_methods/note_on";
import { noteOff } from "../engine_methods/stopping_notes/note_off";
import { programChange } from "../engine_methods/program_change";
import { DEFAULT_PERCUSSION, GENERATOR_OVERRIDE_NO_CHANGE_VALUE } from "./synth_constants";
import { DynamicModulatorSystem } from "./dynamic_modulator_system";
import { computeModulator, computeModulators } from "./compute_modulator";
import {
    generatorLimits,
    GENERATORS_AMOUNT,
    type GeneratorType,
    generatorTypes
} from "../../../soundbank/basic_soundbank/generator_types";
import type { BasicPreset } from "../../../soundbank/basic_soundbank/basic_preset";
import type { ChannelProperty, SynthSystem, VoiceList } from "../../types";
import type { SpessaSynthProcessor } from "../../processor";
import { type CustomController, customControllers, type DataEntryState, dataEntryStates } from "../../enums";
import { SpessaSynthInfo } from "../../../utils/loggin";
import { consoleColors } from "../../../utils/other";
import type { ProtectedSynthValues } from "./internal_synth_values";
import { midiControllers } from "../../../midi/enums";
import { modulatorSources } from "../../../soundbank/enums";
import type { MIDIPatch } from "../../../soundbank/basic_soundbank/midi_patch";
import { BankSelectHacks } from "../../../utils/midi_hacks";

/**
 * This class represents a single MIDI Channel within the synthesizer.
 */
export class MIDIChannel {
    /**
     * An array of MIDI controllers for the channel.
     * This array is used to store the state of various MIDI controllers
     * such as volume, pan, modulation, etc.
     * @remarks
     * A bit of an explanation:
     * The controller table is stored as an int16 array, it stores 14-bit values.
     * This controller table is then extended with the modulatorSources section,
     * for example, and pitch wheel depth.
     * This allows us for precise control range and supports full 14-bit controller resolution.
     * Note that the pitch wheel is unused as the "pichWheels" array contains per-note pitch wheels.
     */
    public readonly midiControllers: Int16Array = new Int16Array(
        CONTROLLER_TABLE_SIZE
    );

    /**
     * An array for the MIDI 2.0 Per-note pitch wheels.
     */
    public readonly pitchWheels = new Int16Array(128);

    /**
     * An array indicating if a controller, at the equivalent index in the midiControllers array, is locked
     * (i.e., not allowed changing).
     * A locked controller cannot be modified.
     */
    public lockedControllers: boolean[] = Array(CONTROLLER_TABLE_SIZE).fill(
        false
    ) as boolean[];

    /**
     * An array of custom (non-SF2) control values such as RPN pitch tuning, transpose, modulation depth, etc.
     * Refer to controller_tables.ts for the index definitions.
     */
    public readonly customControllers: Float32Array = new Float32Array(
        CUSTOM_CONTROLLER_TABLE_SIZE
    );

    /**
     * The key shift of the channel (in semitones).
     */
    public channelTransposeKeyShift = 0;

    /**
     * An array of octave tuning values for each note on the channel.
     * Each index corresponds to a note (0 = C, 1 = C#, ..., 11 = B).
     * Note: Repeated every 12 notes.
     */
    public channelOctaveTuning: Int8Array = new Int8Array(128);
    /**
     * A system for dynamic modulator assignment for advanced system exclusives.
     */
    public sysExModulators: DynamicModulatorSystem =
        new DynamicModulatorSystem();
    /**
     * Indicates whether this channel is a drum channel.
     */
    public drumChannel = false;
    /**
     * Enables random panning for every note played on this channel.
     */
    public randomPan = false;
    /**
     * The current state of the data entry for the channel.
     */
    public dataEntryState: DataEntryState = dataEntryStates.Idle;

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
     */
    public preset?: BasicPreset;
    /**
     * Indicates whether the program on this channel is locked.
     */
    public lockPreset = false;
    /**
     * Indicates the MIDI system when the preset was locked.
     */
    public lockedSystem: SynthSystem = "gs";
    /**
     * Indicates whether the GS NRPN parameters are enabled for this channel.
     */
    public lockGSNRPNParams = false;
    /**
     * The vibrato settings for the channel.
     * @property depth - Depth of the vibrato effect in cents.
     * @property delay - Delay before the vibrato effect starts (in seconds).
     * @property rate - Rate of the vibrato oscillation (in Hz).
     */
    public channelVibrato: { delay: number; depth: number; rate: number } = {
        delay: 0,
        depth: 0,
        rate: 0
    };
    /**
     * An array of voices currently active on the channel.
     */
    public voices: VoiceList = [];
    /**
     * An array of voices that are sustained on the channel.
     */
    public sustainedVoices: VoiceList = [];
    /**
     * The channel's number (0-based index)
     */
    public readonly channelNumber: number;
    /**
     * Parent processor instance.
     */
    public synth: SpessaSynthProcessor;
    /**
     * Grants access to protected synth values.
     */
    public synthProps: ProtectedSynthValues;
    // MIDI messages
    /**
     * Sends a "MIDI Note on" message and starts a note.
     * @param midiNote The MIDI note number (0-127).
     * @param velocity The velocity of the note (0-127). If less than 1, it will send a note off instead.
     */
    public noteOn = noteOn.bind(this) as typeof noteOn;
    // (A hacky way to split the class into multiple files)
    /**
     * Releases a note by its MIDI note number.
     * If the note is in high performance mode and the channel is not a drum channel,
     * it kills the note instead of releasing it.
     * @param midiNote The MIDI note number to release (0-127).
     */
    public noteOff = noteOff.bind(this) as typeof noteOff;
    // Bind all methods to the instance
    /**
     * Changes the program (preset) of the channel.
     * @param programNumber The program number (0-127) to change to.
     */
    public programChange = programChange.bind(this) as typeof programChange;
    // CC (Continuous Controller)
    public controllerChange = controllerChange.bind(
        this
    ) as typeof controllerChange;
    /**
     * Reset all controllers for channel.
     * This will reset all controllers to their default values,
     * except for the locked controllers.
     */
    public readonly resetControllers = resetControllers.bind(
        this
    ) as typeof resetControllers;
    public readonly resetPreset = resetPreset.bind(this) as typeof resetPreset;
    /**
     * https://amei.or.jp/midistandardcommittee/Recommended_Practice/e/rp15.pdf
     * Reset controllers according to RP-15 Recommended Practice.
     */
    public readonly resetControllersRP15Compliant =
        resetControllersRP15Compliant.bind(
            this
        ) as typeof resetControllersRP15Compliant;
    /**
     * Reset all parameters to their default values.
     * This includes NRPN and RPN controllers, data entry state,
     * and generator overrides and offsets.
     */
    public resetParameters = resetParameters.bind(
        this
    ) as typeof resetParameters;
    /**
     * Executes a data entry fine (LSB) change for the current channel.
     * @param dataValue The value to set for the data entry fine controller (0-127).
     */
    public dataEntryFine = dataEntryFine.bind(this) as typeof dataEntryFine;
    /**
     * Executes a data entry coarse (MSB) change for the current channel.
     * @param dataValue The value to set for the data entry coarse controller (0-127).
     */
    public dataEntryCoarse = dataEntryCoarse.bind(
        this
    ) as typeof dataEntryCoarse;
    /**
     * Will be updated every time something tuning-related gets changed.
     * This is used to avoid a big addition for every voice rendering call.
     */
    protected channelTuningCents = 0;
    /**
     * An array of offsets generators for SF2 nrpn support.
     * A value of 0 means no change; -10 means 10 lower, etc.
     */
    protected generatorOffsets: Int16Array = new Int16Array(GENERATORS_AMOUNT);
    // Tuning
    /**
     * A small optimization that disables applying offsets until at least one is set.
     */
    protected generatorOffsetsEnabled = false;
    /**
     * An array of override generators for AWE32 support.
     * A value of 32,767 means unchanged, as it is not allowed anywhere.
     */
    protected generatorOverrides: Int16Array = new Int16Array(
        GENERATORS_AMOUNT
    );
    /**
     * A small optimization that disables applying overrides until at least one is set.
     */
    protected generatorOverridesEnabled = false;
    // Voice rendering methods
    protected renderVoice = renderVoice.bind(this);
    protected panAndMixVoice = panAndMixVoice.bind(this);
    protected computeModulators = computeModulators.bind(this);
    protected computeModulator = computeModulator.bind(this);

    /**
     * Constructs a new MIDI channel.
     */
    public constructor(
        synth: SpessaSynthProcessor,
        synthProps: ProtectedSynthValues,
        preset: BasicPreset | undefined,
        channelNumber: number
    ) {
        this.synth = synth;
        this.synthProps = synthProps;
        this.preset = preset;
        this.channelNumber = channelNumber;
        this.resetGeneratorOverrides();
        this.resetGeneratorOffsets();
    }

    /**
     * Indicates whether the channel is muted.
     */
    protected _isMuted = false;

    /**
     * Indicates whether the channel is muted.
     */
    public get isMuted() {
        return this._isMuted;
    }

    /**
     * Indicates whether the sustain (hold) pedal is active.
     */
    public get holdPedal() {
        // 64 << 7 = 8192
        return this.midiControllers[midiControllers.sustainPedal] >= 8192;
    }

    protected get channelSystem(): SynthSystem {
        return this.lockPreset
            ? this.lockedSystem
            : this.synthProps.masterParameters.midiSystem;
    }

    /**
     * Transposes the channel by given amount of semitones.
     * @param semitones The number of semitones to transpose the channel by. Can be decimal.
     * @param force Defaults to false, if true, it will force the transpose even if the channel is a drum channel.
     */
    public transposeChannel(semitones: number, force = false) {
        if (!this.drumChannel) {
            semitones += this.synthProps.masterParameters.transposition;
        }
        const keyShift = Math.trunc(semitones);
        const currentTranspose =
            this.channelTransposeKeyShift +
            this.customControllers[customControllers.channelTransposeFine] /
                100;
        if ((this.drumChannel && !force) || semitones === currentTranspose) {
            return;
        }
        if (keyShift !== this.channelTransposeKeyShift) {
            // Stop all
            this.stopAllNotes();
        }
        // Apply transpose
        this.channelTransposeKeyShift = keyShift;
        this.setCustomController(
            customControllers.channelTransposeFine,
            (semitones - keyShift) * 100
        );
        this.sendChannelProperty();
    }

    /**
     * Sets the octave tuning for a given channel.
     * @param tuning The tuning array of 12 values, each representing the tuning for a note in the octave.
     * @remarks
     * Cent tunings are relative.
     */
    public setOctaveTuning(tuning: Int8Array) {
        if (tuning.length !== 12) {
            throw new Error("Tuning is not the length of 12.");
        }
        this.channelOctaveTuning = new Int8Array(128);
        for (let i = 0; i < 128; i++) {
            this.channelOctaveTuning[i] = tuning[i % 12];
        }
    }

    /**
     * Sets the modulation depth for the channel.
     * @param cents The modulation depth in cents to set.
     * @remarks
     * This method sets the modulation depth for the channel by converting the given cents value into a
     * multiplier. The MIDI specification assumes the default modulation depth is 50 cents,
     * but it may vary for different sound banks.
     * For example, if you want a modulation depth of 100 cents,
     * the multiplier will be 2,
     * which, for a preset with a depth of 50,
     * will create a total modulation depth of 100 cents.
     *
     */
    public setModulationDepth(cents: number) {
        cents = Math.round(cents);
        SpessaSynthInfo(
            `%cChannel ${this.channelNumber} modulation depth. Cents: %c${cents}`,
            consoleColors.info,
            consoleColors.value
        );
        this.setCustomController(
            customControllers.modulationMultiplier,
            cents / 50
        );
    }

    /**
     * Sets the channel's tuning.
     * @param cents The tuning in cents to set.
     * @param log If true, logs the change to the console.
     */
    public setTuning(cents: number, log = true) {
        cents = Math.round(cents);
        this.setCustomController(customControllers.channelTuning, cents);
        if (!log) {
            return;
        }
        SpessaSynthInfo(
            `%cFine tuning for %c${this.channelNumber}%c is now set to %c${cents}%c cents.`,
            consoleColors.info,
            consoleColors.recognized,
            consoleColors.info,
            consoleColors.value,
            consoleColors.info
        );
    }

    /**
     * Sets the pitch of the given channel.
     * @param pitch The pitch (0 - 16384)
     * @param midiNote The MIDI note number, pass -1 to use the channel pitch wheel
     */
    public pitchWheel(pitch: number, midiNote = -1) {
        if (
            this.lockedControllers[
                NON_CC_INDEX_OFFSET + modulatorSources.pitchWheel
            ]
        ) {
            return;
        }
        this.synthProps.callEvent("pitchWheel", {
            channel: this.channelNumber,
            pitch,
            midiNote
        });
        if (midiNote === -1) {
            this.pitchWheels.fill(pitch);
            this.midiControllers[
                NON_CC_INDEX_OFFSET + modulatorSources.pitchWheel
            ] = pitch;
            this.sendChannelProperty();
            for (const v of this.voices)
                // Compute pitch modulators
                this.computeModulators(v, 0, modulatorSources.pitchWheel);
        } else {
            this.pitchWheels[midiNote] = pitch;
            for (const v of this.voices) {
                if (v.realKey !== midiNote) continue;
                // Compute pitch modulators only for the specific note voices
                this.computeModulators(v, 0, modulatorSources.pitchWheel);
            }
        }
    }

    /**
     * Sets the channel pressure (MIDI Aftertouch).
     * @param pressure the pressure of the channel.
     */
    public channelPressure(pressure: number) {
        this.midiControllers[
            NON_CC_INDEX_OFFSET + modulatorSources.channelPressure
        ] = pressure << 7;
        this.updateChannelTuning();
        this.voices.forEach((v) =>
            this.computeModulators(v, 0, modulatorSources.channelPressure)
        );
        this.synthProps.callEvent("channelPressure", {
            channel: this.channelNumber,
            pressure: pressure
        });
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Sets the pressure of the given note on a specific channel.
     * This is used for polyphonic pressure (aftertouch).
     * @param midiNote 0 - 127, the MIDI note number to set the pressure for.
     * @param pressure 0 - 127, the pressure value to set for the note.
     */
    public polyPressure(midiNote: number, pressure: number) {
        this.voices.forEach((v) => {
            if (v.midiNote !== midiNote) {
                return;
            }
            v.pressure = pressure;
            this.computeModulators(v, 0, modulatorSources.polyPressure);
        });
        this.synthProps.callEvent("polyPressure", {
            channel: this.channelNumber,
            midiNote: midiNote,
            pressure: pressure
        });
    }

    public setCustomController(type: CustomController, value: number) {
        this.customControllers[type] = value;
        this.updateChannelTuning();
    }

    public updateChannelTuning() {
        this.channelTuningCents =
            this.customControllers[customControllers.channelTuning] + // RPN channel fine tuning
            this.customControllers[customControllers.channelTransposeFine] + // User tuning (transpose)
            this.customControllers[customControllers.masterTuning] + // Master tuning, set by sysEx
            this.customControllers[customControllers.channelTuningSemitones] *
                100; // RPN channel coarse tuning
    }

    /**
     * Renders Float32 audio for this channel.
     * @param outputLeft the left output buffer.
     * @param outputRight the right output buffer.
     * @param reverbOutputLeft left output for reverb.
     * @param reverbOutputRight right output for reverb.
     * @param chorusOutputLeft left output for chorus.
     * @param chorusOutputRight right output for chorus.
     * @param startIndex start index offset.
     * @param sampleCount sample count to render.
     */
    public renderAudio(
        outputLeft: Float32Array,
        outputRight: Float32Array,
        reverbOutputLeft: Float32Array,
        reverbOutputRight: Float32Array,
        chorusOutputLeft: Float32Array,
        chorusOutputRight: Float32Array,
        startIndex: number,
        sampleCount: number
    ) {
        this.voices = this.voices.filter(
            (v) =>
                !this.renderVoice(
                    v,
                    this.synth.currentSynthTime,
                    outputLeft,
                    outputRight,
                    reverbOutputLeft,
                    reverbOutputRight,
                    chorusOutputLeft,
                    chorusOutputRight,
                    startIndex,
                    sampleCount
                )
        );
    }

    /**
     * Locks or unlocks the preset from MIDI program changes.
     * @param locked If the preset should be locked.
     */
    public setPresetLock(locked: boolean) {
        if (this.lockPreset === locked) {
            return;
        }
        this.lockPreset = locked;
        if (locked) {
            this.lockedSystem = this.synthProps.masterParameters.midiSystem;
        }
    }

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
                if (this.channelNumber % 16 === DEFAULT_PERCUSSION) {
                    throw new Error(
                        `Cannot disable drums on channel ${this.channelNumber} for XG.`
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

    /**
     * Sets the channel to a given MIDI patch.
     * Note that this executes a program change.
     * @param patch The MIDI patch to set the channel to.
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
     */
    public setGSDrums(drums: boolean) {
        if (drums === this.patch.isGMGSDrum) {
            return;
        }
        this.setBankLSB(0);
        this.setBankMSB(0);
        this.patch.isGMGSDrum = drums;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Sets a custom vibrato.
     * @param depth In cents.
     * @param rate In Hertz.
     * @param delay seconds.
     */
    public setVibrato(depth: number, rate: number, delay: number) {
        if (this.lockGSNRPNParams) {
            return;
        }
        this.channelVibrato.rate = rate;
        this.channelVibrato.delay = delay;
        this.channelVibrato.depth = depth;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Disables and locks all GS NPRN parameters, including the custom vibrato.
     */
    public disableAndLockGSNRPN() {
        this.lockGSNRPNParams = true;
        this.channelVibrato.rate = 0;
        this.channelVibrato.delay = 0;
        this.channelVibrato.depth = 0;
    }

    public resetGeneratorOverrides() {
        this.generatorOverrides.fill(GENERATOR_OVERRIDE_NO_CHANGE_VALUE);
        this.generatorOverridesEnabled = false;
    }

    public setGeneratorOverride(
        gen: GeneratorType,
        value: number,
        realtime = false
    ) {
        this.generatorOverrides[gen] = value;
        this.generatorOverridesEnabled = true;
        if (realtime) {
            this.voices.forEach((v) => {
                v.generators[gen] = value;
                this.computeModulators(v);
            });
        }
    }

    public resetGeneratorOffsets() {
        this.generatorOffsets.fill(0);
        this.generatorOffsetsEnabled = false;
    }

    public setGeneratorOffset(gen: GeneratorType, value: number) {
        this.generatorOffsets[gen] = value * generatorLimits[gen].nrpn;
        this.generatorOffsetsEnabled = true;
        this.voices.forEach((v) => {
            this.computeModulators(v);
        });
    }

    /**
     * Stops a note nearly instantly.
     * @param midiNote The note to stop.
     * @param releaseTime in timecents, defaults to -12000 (very short release).
     */
    public killNote(midiNote: number, releaseTime = -12000) {
        // Adjust midiNote by channel key shift
        midiNote += this.customControllers[customControllers.channelKeyShift];

        this.voices.forEach((v) => {
            if (v.realKey !== midiNote) {
                return;
            }
            v.modulatedGenerators[generatorTypes.releaseVolEnv] = releaseTime; // Set release to be very short
            v.release(this.synth.currentSynthTime);
        });
    }

    /**
     * Stops all notes on the channel.
     * @param force If true, stops all notes immediately, otherwise applies release time.
     */
    public stopAllNotes(force = false) {
        if (force) {
            // Force stop all
            this.voices.length = 0;
            this.sustainedVoices.length = 0;
            this.sendChannelProperty();
        } else {
            this.voices.forEach((v) => {
                if (v.isInRelease) {
                    return;
                }
                v.release(this.synth.currentSynthTime);
            });
            this.sustainedVoices.forEach((v) => {
                v.release(this.synth.currentSynthTime);
            });
        }
        this.synthProps.callEvent("stopAll", {
            channel: this.channelNumber,
            force
        });
    }

    /**
     * Mutes or unmutes a channel.
     * @param isMuted If the channel should be muted.
     */
    public muteChannel(isMuted: boolean) {
        if (isMuted) {
            this.stopAllNotes(true);
        }
        this._isMuted = isMuted;
        this.sendChannelProperty();
        this.synthProps.callEvent("muteChannel", {
            channel: this.channelNumber,
            isMuted: isMuted
        });
    }

    /**
     * Sends this channel's property
     */
    public sendChannelProperty() {
        if (!this.synth.enableEventSystem) {
            return;
        }
        const data: ChannelProperty = {
            voicesAmount: this.voices.length,
            pitchWheel:
                this.midiControllers[
                    NON_CC_INDEX_OFFSET + modulatorSources.pitchWheel
                ],
            pitchWheelRange:
                this.midiControllers[
                    NON_CC_INDEX_OFFSET + modulatorSources.pitchWheelRange
                ] / 128,
            isMuted: this.isMuted,
            transposition:
                this.channelTransposeKeyShift +
                this.customControllers[customControllers.channelTransposeFine] /
                    100,
            isDrum: this.drumChannel
        };
        this.synthProps.callEvent("channelPropertyChange", {
            channel: this.channelNumber,
            property: data
        });
    }

    protected setBankMSB(bankMSB: number) {
        if (this.lockPreset) {
            return;
        }
        this.patch.bankMSB = bankMSB;
    }

    protected setBankLSB(bankLSB: number) {
        if (this.lockPreset) {
            return;
        }
        this.patch.bankLSB = bankLSB;
    }

    /**
     * Sets drums on channel.
     */
    protected setDrumFlag(isDrum: boolean) {
        if (this.lockPreset || !this.preset) {
            return;
        }
        if (this.drumChannel === isDrum) {
            return;
        }
        if (isDrum) {
            // Clear transpose
            this.channelTransposeKeyShift = 0;
            this.drumChannel = true;
        } else {
            this.drumChannel = false;
        }
        this.synthProps.callEvent("drumChange", {
            channel: this.channelNumber,
            isDrumChannel: this.drumChannel
        });
    }
}
