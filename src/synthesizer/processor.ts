import { SpessaSynthInfo, SpessaSynthWarn } from "../utils/loggin";
import { consoleColors } from "../utils/other";
import {
    DEFAULT_SYNTH_METHOD_OPTIONS,
    DEFAULT_SYNTH_MODE,
    EMBEDDED_SOUND_BANK_ID,
    MIDI_CHANNEL_COUNT
} from "./audio_engine/engine_components/synth_constants";
import { stbvorbis } from "../externals/stbvorbis_sync/stbvorbis_wrapper";
import { DEFAULT_SYNTH_OPTIONS } from "./audio_engine/engine_components/synth_processor_options";
import { fillWithDefaults } from "../utils/fill_with_defaults";
import { SynthesizerSnapshot } from "./audio_engine/snapshot/synthesizer_snapshot";
import type {
    MasterParameterType,
    SynthMethodOptions,
    SynthProcessorEvent,
    SynthProcessorEventData,
    SynthProcessorOptions,
    SynthSystem
} from "./types";
import { type MIDIController } from "../midi/enums";
import { SynthesizerCore } from "./audio_engine/synthesizer_core";
import { SoundBankLoader } from "../soundbank/sound_bank_loader";
import type { BasicPreset } from "../soundbank/basic_soundbank/basic_preset";
import type { SysExAcceptedArray } from "./audio_engine/engine_methods/system_exclusive/helpers";
import {
    type MIDIPatch,
    MIDIPatchTools
} from "../soundbank/basic_soundbank/midi_patch";

/**
 * Processor.ts
 * purpose: the core synthesis engine
 */

// The core synthesis engine of spessasynth.
export class SpessaSynthProcessor {
    /**
     * Controls if the processor is fully initialized.
     */
    public readonly processorInitialized: Promise<boolean> =
        stbvorbis.isInitialized;
    /**
     * Sample rate in Hertz.
     */
    public readonly sampleRate: number;
    /**
     * Calls when an event occurs.
     * @param event The event that occurred.
     */
    public onEventCall?: (event: SynthProcessorEvent) => unknown;
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
    public readonly renderAudio;
    // noinspection JSUnusedGlobalSymbols
    /**
     * Renders the float32 audio data of each channel; buffer size of 128 is recommended.
     * All float arrays must have the same length.
     * @param reverbChannels reverb stereo channels (L, R).
     * @param chorusChannels chorus stereo channels (L, R).
     * @param separateChannels a total of 16 stereo pairs (L, R) for each MIDI channel.
     * @param startIndex start offset of the passed arrays, rendering starts at this index, defaults to 0.
     * @param sampleCount the length of the rendered buffer, defaults to float32array length - startOffset.
     */
    public readonly renderAudioSplit;
    /**
     * Core synthesis engine.
     */
    private readonly synthCore: SynthesizerCore;
    /**
     * Tor applying the snapshot after an override sound bank too.
     */
    private savedSnapshot?: SynthesizerSnapshot;

