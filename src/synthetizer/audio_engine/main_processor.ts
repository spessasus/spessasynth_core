import { SpessaSynthInfo } from "../../utils/loggin.js";
import { consoleColors } from "../../utils/other.js";
import {
    ALL_CHANNELS_OR_DIFFERENT_ACTION,
    DEFAULT_SYNTH_MODE,
    EMBEDDED_SOUND_BANK_ID,
    VOICE_CAP
} from "./synth_constants.js";
import { stbvorbis } from "../../externals/stbvorbis_sync/stbvorbis_wrapper.ts";
import { VOLUME_ENVELOPE_SMOOTHING_FACTOR } from "./engine_components/volume_envelope.js";
import { masterParameterType, setMasterParameter } from "./engine_methods/controller_control/master_parameters.js";
import { SoundFontManager } from "./engine_components/soundfont_manager.js";
import { KeyModifierManager } from "./engine_components/key_modifier_manager.js";
import { PAN_SMOOTHING_FACTOR } from "./engine_components/stereo_panner.js";
import { FILTER_SMOOTHING_FACTOR } from "./engine_components/lowpass_filter.js";
import { getEvent } from "../../midi/midi_message.js";
import { IndexedByteArray } from "../../utils/indexed_array.js";
import { DEFAULT_SYNTH_OPTIONS } from "./synth_processor_options.js";
import { fillWithDefaults } from "../../utils/fill_with_defaults.js";
import { isSystemXG } from "../../utils/xg_hacks.js";
import { voiceKilling } from "./engine_methods/stopping_notes/voice_killing.ts";
import { getVoices, getVoicesForPreset } from "./engine_components/voice.ts";
import { systemExclusive } from "./engine_methods/system_exclusive.ts";
import { MidiAudioChannel } from "./engine_components/midi_audio_channel.ts";
import { resetAllControllers } from "./engine_methods/controller_control/reset_controllers.ts";
import { SynthesizerSnapshot } from "./snapshot/synthesizer_snapshot.ts";
import type { EventCallbackData, EventTypes, MTSProgramTuning, SynthMethodOptions, SynthSystem } from "../types.ts";
import { interpolationTypes } from "../enums.ts";
import { messageTypes } from "../../midi/enums.ts";

/**
 * main_processor.js
 * purpose: the core synthesis engine
 */

const DEFAULT_SYNTH_METHOD_OPTIONS: SynthMethodOptions = {
    time: 0
};

// if the note is released faster than that, it forced to last that long
// this is used mostly for drum channels, where a lot of midis like to send instant note off after a note on
export const MIN_NOTE_LENGTH = 0.03;
// this sounds way nicer for an instant hi-hat cutoff
export const MIN_EXCLUSIVE_LENGTH = 0.07;

export const SYNTHESIZER_GAIN = 1.0;

