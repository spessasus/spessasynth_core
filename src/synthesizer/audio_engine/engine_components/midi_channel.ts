import {
    CONTROLLER_TABLE_SIZE,
    CUSTOM_CONTROLLER_TABLE_SIZE,
    NON_CC_INDEX_OFFSET
} from "./controller_tables";
import {
    resetControllers,
    resetControllersRP15Compliant,
    resetParameters,
    resetPreset
} from "../engine_methods/controller_control/reset_controllers";
import { renderVoice } from "./dsp_chain/render_voice";
import { dataEntryFine } from "../engine_methods/controller_control/data_entry/data_entry_fine";
import { controllerChange } from "../engine_methods/controller_control/controller_change";
import { dataEntryCoarse } from "../engine_methods/controller_control/data_entry/data_entry_coarse";
import { noteOn } from "../engine_methods/note_on";
import { noteOff } from "../engine_methods/stopping_notes/note_off";
import { programChange } from "../engine_methods/program_change";
import {
    DEFAULT_PERCUSSION,
    GENERATOR_OVERRIDE_NO_CHANGE_VALUE
} from "./synth_constants";
import { DynamicModulatorSystem } from "./dynamic_modulator_system";
import { computeModulators } from "./compute_modulator";
import {
    generatorLimits,
    GENERATORS_AMOUNT,
    type GeneratorType
} from "../../../soundbank/basic_soundbank/generator_types";
import type { BasicPreset } from "../../../soundbank/basic_soundbank/basic_preset";
import type { ChannelProperty, SynthSystem } from "../../types";
import {
    type CustomController,
    customControllers,
    type DataEntryState,
    dataEntryStates
} from "../../enums";
import { SpessaSynthInfo } from "../../../utils/loggin";
import { consoleColors } from "../../../utils/other";
import type { SynthesizerCore } from "../synthesizer_core";
import { modulatorSources } from "../../../soundbank/enums";
import type { MIDIPatch } from "../../../soundbank/basic_soundbank/midi_patch";
import { BankSelectHacks } from "../../../utils/midi_hacks";

/**
 * This class represents a single MIDI Channel within the synthesizer.
 */
export class MIDIChannel {
    /*
     * An array of MIDI controllers for the channel.
     * This array is used to store the state of various MIDI controllers
     * such as volume, pan, modulation, etc.
     * @remarks
     * A bit of an explanation:
     * The controller table is stored as an int16 array, it stores 14-bit values.
     * This controller table is then extended with the modulatorSources section,
     * for example, pitch range and pitch range depth.
     * This allows us for precise control range and supports full pitch-wheel resolution.
     */
    public readonly midiControllers: Int16Array = new Int16Array(
        CONTROLLER_TABLE_SIZE
    );