    /**
     * Creates a new synthesizer engine.
     * @param sampleRate sample rate, in Hertz.
     * @param opts the processor's options.
     */
    public constructor(
        sampleRate: number,
        opts: Partial<SynthProcessorOptions> = DEFAULT_SYNTH_OPTIONS
    ) {
        const options: SynthProcessorOptions = fillWithDefaults(
            opts,
            DEFAULT_SYNTH_OPTIONS
        );
        this.sampleRate = sampleRate;
        if (
            !Number.isFinite(options.initialTime) ||
            !Number.isFinite(sampleRate)
        ) {
            throw new TypeError(
                `Initial time or sample rate is invalid! initial time: ${options.initialTime}, sample rate: ${sampleRate}`
            );
        }

        // Initialize the protected synth values
        this.synthCore = new SynthesizerCore(
            this.callEvent.bind(this),
            this.missingPreset.bind(this),
            this.sampleRate,
            options
        );

        // Bind rendering methods for less overhead
        this.renderAudio = this.synthCore.renderAudio.bind(this.synthCore);
        this.renderAudioSplit = this.synthCore.renderAudioSplit.bind(
            this.synthCore
        );

        for (let i = 0; i < MIDI_CHANNEL_COUNT; i++) {
            // Don't send events as we're creating the initial channels
            this.synthCore.createMIDIChannel(false);
        }
        void this.processorInitialized.then(() => {
            SpessaSynthInfo(
                "%cSpessaSynth is ready!",
                consoleColors.recognized
            );
        });
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Are the chorus and reverb effects enabled?
     */
    public get enableEffects() {
        return this.synthCore.enableEffects;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Are the chorus and reverb effects enabled?
     */
    public set enableEffects(v: boolean) {
        this.synthCore.enableEffects = v;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Is the event system enabled?
     */
    public get enableEventSystem() {
        return this.synthCore.enableEventSystem;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Is the event system enabled?
     */
    public set enableEventSystem(v: boolean) {
        this.synthCore.enableEventSystem = v;
    }

    /**
     * All MIDI channels of the synthesizer.
     */
    public get midiChannels() {
        return this.synthCore.midiChannels;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Current total amount of voices that are currently playing.
     */
    public get totalVoicesAmount() {
        return this.synthCore.voiceCount;
    }

    /**
     * The current time of the synthesizer, in seconds. You probably should not modify this directly.
     */
    public get currentSynthTime() {
        return this.synthCore.currentTime;
    }

    /**
     * The sound bank manager, which manages all sound banks and presets.
     */
    public get soundBankManager() {
        return this.synthCore.soundBankManager;
    }

    /**
     * Handles the custom key overrides: velocity and preset
     */
    public get keyModifierManager() {
        return this.synthCore.keyModifierManager;
    }

    /**
     * A handler for missing presets during program change. By default, it warns to console.
     * @param patch The MIDI patch that was requested.
     * @param system The MIDI System for the request.
     * @returns If a BasicPreset instance is returned, it will be used by the channel.
     */
    public onMissingPreset = (
        patch: MIDIPatch,
        system: SynthSystem
    ): BasicPreset | undefined => {
        SpessaSynthWarn(
            `No preset found for ${MIDIPatchTools.toMIDIString(patch)}! Did you forget to add a sound bank?`
        );
        // Make tsc happy!
        void system;
        return undefined;
    };

    /**
     * Executes a system exclusive message for the synthesizer.
     * @param syx The system exclusive message as an array of bytes.
     * @param channelOffset The channel offset to apply (default is 0).
     */
    public systemExclusive(syx: SysExAcceptedArray, channelOffset = 0) {
        this.synthCore.systemExclusive(syx, channelOffset);
    }

    /**
     * Sets a master parameter of the synthesizer.
     * @param type The type of the master parameter to set.
     * @param value The value to set for the master parameter.
     */
    public setMasterParameter<P extends keyof MasterParameterType>(
        type: P,
        value: MasterParameterType[P]
    ) {
        this.synthCore.setMasterParameter(type, value);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Gets a master parameter of the synthesizer.
     * @param type The type of the master parameter to get.
     * @returns The value of the master parameter.
     */
    public getMasterParameter<P extends keyof MasterParameterType>(
        type: P
    ): MasterParameterType[P] {
        return this.synthCore.getMasterParameter(type);
    }

    /**
     * Gets all master parameters of the synthesizer.
     * @returns All the master parameters.
     */
    public getAllMasterParameters() {
        return this.synthCore.getAllMasterParameters();
    }

    /**
     * Executes a full system reset of all controllers.
     * This will reset all controllers to their default values,
     * except for the locked controllers.
     */
    public resetAllControllers(system: SynthSystem = DEFAULT_SYNTH_MODE) {
        this.synthCore.resetAllControllers(system);
    }

    /**
     * Applies the snapshot to the synth
     */
    public applySynthesizerSnapshot(snapshot: SynthesizerSnapshot) {
        this.savedSnapshot = snapshot;
        snapshot.apply(this);
        SpessaSynthInfo("%cFinished applying snapshot!", consoleColors.info);
        this.resetAllControllers();
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Gets a synthesizer snapshot from this processor instance.
     */
    public getSnapshot(): SynthesizerSnapshot {
        return SynthesizerSnapshot.create(this);
    }

    /**
     * Sets the embedded sound bank.
     * @param bank The sound bank file to set.
     * @param offset The bank offset of the embedded sound bank.
     */
    public setEmbeddedSoundBank(bank: ArrayBuffer, offset: number) {
        // The embedded bank is set as the first bank in the manager,
        // With a special ID that is randomized.
        const loadedFont = SoundBankLoader.fromArrayBuffer(bank);
        this.synthCore.soundBankManager.addSoundBank(
            loadedFont,
            EMBEDDED_SOUND_BANK_ID,
            offset
        );
        // Rearrange so the embedded is first (most important as it overrides all others)
        const order = this.synthCore.soundBankManager.priorityOrder;
        order.pop();
        order.unshift(EMBEDDED_SOUND_BANK_ID);
        this.synthCore.soundBankManager.priorityOrder = order;

        // Apply snapshot again if applicable
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
    public clearEmbeddedBank() {
        if (
            this.synthCore.soundBankManager.soundBankList.some(
                (s) => s.id === EMBEDDED_SOUND_BANK_ID
            )
        ) {
            this.synthCore.soundBankManager.deleteSoundBank(
                EMBEDDED_SOUND_BANK_ID
            );
        }
    }

    // Creates a new MIDI channel for the synthesizer.
    public createMIDIChannel() {
        this.synthCore.createMIDIChannel(true);
    }

    /**
     * Stops all notes on all channels.
     * @param force if true, all notes are stopped immediately, otherwise they are stopped gracefully.
     */
    public stopAllChannels(force = false) {
        this.synthCore.stopAllChannels(force);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     *  Destroy the synthesizer processor, clearing all channels and voices.
     *  This is irreversible, so use with caution.
     */
    public destroySynthProcessor() {
        this.synthCore.destroySynthProcessor();
    }

    /**
     * Executes a MIDI controller change message on the specified channel.
     * @param channel The MIDI channel to change the controller on.
     * @param controllerNumber The MIDI controller number to change.
     * @param controllerValue The value to set the controller to.
     */
    public controllerChange(
        channel: number,
        controllerNumber: MIDIController,
        controllerValue: number
    ) {
        this.synthCore.midiChannels[channel].controllerChange(
            controllerNumber,
            controllerValue
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
    public noteOn(channel: number, midiNote: number, velocity: number) {
        this.synthCore.midiChannels[channel].noteOn(midiNote, velocity);
    }

    /**
     * Executes a MIDI Note-off message on the specified channel.
     * @param channel The MIDI channel to send the note off.
     * @param midiNote The MIDI note number to stop playing.
     */
    public noteOff(channel: number, midiNote: number) {
        this.synthCore.midiChannels[channel].noteOff(midiNote);
    }

    /**
     * Executes a MIDI Poly Pressure (Aftertouch) message on the specified channel.
     * @param channel The MIDI channel to send the poly pressure on.
     * @param midiNote The MIDI note number to apply the pressure to.
     * @param pressure The pressure value, from 0 to 127.
     */
    public polyPressure(channel: number, midiNote: number, pressure: number) {
        this.synthCore.midiChannels[channel].polyPressure(midiNote, pressure);
    }

    /**
     * Executes a MIDI Channel Pressure (Aftertouch) message on the specified channel.
     * @param channel The MIDI channel to send the channel pressure on.
     * @param pressure The pressure value, from 0 to 127.
     */
    public channelPressure(channel: number, pressure: number) {
        this.synthCore.midiChannels[channel].channelPressure(pressure);
    }

    /**
     * Executes a MIDI Pitch Wheel message on the specified channel.
     * @param channel The MIDI channel to send the pitch wheel on.
     * @param pitch The new pitch value: 0-16384
     * @param midiNote The MIDI note number, pass -1 for the regular pitch wheel
     */
    public pitchWheel(channel: number, pitch: number, midiNote = -1) {
        this.synthCore.midiChannels[channel].pitchWheel(pitch, midiNote);
    }

    /**
     * Executes a MIDI Program Change message on the specified channel.
     * @param channel The MIDI channel to send the program change on.
     * @param programNumber The program number to change to, from 0 to 127.
     */
    public programChange(channel: number, programNumber: number) {
        this.synthCore.midiChannels[channel].programChange(programNumber);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * DEPRECATED, does nothing!
     * @param amount
     * @deprecated
     */
    public killVoices(amount: number) {
        SpessaSynthWarn(
            `killVoices is deprecated, don't use it! Amount requested: ${amount}`
        );
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Processes a raw MIDI message.
     * @param message The message to process.
     * @param channelOffset The channel offset for the message.
     * @param force If true, forces the message to be processed.
     * @param options Additional options for scheduling the message.
     */
    public processMessage(
        message: Uint8Array | number[],
        channelOffset = 0,
        force = false,
        options: SynthMethodOptions = DEFAULT_SYNTH_METHOD_OPTIONS
    ) {
        this.synthCore.processMessage(message, channelOffset, force, options);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Clears the synthesizer's voice cache.
     */
    public clearCache() {
        this.synthCore.clearCache();
    }

    /**
     * Gets voices for a preset.
     * @param preset The preset to get voices for.
     * @param midiNote The MIDI note to use.
     * @param velocity The velocity to use.
     * @returns Output is an array of voices.
     * @remarks
     * This is a public method, but it is only intended to be used by the sequencer.
     * @internal
     */
    public getVoicesForPreset(
        preset: BasicPreset,
        midiNote: number,
        velocity: number
    ) {
        return this.synthCore.getVoicesForPreset(preset, midiNote, velocity);
    }

    // Private methods
    /**
     * Calls synth event
     * @param eventName the event name
     * @param eventData the event data
     */
    private callEvent<K extends keyof SynthProcessorEventData>(
        eventName: K,
        eventData: SynthProcessorEventData[K]
    ) {
        this.onEventCall?.({
            type: eventName,
            data: eventData
        } as SynthProcessorEvent);
    }

    private missingPreset(patch: MIDIPatch, system: SynthSystem) {
        return this.onMissingPreset(patch, system);
    }
}