// the core synthesis engine of spessasynth.
export class SpessaSynthProcessor {
    soundfontManager: SoundFontManager = new SoundFontManager(
        this.updatePresetList.bind(this)
    );
    /**
     * Synth's device id: -1 means all
     */
    deviceID: number = ALL_CHANNELS_OR_DIFFERENT_ACTION;
    /**
     * Interpolation type used
     */
    interpolationType: interpolationTypes = interpolationTypes.fourthOrder;
    /**
     * Global transposition in semitones
     */
    transposition: number = 0;
    /**
     * this.tunings[program][key] = tuning
     */
    tunings: MTSProgramTuning[] = [];
    /**
     * The volume gain, set by user
     * @type {number}
     */
    masterGain: number = SYNTHESIZER_GAIN;
    /**
     * The volume gain, set by MIDI sysEx
     * @type {number}
     */
    midiVolume = 1;
    /**
     * Reverb linear gain
     * @type {number}
     */
    reverbGain = 1;
    /**
     * Chorus linear gain
     * @type {number}
     */
    chorusGain = 1;
    /**
     * Set via system exclusive
     * @type {number}
     */
    reverbSend = 1;
    /**
     * Set via system exclusive
     * @type {number}
     */
    chorusSend = 1;
    /**
     * Maximum number of voices allowed at once
     * @type {number}
     */
    voiceCap = VOICE_CAP;
    /**
     * (-1 to 1)
     * @type {number}
     */
    pan = 0.0;
    /**
     * the pan of the left channel
     * @type {number}
     */
    panLeft = 0.5;
    /**
     * the pan of the right channel
     * @type {number}
     */
    panRight = 0.5;
    /**
     * forces note killing instead of releasing
     * @type {boolean}
     */
    highPerformanceMode = false;
    /**
     * Handlese custom key overrides: velocity and preset
     * @type {KeyModifierManager}
     */
    keyModifierManager = new KeyModifierManager();
    /**
     * contains all the channels with their voices on the processor size
     * @type {MidiAudioChannel[]}
     */
    midiAudioChannels = [];
    /**
     * Controls the bank selection & SysEx
     */
    system: SynthSystem = DEFAULT_SYNTH_MODE;
    /**
     * Current total voices amount
     * @type {number}
     */
    totalVoicesAmount = 0;
    /**
     * Synth's default (reset) preset
     * @type {BasicPreset}
     */
    defaultPreset;
    /**
     * Synth's default (reset) drum preset
     * @type {BasicPreset}
     */
    drumPreset;
    /**
     * Controls if the processor is fully initialized
     * @type {Promise<boolean>}
     */
    processorInitialized = stbvorbis.isInitialized;
    /**
     * Current audio time
     * @type {number}
     */
    currentSynthTime = 0;
    /**
     * in hertz
     * @type {number}
     */
    sampleRate;
    /**
     * Sample time in seconds
     * @type {number}
     */
    sampleTime;
    /**
     * are the chorus and reverb effects enabled?
     * @type {boolean}
     */
    effectsEnabled = true;
    /**
     * one voice per note and track (issue #7)
     */
    _monophonicRetriggerMode = false;
    /**
     * for applying the snapshot after an override sound bank too
     * @type {SynthesizerSnapshot}
     * @private
     */
    _snapshot;
    /**
     * Calls when an event occurs.
     * @type {function}
     * @param {EventTypes} eventType - the event type.
     * @param {EventCallbackData} eventData - the event data.
     */
    onEventCall;
    /**
     * Calls when a channel property is changed.
     * @type {function}
     * @param {ChannelProperty} property - the updated property.
     * @param {number} channelNumber - the channel number of the said property.
     */
    onChannelPropertyChange;
    /**
     * Calls when a master parameter is changed.
     * @type {function}
     * @param {masterParameterType} parameter - the parameter type
     * @param {number|string} value - the new value.
     */
    onMasterParameterChange;
    voiceKilling = voiceKilling.bind(this);
    getVoicesForPreset = getVoicesForPreset.bind(this);
    getVoices = getVoices.bind(this);
    systemExclusive = systemExclusive.bind(this);
    resetAllControllers = resetAllControllers.bind(this);
    setMasterParameter = setMasterParameter.bind(this);
    /**
     * Cached voices for all presets for this synthesizer.
     * Nesting goes like this:
     * this.cachedVoices[bankNumber][programNumber][midiNote][velocity] = a list of voices for that.
     * @type {Voice[][][][][]}
     */
    private cachedVoices: Voice[][][][][] = [];
    /**
     * Synth's event queue from the main thread
     */
    private eventQueue: { callback: () => unknown; time: number }[] = [];
    private readonly midiOutputsCount: number;
    private enableEventSystem: boolean;

    /**
     * Creates a new synthesizer engine.
     * @param sampleRate {number} - sample rate, in Hertz.
     * @param options {SynthProcessorOptions} - the processor's options.
     */
    constructor(sampleRate, options = DEFAULT_SYNTH_OPTIONS) {
        options = fillWithDefaults(options, DEFAULT_SYNTH_OPTIONS);
        /**
         * Midi output count
         * @type {number}
         */
        this.midiOutputsCount = options.midiChannels;
        this.effectsEnabled = options.effectsEnabled;
        this.enableEventSystem = options.enableEventSystem;
        this.currentSynthTime = options.initialTime;
        this.sampleTime = 1 / sampleRate;
        this.sampleRate = sampleRate;

        // these smoothing factors were tested on 44,100 Hz, adjust them to target sample rate here
        this.volumeEnvelopeSmoothingFactor =
            VOLUME_ENVELOPE_SMOOTHING_FACTOR * (44100 / sampleRate);
        this.panSmoothingFactor = PAN_SMOOTHING_FACTOR * (44100 / sampleRate);
        this.filterSmoothingFactor =
            FILTER_SMOOTHING_FACTOR * (44100 / sampleRate);

        for (let i = 0; i < 128; i++) {
            this.tunings.push([]);
        }

        for (let i = 0; i < this.midiOutputsCount; i++) {
            this.createMidiChannel(false);
        }
        this.processorInitialized.then(() => {
            SpessaSynthInfo(
                "%cSpessaSynth is ready!",
                consoleColors.recognized
            );
        });
    }

