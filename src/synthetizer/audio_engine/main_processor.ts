import { SpessaSynthInfo } from "../../utils/loggin";
import { consoleColors } from "../../utils/other";
import { EMBEDDED_SOUND_BANK_ID } from "./synth_constants";
import { stbvorbis } from "../../externals/stbvorbis_sync/stbvorbis_wrapper";
import { VOLUME_ENVELOPE_SMOOTHING_FACTOR } from "./engine_components/volume_envelope";
import { getMasterParameter, setMasterParameter } from "./engine_methods/controller_control/master_parameters";
import { SoundBankManager } from "./engine_components/sound_bank_manager";
import { PAN_SMOOTHING_FACTOR } from "./engine_components/stereo_panner";
import { FILTER_SMOOTHING_FACTOR } from "./engine_components/lowpass_filter";
import { getEvent } from "../../midi/midi_message";
import { IndexedByteArray } from "../../utils/indexed_array";
import { DEFAULT_SYNTH_OPTIONS } from "./synth_processor_options";
import { fillWithDefaults } from "../../utils/fill_with_defaults";
import { isSystemXG } from "../../utils/xg_hacks";
import { voiceKilling } from "./engine_methods/stopping_notes/voice_killing";
import { getVoices, getVoicesForPreset } from "./engine_components/voice";
import { systemExclusive } from "./engine_methods/system_exclusive";
import { resetAllControllers } from "./engine_methods/controller_control/reset_controllers";
import { SynthesizerSnapshot } from "./snapshot/synthesizer_snapshot";
import type {
    ChannelProperty,
    EventType,
    MasterParameterType,
    SynthMethodOptions,
    SynthProcessorOptions,
    VoiceList
} from "../types";
import { messageTypes } from "../../midi/enums";
import { ProtectedSynthValues } from "./internal_synth_values";
import { customControllers } from "../enums";
import { KeyModifierManager } from "./engine_components/key_modifier_manager";
import type { BasicPreset } from "../../soundbank/basic_soundbank/basic_preset";
import { MIDIChannel } from "./engine_components/midi_audio_channel";
import { SoundBankLoader } from "../../soundbank/sound_bank_loader";

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
    // The sound bank manager, which manages all sound banks and presets.
    public soundBankManager: SoundBankManager = new SoundBankManager(
        this.updatePresetList.bind(this)
    );

    /**
     * All MIDI channels of the synthesizer.
     */
    public midiChannels: MIDIChannel[] = [];

    /**
     * Handles the custom key overrides: velocity and preset
     */
    public keyModifierManager: KeyModifierManager = new KeyModifierManager();

    /**
     * Current total amount of voices that are currently playing.
     */
    public totalVoicesAmount = 0;
    /**
     * Controls if the processor is fully initialized.
     */
    public readonly processorInitialized: Promise<boolean> =
        stbvorbis.isInitialized;
    /**
     * The current time of the synthesizer, in seconds. You probably should not modify this directly.
     */
    public currentSynthTime = 0;
    /**
     * Sample rate in Hertz.
     */
    public readonly sampleRate: number;
    /**
     * Are the chorus and reverb effects enabled?
     */
    public readonly effectsEnabled: boolean = true;

    /**
     * Is the event system enabled?
     */
    public readonly enableEventSystem: boolean;

    /**
     * Calls when an event occurs.
     * @param eventType The event type.
     * @param eventData The event data.
     */
    public onEventCall:
        | (<K extends keyof EventType>(
              eventType: K,
              eventData: EventType[K]
          ) => unknown)
        | undefined;
    /**
     * Calls when a channel property is changed.
     * @param property The updated property.
     * @param channelNumber The channel number of the said property.
     */
    public onChannelPropertyChange:
        | ((property: ChannelProperty, channelNumber: number) => unknown)
        | undefined;
    /**
     * Calls when a master parameter is changed.
     * @param parameter The parameter type.
     * @param value The new value.
     */
    public onMasterParameterChange:
        | (<P extends keyof MasterParameterType>(
              parameter: P,
              value: MasterParameterType[P]
          ) => unknown)
        | undefined;
    /**
     * Executes a system exclusive message for the synthesizer.
     * @param syx The system exclusive message as an array of bytes.
     * @param channelOffset The channel offset to apply (default is 0).
     */
    public systemExclusive: typeof systemExclusive = systemExclusive.bind(
        this
    ) as typeof systemExclusive;
    /**
     * Executes a full system reset of all controllers.
     * This will reset all controllers to their default values,
     * except for the locked controllers.
     */
    public resetAllControllers: typeof resetAllControllers =
        resetAllControllers.bind(this) as typeof resetAllControllers;
    /**
     * Sets a master parameter of the synthesizer.
     * @param type The type of the master parameter to set.
     * @param value The value to set for the master parameter.
     */
    public setMasterParameter: typeof setMasterParameter =
        setMasterParameter.bind(this) as typeof setMasterParameter;
    // noinspection JSUnusedGlobalSymbols
    /**
     * Gets a master parameter of the synthesizer.
     * @param type The type of the master parameter to get.
     * @returns The value of the master parameter.
     */
    public getMasterParameter: typeof getMasterParameter =
        getMasterParameter.bind(this) as typeof getMasterParameter;
    /**
     * Gets voices for a preset.
     * @param preset The preset to get voices for.
     * @param bank The bank to cache the voices in.
     * @param program Program to cache the voices in.
     * @param midiNote The MIDI note to use.
     * @param velocity The velocity to use.
     * @param realKey The real MIDI note if the "midiNote" was changed by MIDI Tuning Standard.
     * @returns Output is an array of voices.
     * @remarks
     * This is a public method, but it is only intended to be used by the sequencer.
     */
    public getVoicesForPreset: typeof getVoicesForPreset =
        getVoicesForPreset.bind(this) as typeof getVoicesForPreset;
    // protected methods
    protected voiceKilling = voiceKilling.bind(this);
    protected getVoices = getVoices.bind(this);
    // This contains the properties that have to be accessed from the MIDI channels.
    protected privateProps: ProtectedSynthValues;
    /**
     * Tor applying the snapshot after an override sound bank too.
     */
    protected savedSnapshot: SynthesizerSnapshot | undefined = undefined;
    /**
     * Synth's event queue from the main thread
     */
    protected eventQueue: { callback: () => unknown; time: number }[] = [];
    protected readonly midiOutputsCount: number;

    // The time of a single sample, in seconds.
    private readonly sampleTime: number;

    /**
     * Creates a new synthesizer engine.
     * @param sampleRate sample rate, in Hertz.
     * @param opts the processor's options.
     */
    constructor(
        sampleRate: number,
        opts: Partial<SynthProcessorOptions> = DEFAULT_SYNTH_OPTIONS
    ) {
        const options: SynthProcessorOptions = fillWithDefaults(
            opts,
            DEFAULT_SYNTH_OPTIONS
        );
        /**
         * Midi output count
         * @type {number}
         */
        this.midiOutputsCount = options.midiChannels;
        this.effectsEnabled = options.effectsEnabled;
        this.enableEventSystem = options.enableEventSystem;
        this.currentSynthTime = options.initialTime;
        this.sampleRate = sampleRate;
        this.sampleTime = 1 / sampleRate;

        // Initialize the protected synth values
        this.privateProps = new ProtectedSynthValues(
            this.callEvent.bind(this),
            this.getVoices.bind(this),
            this.voiceKilling.bind(this),
            // these smoothing factors were tested on 44,100 Hz, adjust them to target sample rate here
            // volume envelope smoothing factor
            VOLUME_ENVELOPE_SMOOTHING_FACTOR * (44100 / sampleRate),
            // pan smoothing factor
            PAN_SMOOTHING_FACTOR * (44100 / sampleRate),
            // filter smoothing factor
            FILTER_SMOOTHING_FACTOR * (44100 / sampleRate)
        );

        for (let i = 0; i < this.midiOutputsCount; i++) {
            // don't send events as we're creating the initial channels
            this.createMIDIChannelInternal(false);
        }
        this.processorInitialized.then(() => {
            SpessaSynthInfo(
                "%cSpessaSynth is ready!",
                consoleColors.recognized
            );
        });
    }

    /**
     * Applies the snapshot to the synth
     */
    applySynthesizerSnapshot(snapshot: SynthesizerSnapshot) {
        this.savedSnapshot = snapshot;
        snapshot.apply(this);
        SpessaSynthInfo("%cFinished applying snapshot!", consoleColors.info);
        this.resetAllControllers();
    }

    getSynthesizerSnapshot(): SynthesizerSnapshot {
        return SynthesizerSnapshot.create(this);
    }

    /**
     * Sets the embedded sound bank.
     * @param bank The sound bank file to set.
     * @param offset The bank offset of the embedded sound bank.
     */
    setEmbeddedSoundBank(bank: ArrayBuffer, offset: number) {
        // the embedded bank is set as the first bank in the manager,
        // with a special ID that does not clear when reloadManager is performed.
        const loadedFont = SoundBankLoader.fromArrayBuffer(bank);
        this.soundBankManager.addNewSoundBank(
            loadedFont,
            EMBEDDED_SOUND_BANK_ID,
            offset
        );
        // rearrange so the embedded is first (most important as it overrides all others)
        const order = this.soundBankManager.getSoundBankOrder();
        order.pop();
        order.unshift(EMBEDDED_SOUND_BANK_ID);
        this.soundBankManager.setSoundBankOrder(order);

        // apply snapshot again if applicable
        if (this.savedSnapshot !== undefined) {
            this.applySynthesizerSnapshot(this.savedSnapshot);
        }
        SpessaSynthInfo(
            `%cEmbedded sound bank set at offset %c${offset}`,
            consoleColors.recognized,
            consoleColors.value
        );
    }

    // Removes the embedded sound bank from the synthesizer.
    clearEmbeddedBank() {
        if (
            this.soundBankManager.soundBankList.some(
                (s) => s.id === EMBEDDED_SOUND_BANK_ID
            )
        ) {
            this.soundBankManager.deleteSoundBank(EMBEDDED_SOUND_BANK_ID);
        }
    }

    // Creates a new MIDI channel for the synthesizer.
    createMidiChannel() {
        this.createMIDIChannelInternal(true);
    }

    /**
     * Stops all notes on all channels.
     * @param force if true, all notes are stopped immediately, otherwise they are stopped gracefully.
     */
    stopAllChannels(force = false) {
        SpessaSynthInfo("%cStop all received!", consoleColors.info);
        for (let i = 0; i < this.midiChannels.length; i++) {
            this.midiChannels[i].stopAllNotes(force);
        }
        this.privateProps.callEvent("stopall", undefined);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Renders float32 audio data to stereo outputs; buffer size of 128 is recommended.
     * All float arrays must have the same length.
     * @param outputs output stereo channels (L, R).
     * @param reverb reverb stereo channels (L, R).
     * @param chorus chorus stereo channels (L, R).
     * @param startIndex start offset of the passed arrays, rendering starts at this index, defaults to 0.
     * @param sampleCount the length of the rendered buffer, defaults to float32array length - startOffset.
     */
    renderAudio(
        outputs: Float32Array[],
        reverb: Float32Array[],
        chorus: Float32Array[],
        startIndex: number = 0,
        sampleCount: number = 0
    ) {
        this.renderAudioSplit(
            reverb,
            chorus,
            Array(16).fill(outputs),
            startIndex,
            sampleCount
        );
    }

    /**
     * Renders the float32 audio data of each channel; buffer size of 128 is recommended.
     * All float arrays must have the same length.
     * @param reverbChannels reverb stereo channels (L, R).
     * @param chorusChannels chorus stereo channels (L, R).
     * @param separateChannels a total of 16 stereo pairs (L, R) for each MIDI channel.
     * @param startIndex start offset of the passed arrays, rendering starts at this index, defaults to 0.
     * @param sampleCount the length of the rendered buffer, defaults to float32array length - startOffset.
     */
    renderAudioSplit(
        reverbChannels: Float32Array[],
        chorusChannels: Float32Array[],
        separateChannels: Float32Array[][],
        startIndex: number = 0,
        sampleCount: number = 0
    ) {
        // process event queue
        const time = this.currentSynthTime;
        while (this.eventQueue[0]?.time <= time) {
            this.eventQueue.shift()?.callback();
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
        this.midiChannels.forEach((channel, index) => {
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
    /**
     *  Destroy the synthesizer processor, clearing all channels and voices.
     *  This is irreversible, so use with caution.
     */
    destroySynthProcessor() {
        this.midiChannels.forEach((c) => {
            c.midiControllers = new Int16Array(0);
            c.voices.length = 0;
            c.sustainedVoices.length = 0;
            c.lockedControllers = [];
            c.preset = undefined;
            c.customControllers = new Float32Array(0);
        });
        this.privateProps.cachedVoices.length = 0;
        this.midiChannels.length = 0;
        this.soundBankManager.destroyManager();
    }

    /**
     * Executes a MIDI controller change message on the specified channel.
     * @param channel The MIDI channel to change the controller on.
     * @param controllerNumber The MIDI controller number to change.
     * @param controllerValue The value to set the controller to.
     * @param force If true, the controller change is forced, otherwise it is ignored if the controller is locked.
     */
    controllerChange(
        channel: number,
        controllerNumber: number,
        controllerValue: number,
        force: boolean = false
    ) {
        this.midiChannels[channel].controllerChange(
            controllerNumber,
            controllerValue,
            force
        );
    }

    /**
     * Executes a MIDI Note-on message on the specified channel.
     * @param channel The MIDI channel to send the note on.
     * @param midiNote The MIDI note number to play.
     * @param velocity The velocity of the note, from 0 to 127.
     * @remarks
     * If the velocity is 0, it will be treated as a Note-off message.
     */
    noteOn(channel: number, midiNote: number, velocity: number) {
        this.midiChannels[channel].noteOn(midiNote, velocity);
    }

    /**
     * Executes a MIDI Note-off message on the specified channel.
     * @param channel The MIDI channel to send the note off.
     * @param midiNote The MIDI note number to stop playing.
     */
    noteOff(channel: number, midiNote: number) {
        this.midiChannels[channel].noteOff(midiNote);
    }

    /**
     * Executes a MIDI Poly Pressure (Aftertouch) message on the specified channel.
     * @param channel The MIDI channel to send the poly pressure on.
     * @param midiNote The MIDI note number to apply the pressure to.
     * @param pressure The pressure value, from 0 to 127.
     */
    polyPressure(channel: number, midiNote: number, pressure: number) {
        this.midiChannels[channel].polyPressure(midiNote, pressure);
    }

    /**
     * Executes a MIDI Channel Pressure (Aftertouch) message on the specified channel.
     * @param channel The MIDI channel to send the channel pressure on.
     * @param pressure The pressure value, from 0 to 127.
     */
    channelPressure(channel: number, pressure: number) {
        this.midiChannels[channel].channelPressure(pressure);
    }

    /**
     * Executes a MIDI Pitch Wheel message on the specified channel.
     * @param channel The MIDI channel to send the pitch wheel on.
     * @param MSB The most significant byte of the pitch wheel value, from 0 to 127.
     * @param LSB The least significant byte of the pitch wheel value, from 0 to 127.
     */
    pitchWheel(channel: number, MSB: number, LSB: number) {
        this.midiChannels[channel].pitchWheel(MSB, LSB);
    }

    /**
     * Executes a MIDI Program Change message on the specified channel.
     * @param channel The MIDI channel to send the program change on.
     * @param programNumber The program number to change to, from 0 to 127.
     */
    programChange(channel: number, programNumber: number) {
        this.midiChannels[channel].programChange(programNumber);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Processes a raw MIDI message.
     * @param message The message to process.
     * @param channelOffset The channel offset for the message.
     * @param force If true, forces the message to be processed.
     * @param options Additional options for scheduling the message.
     */
    processMessage(
        message: Uint8Array,
        channelOffset: number = 0,
        force: boolean = false,
        options: SynthMethodOptions = DEFAULT_SYNTH_METHOD_OPTIONS
    ) {
        const call = () => {
            const statusByteData = getEvent(message[0] as messageTypes);

            const channel = statusByteData.channel + channelOffset;
            // process the event
            switch (statusByteData.status as messageTypes) {
                case messageTypes.noteOn: {
                    const velocity = message[2];
                    if (velocity > 0) {
                        this.noteOn(channel, message[1], velocity);
                    } else {
                        this.noteOff(channel, message[1]);
                    }
                    break;
                }

                case messageTypes.noteOff:
                    if (force) {
                        this.midiChannels[channel].killNote(message[1]);
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

    // Clears the synthesizer's voice cache.
    clearCache() {
        this.privateProps.cachedVoices = [];
    }

    /**
     * Gets a specified preset from the soundfont manager.
     * @param bank the bank number of the preset.
     * @param program the program number of the preset.
     */
    getPreset(bank: number, program: number): BasicPreset {
        return this.soundBankManager.getPreset(
            bank,
            program,
            isSystemXG(this.privateProps.system)
        ).preset;
    }

    /**
     * @param volume {number} 0 to 1
     */
    protected setMIDIVolume(volume: number) {
        // GM2 specification, section 4.1: volume is squared.
        // though, according to my own testing, Math.E seems like a better choice
        this.privateProps.midiVolume = Math.pow(volume, Math.E);
    }

    /**
     * Sets the synth's primary tuning.
     * @param cents
     */
    protected setMasterTuning(cents: number) {
        cents = Math.round(cents);
        for (let i = 0; i < this.midiChannels.length; i++) {
            this.midiChannels[i].setCustomController(
                customControllers.masterTuning,
                cents
            );
        }
    }

    /**
     * Calls synth event
     * @param eventName the event name
     * @param eventData the event data
     */
    protected callEvent<K extends keyof EventType>(
        eventName: K,
        eventData: EventType[K]
    ) {
        this.onEventCall?.(eventName, eventData);
    }

    protected getCachedVoice(
        bank: number,
        program: number,
        midiNote: number,
        velocity: number
    ): VoiceList | undefined {
        return this.privateProps.cachedVoices?.[bank]?.[program]?.[midiNote]?.[
            velocity
        ];
    }

    protected setCachedVoice(
        bank: number,
        program: number,
        midiNote: number,
        velocity: number,
        voices: VoiceList
    ) {
        // make sure that it exists
        if (!this.privateProps.cachedVoices[bank]) {
            this.privateProps.cachedVoices[bank] = [];
        }
        if (!this.privateProps.cachedVoices[bank][program]) {
            this.privateProps.cachedVoices[bank][program] = [];
        }
        if (!this.privateProps.cachedVoices[bank][program][midiNote]) {
            this.privateProps.cachedVoices[bank][program][midiNote] = [];
        }

        // cache
        this.privateProps.cachedVoices[bank][program][midiNote][velocity] =
            voices;
    }

    private createMIDIChannelInternal(sendEvent: boolean) {
        const channel: MIDIChannel = new MIDIChannel(
            this,
            this.privateProps,
            this.privateProps.defaultPreset,
            this.midiChannels.length
        );
        this.midiChannels.push(channel);
        if (sendEvent) {
            this.callEvent("newchannel", undefined);
            channel.sendChannelProperty();
            this.midiChannels[this.midiChannels.length - 1].setDrums(true);
        }
    }

    private updatePresetList() {
        const mainFont: {
            bank: number;
            presetName: string;
            program: number;
        }[] = this.soundBankManager.getPresetList();
        this.clearCache();
        this.privateProps.callEvent("presetlistchange", mainFont);
        this.getDefaultPresets();
        // unlock presets
        this.midiChannels.forEach((c) => {
            c.setPresetLock(false);
        });
        this.resetAllControllers(false);
    }

    private getDefaultPresets() {
        // override this to XG, to set the default preset to NOT be XG drums!
        const sys = this.privateProps.system;
        this.privateProps.system = "xg";
        this.privateProps.defaultPreset = this.getPreset(0, 0);
        this.privateProps.system = sys;
        this.privateProps.drumPreset = this.getPreset(128, 0);
    }
}
