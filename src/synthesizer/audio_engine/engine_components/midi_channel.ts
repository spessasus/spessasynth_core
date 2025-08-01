import {
    CONTROLLER_TABLE_SIZE,
    CUSTOM_CONTROLLER_TABLE_SIZE,
    NON_CC_INDEX_OFFSET
} from "./controller_tables";
import {
    resetControllers,
    resetControllersRP15Compliant,
    resetParameters
} from "../engine_methods/controller_control/reset_controllers";
import { renderVoice } from "./dsp_chain/render_voice";
import { panAndMixVoice } from "./dsp_chain/stereo_panner";
import { dataEntryFine } from "../engine_methods/controller_control/data_entry/data_entry_fine";
import { controllerChange } from "../engine_methods/controller_control/controller_change";
import { dataEntryCoarse } from "../engine_methods/controller_control/data_entry/data_entry_coarse";
import { noteOn } from "../engine_methods/note_on";
import { noteOff } from "../engine_methods/stopping_notes/note_off";
import { programChange } from "../engine_methods/program_change";
import {
    chooseBank,
    isSystemXG,
    parseBankSelect
} from "../../../utils/xg_hacks";
import {
    DEFAULT_PERCUSSION,
    GENERATOR_OVERRIDE_NO_CHANGE_VALUE
} from "./synth_constants";
import { DynamicModulatorSystem } from "./dynamic_modulator_system";
import { computeModulators } from "./compute_modulator";
import {
    generatorLimits,
    GENERATORS_AMOUNT,
    type GeneratorType,
    generatorTypes
} from "../../../soundbank/basic_soundbank/generator_types";
import type { BasicPreset } from "../../../soundbank/basic_soundbank/basic_preset";
import type { ChannelProperty, SynthSystem, VoiceList } from "../../types";
import type { SpessaSynthProcessor } from "../../processor";
import {
    type CustomController,
    customControllers,
    type DataEntryState,
    dataEntryStates
} from "../../enums";
import { SpessaSynthInfo } from "../../../utils/loggin";
import { consoleColors } from "../../../utils/other";
import type { ProtectedSynthValues } from "./internal_synth_values";
import { midiControllers } from "../../../midi/enums";
import { modulatorSources } from "../../../soundbank/enums";

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
     * Indicates whether the sustain (hold) pedal is active.
     */
    public holdPedal = false;
    /**
     * Indicates whether this channel is a drum channel.
     */
    public drumChannel = false;
    /**
     * If greater than 0, overrides the velocity value for the channel, otherwise it's disabled.
     */
    public velocityOverride = 0;
    /**
     * Enables random panning for every note played on this channel.
     */
    public randomPan = false;
    /**
     * The current state of the data entry for the channel.
     */
    public dataEntryState: DataEntryState = dataEntryStates.Idle;
    /**
     * The bank number of the channel (used for patch changes).
     */
    public bank = 0;
    /**
     * The bank number sent as channel properties.
     */
    public sentBank = 0;
    /**
     * The bank LSB number of the channel (used for patch changes in XG mode).
     */
    public bankLSB = 0;
    /**
     * The preset currently assigned to the channel.
     */
    public preset: BasicPreset | undefined = undefined;
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
     * Indicates whether the channel is muted.
     */
    public isMuted = false;
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
    public noteOn = noteOn.bind(this);
    public noteOff = noteOff.bind(this);
    public programChange = programChange.bind(this);
    // CC (Continuous Controller)
    public controllerChange = controllerChange.bind(this);
    public resetControllers = resetControllers.bind(this);

    // Bind all methods to the instance
    // (A hacky way to split the class into multiple files)
    public resetControllersRP15Compliant =
        resetControllersRP15Compliant.bind(this);
    public resetParameters = resetParameters.bind(this);
    public dataEntryFine = dataEntryFine.bind(this);
    public dataEntryCoarse = dataEntryCoarse.bind(this);
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

    public get isXGChannel() {
        return (
            isSystemXG(this.synthProps.masterParameters.midiSystem) ||
            (this.lockPreset && isSystemXG(this.lockedSystem))
        );
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
            // stop all (and emit cc change)
            this.controllerChange(midiControllers.allNotesOff, 127);
        }
        // apply transpose
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
     * @param MSB The SECOND byte of the MIDI pitchWheel message.
     * @param LSB The FIRST byte of the MIDI pitchWheel message.
     */
    public pitchWheel(MSB: number, LSB: number) {
        if (
            this.lockedControllers[
                NON_CC_INDEX_OFFSET + modulatorSources.pitchWheel
            ]
        ) {
            return;
        }
        const bend = LSB | (MSB << 7);
        this.synthProps.callEvent("pitchWheel", {
            channel: this.channelNumber,
            MSB: MSB,
            LSB: LSB
        });
        this.midiControllers[
            NON_CC_INDEX_OFFSET + modulatorSources.pitchWheel
        ] = bend;
        this.voices.forEach((v) =>
            // compute pitch modulators
            this.computeModulators(v, 0, modulatorSources.pitchWheel)
        );
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
            this.customControllers[customControllers.channelTransposeFine] + // user tuning (transpose)
            this.customControllers[customControllers.masterTuning] + // master tuning, set by sysEx
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

    public setPresetLock(locked: boolean) {
        this.lockPreset = locked;
        if (locked) {
            this.lockedSystem = this.synthProps.masterParameters.midiSystem;
        }
    }

    public setBankSelect(bank: number, isLSB = false) {
        if (this.lockPreset) {
            return;
        }
        if (isLSB) {
            this.bankLSB = bank;
        } else {
            this.bank = bank;
            const bankLogic = parseBankSelect(
                this.getBankSelect(),
                bank,
                this.synthProps.masterParameters.midiSystem,
                false,
                this.drumChannel,
                this.channelNumber
            );
            switch (bankLogic.drumsStatus) {
                default:
                case 0:
                    break;

                case 1:
                    if (this.channelNumber % 16 === DEFAULT_PERCUSSION) {
                        // cannot disable drums on channel 9
                        this.bank = 127;
                    }
                    break;

                case 2:
                    this.setDrums(true);
                    break;
            }
        }
    }

    public getBankSelect(): number {
        return chooseBank(
            this.bank,
            this.bankLSB,
            this.drumChannel,
            this.isXGChannel
        );
    }

    /**
     * Changes a preset of this channel.
     */
    public setPreset(preset: BasicPreset) {
        if (this.lockPreset) {
            return;
        }
        this.preset = preset;
    }

    /**
     * Sets drums on channel.
     */
    public setDrums(isDrum: boolean) {
        if (this.lockPreset || !this.preset) {
            return;
        }
        if (this.drumChannel === isDrum) {
            return;
        }
        if (isDrum) {
            // clear transpose
            this.channelTransposeKeyShift = 0;
            this.drumChannel = true;
        } else {
            this.drumChannel = false;
        }
        this.synthProps.callEvent("drumChange", {
            channel: this.channelNumber,
            isDrumChannel: this.drumChannel
        });
        this.programChange(this.preset.program);
        this.sendChannelProperty();
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Sets a custom vibrato.
     * @param depth cents.
     * @param rate Hz.
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
     * Yes.
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
        // adjust midiNote by channel key shift
        midiNote += this.customControllers[customControllers.channelKeyShift];

        this.voices.forEach((v) => {
            if (v.realKey !== midiNote) {
                return;
            }
            v.modulatedGenerators[generatorTypes.releaseVolEnv] = releaseTime; // set release to be very short
            v.release(this.synth.currentSynthTime);
        });
    }

    /**
     * Stops all notes on the channel.
     * @param force If true, stops all notes immediately, otherwise applies release time.
     */
    public stopAllNotes(force = false) {
        if (force) {
            // force stop all
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
    }

    public muteChannel(isMuted: boolean) {
        if (isMuted) {
            this.stopAllNotes(true);
        }
        this.isMuted = isMuted;
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
            pitchBend:
                this.midiControllers[
                    NON_CC_INDEX_OFFSET + modulatorSources.pitchWheel
                ],
            pitchBendRangeSemitones:
                this.midiControllers[
                    NON_CC_INDEX_OFFSET + modulatorSources.pitchWheelRange
                ] / 128,
            isMuted: this.isMuted,
            isDrum: this.drumChannel,
            transposition:
                this.channelTransposeKeyShift +
                this.customControllers[customControllers.channelTransposeFine] /
                    100,
            bank: this.sentBank,
            program: this.preset?.program ?? 0
        };
        this.synthProps.callEvent("channelPropertyChange", {
            channel: this.channelNumber,
            property: data
        });
    }
}