    get currentGain(): number {
        return this.masterGain * this.midiVolume;
    }

    /**
     * Applies the snapshot to the synth
     */
    applySynthesizerSnapshot(snapshot: SynthesizerSnapshot) {
        this._snapshot = snapshot;
        SynthesizerSnapshot.applySnapshot(this, snapshot);
        SpessaSynthInfo("%cFinished applying snapshot!", consoleColors.info);
        this.resetAllControllers();
    }

    getSynthesizerSnapshot(): SynthesizerSnapshot {
        return SynthesizerSnapshot.createSynthesizerSnapshot(this);
    }

    updatePresetList() {
        /**
         * @type {{bank: number, presetName: string, program: number}[]}
         */
        const mainFont = this.soundfontManager.getPresetList();
        this.clearCache();
        this.callEvent("presetlistchange", mainFont);
        this.getDefaultPresets();
        // unlock presets
        this.midiAudioChannels.forEach((c) => {
            c.setPresetLock(false);
        });
        this.resetAllControllers(false);
    }

    /**
     * Sets the embedded (RMI soundfont)
     * @param font {ArrayBuffer}
     * @param offset {number}
     * @this {SpessaSynthProcessor}
     */
    setEmbeddedSoundFont(font, offset) {
        // the embedded bank is set as the first bank in the manager,
        // with a special ID that does not clear when reloadManager is performed.
        const loadedFont = loadSoundFont(font);
        this.soundfontManager.addNewSoundFont(
            loadedFont,
            EMBEDDED_SOUND_BANK_ID,
            offset
        );
        // rearrange so the embedded is first (most important as it overrides all others)
        const order = this.soundfontManager.getCurrentSoundFontOrder();
        order.pop();
        order.unshift(EMBEDDED_SOUND_BANK_ID);
        this.soundfontManager.rearrangeSoundFonts(order);

        // apply snapshot again if applicable
        if (this._snapshot !== undefined) {
            this.applySynthesizerSnapshot(this._snapshot);
        }
        SpessaSynthInfo(
            `%cEmbedded sound bank set at offset %c${offset}`,
            consoleColors.recognized,
            consoleColors.value
        );
    }

    clearEmbeddedBank() {
        if (
            this.soundfontManager.soundfontList.some(
                (s) => s.id === EMBEDDED_SOUND_BANK_ID
            )
        ) {
            this.soundfontManager.deleteSoundFont(EMBEDDED_SOUND_BANK_ID);
        }
    }

    /**
     * Sets the synth's primary tuning
     * @this {SpessaSynthProcessor}
     * @param cents {number}
     */
    setMasterTuning(cents) {
        cents = Math.round(cents);
        for (let i = 0; i < this.midiAudioChannels.length; i++) {
            this.midiAudioChannels[i].setCustomController(
                customControllers.masterTuning,
                cents
            );
        }
    }

    /**
     * Transposes all channels by given amount of semitones
     * @this {SpessaSynthProcessor}
     * @param semitones {number} Can be float
     * @param force {boolean} defaults to false, if true transposes the channel even if it's a drum channel
     */
    transposeAllChannels(semitones, force = false) {
        this.transposition = 0;
        for (let i = 0; i < this.midiAudioChannels.length; i++) {
            this.midiAudioChannels[i].transposeChannel(semitones, force);
        }
        this.transposition = semitones;
    }

    createMidiChannel(sendEvent = false) {
        /**
         * @type {MidiAudioChannel}
         */
        const channel = new MidiAudioChannel(
            this,
            this.defaultPreset,
            this.midiAudioChannels.length
        );
        this.midiAudioChannels.push(channel);
        if (sendEvent) {
            this.callEvent("newchannel", undefined);
            channel.sendChannelProperty();
            this.midiAudioChannels[this.midiAudioChannels.length - 1].setDrums(
                true
            );
        }
    }

    stopAllChannels(force = false) {
        SpessaSynthInfo("%cStop all received!", consoleColors.info);
        for (let i = 0; i < this.midiAudioChannels.length; i++) {
            this.midiAudioChannels[i].stopAllNotes(force);
        }
        this.callEvent("stopall", undefined);
    }

    getDefaultPresets() {
        // override this to XG, to set the default preset to NOT be XG drums!
        const sys = this.system;
        this.system = "xg";
        this.defaultPreset = this.getPreset(0, 0);
        this.system = sys;
        this.drumPreset = this.getPreset(128, 0);
    }

    /**
     * @param value {SynthSystem}
     */
    setSystem(value) {
        this.system = value;
        this?.onMasterParameterChange?.(
            masterParameterType.midiSystem,
            this.system
        );
    }