    /**
     * An array indicating if a controller, at the equivalent index in the midiControllers array, is locked
     * (i.e., not allowed changing).
     * A locked controller cannot be modified.
     */
    public lockedControllers: boolean[] = new Array(CONTROLLER_TABLE_SIZE).fill(
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
     * Note that this may be undefined in some cases
     * https://github.com/spessasus/spessasynth_core/issues/48
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
     * If the channel is in the poly mode.
     * True - POLY ON - regular playback.
     * False - MONO ON - one note per channel, others are killed on note-on
     */
    public polyMode = true;

    /**
     * Channel's current voice count
     */
    public voiceCount = 0;
    /**
     * The channel's number (0-based index)
     */
    public readonly channel: number;
    /**
     * Core synthesis engine.
     */
    public synthCore: SynthesizerCore;
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
    // Voice rendering methods
    public readonly renderVoice = renderVoice.bind(this);
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
    protected readonly computeModulators = computeModulators.bind(this);
    /**
     * For tracking voice count changes
     * @private
     */
    private previousVoiceCount = 0;

    /**
     * Constructs a new MIDI channel.
     */
    public constructor(
        synthProps: SynthesizerCore,
        preset: BasicPreset | undefined,
        channelNumber: number
    ) {
        this.synthCore = synthProps;
        this.preset = preset;
        this.channel = channelNumber;
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

    protected get channelSystem(): SynthSystem {
        return this.lockPreset
            ? this.lockedSystem
            : this.synthCore.masterParameters.midiSystem;
    }

    public clearVoiceCount() {
        this.previousVoiceCount = this.voiceCount;
        this.voiceCount = 0;
    }

    public updateVoiceCount() {
        if (this.voiceCount !== this.previousVoiceCount) {
            this.sendChannelProperty();
        }
    }

    /**
     * Transposes the channel by given amount of semitones.
     * @param semitones The number of semitones to transpose the channel by. Can be decimal.
     * @param force Defaults to false, if true, it will force the transpose even if the channel is a drum channel.
     */
    public transposeChannel(semitones: number, force = false) {
        if (!this.drumChannel) {
            semitones += this.synthCore.masterParameters.transposition;
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
            `%cChannel ${this.channel} modulation depth. Cents: %c${cents}`,
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
            `%cFine tuning for %c${this.channel}%c is now set to %c${cents}%c cents.`,
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
     */
    public pitchWheel(pitch: number) {
        if (
            this.lockedControllers[
                NON_CC_INDEX_OFFSET + modulatorSources.pitchWheel
            ]
        ) {
            return;
        }
        this.synthCore.callEvent("pitchWheel", {
            channel: this.channel,
            pitch
        });
        this.midiControllers[
            NON_CC_INDEX_OFFSET + modulatorSources.pitchWheel
        ] = pitch;
        this.computeModulatorsAll(0, modulatorSources.pitchWheel);
        this.sendChannelProperty();
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
        this.computeModulatorsAll(0, modulatorSources.channelPressure);

        this.synthCore.callEvent("channelPressure", {
            channel: this.channel,
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
        let vc = 0;
        if (this.voiceCount > 0)
            for (const v of this.synthCore.voices) {
                if (
                    v.isActive &&
                    v.channel === this.channel &&
                    v.midiNote === midiNote
                ) {
                    v.pressure = pressure;
                    this.computeModulators(v, 0, modulatorSources.polyPressure);
                    if (++vc >= this.voiceCount) break; // We already checked all the voices
                }
            }
        this.synthCore.callEvent("polyPressure", {
            channel: this.channel,
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
     * Locks or unlocks the preset from MIDI program changes.
     * @param locked If the preset should be locked.
     */
    public setPresetLock(locked: boolean) {
        if (this.lockPreset === locked) {
            return;
        }
        this.lockPreset = locked;
        if (locked) {
            this.lockedSystem = this.synthCore.masterParameters.midiSystem;
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

    public resetGeneratorOffsets() {
        this.generatorOffsets.fill(0);
        this.generatorOffsetsEnabled = false;
    }

    public setGeneratorOffset(gen: GeneratorType, value: number) {
        this.generatorOffsets[gen] = value * generatorLimits[gen].nrpn;
        this.generatorOffsetsEnabled = true;
        let vc = 0;
        if (this.voiceCount > 0)
            for (const v of this.synthCore.voices) {
                if (v.channel === this.channel && v.isActive) {
                    this.computeModulators(v);
                    if (++vc >= this.voiceCount) break; // We already checked all the voices
                }
            }
    }

    /**
     * Stops a note nearly instantly.
     * @param midiNote The note to stop.
     * @param releaseTime in timecents, defaults to -12000 (very short release).
     */
    public killNote(midiNote: number, releaseTime = -12_000) {
        // Adjust midiNote by channel key shift
        midiNote += this.customControllers[customControllers.channelKeyShift];

        let vc = 0;
        if (this.voiceCount > 0)
            for (const v of this.synthCore.voices) {
                if (
                    v.channel === this.channel &&
                    v.isActive &&
                    v.realKey === midiNote
                ) {
                    v.overrideReleaseVolEnv = releaseTime; // Set release to be very short
                    v.isInRelease = false; // Force release again
                    v.releaseVoice(this.synthCore.currentTime);
                    if (++vc >= this.voiceCount) break; // We already checked all the voices
                }
            }
    }

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
            this.updateVoiceCount();
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
     * Mutes or unmutes a channel.
     * @param isMuted If the channel should be muted.
     */
    public muteChannel(isMuted: boolean) {
        if (isMuted) {
            this.stopAllNotes(true);
        }
        this._isMuted = isMuted;
        this.sendChannelProperty();
        this.synthCore.callEvent("muteChannel", {
            channel: this.channel,
            isMuted: isMuted
        });
    }

    /**
     * Sends this channel's property
     */
    public sendChannelProperty() {
        if (!this.synthCore.enableEventSystem) {
            return;
        }
        const data: ChannelProperty = {
            voicesAmount: this.voiceCount,
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
        this.synthCore.callEvent("channelPropertyChange", {
            channel: this.channel,
            property: data
        });
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
        this.synthCore.callEvent("drumChange", {
            channel: this.channel,
            isDrumChannel: this.drumChannel
        });
    }
}