    /**
     * @param bank {number}
     * @param program {number}
     * @param midiNote {number}
     * @param velocity {number}
     * @returns {Voice[]|undefined}
     */
    getCachedVoice(bank, program, midiNote, velocity) {
        return this.cachedVoices?.[bank]?.[program]?.[midiNote]?.[velocity];
    }

    /**
     * @param bank {number}
     * @param program {number}
     * @param midiNote {number}
     * @param velocity {number}
     * @param voices {Voice[]}
     */
    setCachedVoice(bank, program, midiNote, velocity, voices) {
        // make sure that it exists
        if (!this.cachedVoices[bank]) {
            this.cachedVoices[bank] = [];
        }
        if (!this.cachedVoices[bank][program]) {
            this.cachedVoices[bank][program] = [];
        }
        if (!this.cachedVoices[bank][program][midiNote]) {
            this.cachedVoices[bank][program][midiNote] = [];
        }

        // cache
        this.cachedVoices[bank][program][midiNote][velocity] = voices;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Renders float32 audio data to stereo outputs; buffer size of 128 is recommended
     * All float arrays must have the same length
     * @param outputs {Float32Array[]} output stereo channels (L, R)
     * @param reverb {Float32Array[]} reverb stereo channels (L, R)
     * @param chorus {Float32Array[]} chorus stereo channels (L, R)
     * @param startIndex {number} start offset of the passed arrays, rendering starts at this index, defaults to 0
     * @param sampleCount {number} the length of the rendered buffer, defaults to float32array length - startOffset
     */
    renderAudio(outputs, reverb, chorus, startIndex = 0, sampleCount = 0) {
        this.renderAudioSplit(
            reverb,
            chorus,
            Array(16).fill(outputs),
            startIndex,
            sampleCount
        );
    }

    /**
     * Renders the float32 audio data of each channel; buffer size of 128 is recommended
     * All float arrays must have the same length
     * @param reverbChannels {Float32Array[]} reverb stereo channels (L, R)
     * @param chorusChannels {Float32Array[]} chorus stereo channels (L, R)
     * @param separateChannels {Float32Array[][]} a total of 16 stereo pairs (L, R) for each MIDI channel
     * @param startIndex {number} start offset of the passed arrays, rendering starts at this index, defaults to 0
     * @param sampleCount {number} the length of the rendered buffer, defaults to float32array length - startOffset
     */
    renderAudioSplit(
        reverbChannels,
        chorusChannels,
        separateChannels,
        startIndex = 0,
        sampleCount = 0
    ) {
        // process event queue
        const time = this.currentSynthTime;
        while (this.eventQueue[0]?.time <= time) {
            this.eventQueue.shift().callback();
        }
        const revL = reverbChannels[0];
        const revR = reverbChannels[1];
        const chrL = chorusChannels[0];
        const chrR = chorusChannels[1];

        // validate
        startIndex = Math.max(startIndex, 0);
        const quantumSize =
            sampleCount || separateChannels[0][0].length - startIndex;

        // for every channel
        this.totalVoicesAmount = 0;
        this.midiAudioChannels.forEach((channel, index) => {
            if (channel.voices.length < 1 || channel.isMuted) {
                // there's nothing to do!
                return;
            }
            const voiceCount = channel.voices.length;
            const ch = index % 16;

            // render to the appropriate output
            channel.renderAudio(
                separateChannels[ch][0],
                separateChannels[ch][1],
                revL,
                revR,
                chrL,
                chrR,
                startIndex,
                quantumSize
            );

            this.totalVoicesAmount += channel.voices.length;
            // if voice count changed, update voice amount
            if (channel.voices.length !== voiceCount) {
                channel.sendChannelProperty();
            }
        });

        // advance the time appropriately
        this.currentSynthTime += quantumSize * this.sampleTime;
    }

    // noinspection JSUnusedGlobalSymbols
    destroySynthProcessor() {
        this.midiAudioChannels.forEach((c) => {
            delete c.midiControllers;
            delete c.voices;
            delete c.sustainedVoices;
            delete c.lockedControllers;
            delete c.preset;
            delete c.customControllers;
        });
        delete this.cachedVoices;
        delete this.midiAudioChannels;
        this.soundfontManager.destroyManager();
        delete this.soundfontManager;
    }

    /**
     * @param channel {number}
     * @param controllerNumber {number}
     * @param controllerValue {number}
     * @param force {boolean}
     */
    controllerChange(
        channel,
        controllerNumber,
        controllerValue,
        force = false
    ) {
        this.midiAudioChannels[channel].controllerChange(
            controllerNumber,
            controllerValue,
            force
        );
    }

    /**
     * @param channel {number}
     * @param midiNote {number}
     * @param velocity {number}
     */
    noteOn(channel, midiNote, velocity) {
        this.midiAudioChannels[channel].noteOn(midiNote, velocity);
    }

    /**
     * @param channel {number}
     * @param midiNote {number}
     */
    noteOff(channel, midiNote) {
        this.midiAudioChannels[channel].noteOff(midiNote);
    }

    /**
     * @param channel {number}
     * @param midiNote {number}
     * @param pressure {number}
     */
    polyPressure(channel, midiNote, pressure) {
        this.midiAudioChannels[channel].polyPressure(midiNote, pressure);
    }

    /**
     * @param channel {number}
     * @param pressure {number}
     */
    channelPressure(channel, pressure) {
        this.midiAudioChannels[channel].channelPressure(pressure);
    }

    /**
     * @param channel {number}
     * @param MSB {number}
     * @param LSB {number}
     */
    pitchWheel(channel, MSB, LSB) {
        this.midiAudioChannels[channel].pitchWheel(MSB, LSB);
    }

    /**
     * @param channel {number}
     * @param programNumber {number}
     */
    programChange(channel, programNumber) {
        this.midiAudioChannels[channel].programChange(programNumber);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Processes a MIDI message
     * @param message {Uint8Array} - the message to process
     * @param channelOffset {number} - channel offset for the message
     * @param force {boolean} cool stuff
     * @param options {SynthMethodOptions} - additional options for scheduling the message
     */
    processMessage(
        message,
        channelOffset = 0,
        force = false,
        options = DEFAULT_SYNTH_METHOD_OPTIONS
    ) {
        const call = () => {
            const statusByteData = getEvent(message[0]);

            const channel = statusByteData.channel + channelOffset;
            // process the event
            switch (statusByteData.status) {
                case messageTypes.noteOn:
                    const velocity = message[2];
                    if (velocity > 0) {
                        this.noteOn(channel, message[1], velocity);
                    } else {
                        this.noteOff(channel, message[1]);
                    }
                    break;

                case messageTypes.noteOff:
                    if (force) {
                        this.midiAudioChannels[channel].killNote(message[1]);
                    } else {
                        this.noteOff(channel, message[1]);
                    }
                    break;

                case messageTypes.pitchBend:
                    this.pitchWheel(channel, message[2], message[1]);
                    break;

                case messageTypes.controllerChange:
                    this.controllerChange(
                        channel,
                        message[1],
                        message[2],
                        force
                    );
                    break;

                case messageTypes.programChange:
                    this.programChange(channel, message[1]);
                    break;

                case messageTypes.polyPressure:
                    this.polyPressure(channel, message[0], message[1]);
                    break;

                case messageTypes.channelPressure:
                    this.channelPressure(channel, message[1]);
                    break;

                case messageTypes.systemExclusive:
                    this.systemExclusive(
                        new IndexedByteArray(message.slice(1)),
                        channelOffset
                    );
                    break;

                case messageTypes.reset:
                    this.stopAllChannels(true);
                    this.resetAllControllers();
                    break;

                default:
                    break;
            }
        };

        const time = options.time;
        if (time > this.currentSynthTime) {
            this.eventQueue.push({
                callback: call.bind(this),
                time: time
            });
            this.eventQueue.sort((e1, e2) => e1.time - e2.time);
        } else {
            call();
        }
    }

    /**
     * @param volume {number} 0 to 1
     */
    setMIDIVolume(volume) {
        // GM2 specification, section 4.1: volume is squared.
        // though, according to my own testing, Math.E seems like a better choice
        this.midiVolume = Math.pow(volume, Math.E);
    }

    clearCache() {
        this.cachedVoices = [];
    }

    /**
     * @param program {number}
     * @param bank {number}
     * @returns {BasicPreset}
     */
    getPreset(bank, program) {
        return this.soundfontManager.getPreset(
            bank,
            program,
            isSystemXG(this.system)
        ).preset;
    }

    /**
     * Calls synth event
     * @param eventName {EventTypes} the event name
     * @param eventData {EventCallbackData} the
     * @this {SpessaSynthProcessor}
     */
    private callEvent(eventName: EventTypes, eventData: EventCallbackData) {
        if (this.enableEventSystem) {
            this?.onEventCall?.(eventName, eventData);
        }
    }
}
