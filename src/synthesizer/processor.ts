import { SpessaLog } from "../utils/loggin";
import { ConsoleColors } from "../utils/other";
import {
    DEFAULT_SYNTH_MODE,
    EMBEDDED_SOUND_BANK_ID
} from "./audio_engine/synth_constants";
import { DEFAULT_SYNTH_OPTIONS } from "./audio_engine/synth_processor_options";
import { fillWithDefaults } from "../utils/fill_with_defaults";
import {
    applySnapshot,
    getSynthesizerSnapshot,
    type SynthesizerSnapshot
} from "./audio_engine/synthesizer_snapshot";
import type {
    SynthesizerEvent,
    SynthesizerEventCallback,
    SynthesizerPatch,
    SynthMethodOptions,
    SynthProcessorOptions
} from "./types";
import { type MIDIController } from "../midi/enums";
import { SynthesizerCore } from "./audio_engine/synthesizer_core";
import { SoundBankLoader } from "../soundbank/sound_bank_loader";
import type { BasicPreset } from "../soundbank/basic_soundbank/basic_preset";
import {
    type MIDIPatch,
    MIDIPatchTools
} from "../soundbank/basic_soundbank/midi_patch";
import type { GlobalSystemParameter } from "./audio_engine/parameters/system";
import type { MIDIChannel } from "./audio_engine/channel/midi_channel";
import type { GlobalMIDIParameter } from "./audio_engine/parameters/midi";
import type { MIDISystem } from "../soundbank/types";
import type { SysExAcceptedArray } from "../midi/types";
import { BasicSoundBank } from "../soundbank/exports";
import type { MIDIMessage } from "../midi/midi_message"; /**
 * Processor.ts
 * purpose: the core synthesis engine
 */

/**
 * Processor.ts
 * purpose: the core synthesis engine
 */

/**
 * The core synthesis engine of SpessaSynth.
 * This module converts sound bank and MIDI data into PCM audio data.
 * The internal synthesis system is modeled after SoundFont2 synthesis model,
 * with additional extensions and functionality.
 *
 * [MIDI implementation of the synthesizer can be found here.](../../docs/extra/midi-implementation.md)
 *
 * ### Effect processors reference
 *
 * - {@link GSReverbProcessor} - How to implement your own reverb processor.
 * - {@link GSChorusProcessor} - How to implement your own chorus processor.
 * - {@link GSDelayProcessor} - How to implement your own delay processor.
 *
 * ### Managers
 *
 * - {@link SoundBankManager} - Manages the sound banks within the processor.
 *
 * @group Synthesizer
 */
export class SpessaSynthProcessor {
    /**
     * A `Promise` that must be awaited before
     * the processor can be used with a compressed sound bank.
     *
     */
    public readonly ready = BasicSoundBank.ready;
    /**
     * Sample rate, in Hertz.
     */
    public readonly sampleRate: number;
    /**
     * This property can be defined as a function that listens for events.
     * All events are defined in {@link SynthesizerEvent}.
     *
     * @param event The event that occurred.
     */
    public onEventCall?: (event: SynthesizerEventCallback) => unknown;
    /**
     * Core synthesis engine.
     */
    private readonly synthCore: SynthesizerCore;
    /**
     * For applying the snapshot after an override sound bank too.
     */
    private savedSnapshot?: SynthesizerSnapshot;

    /**
     * Initializes a new MIDI Synthesizer engine.
     * @param sampleRate The sample rate of the synthesizer, in Hertz.
     * @param opts Additional options when initializing the synthesizer.
     */
    public constructor(
        sampleRate: number,
        opts: Partial<SynthProcessorOptions> = {}
    ) {
        const options = fillWithDefaults(opts, DEFAULT_SYNTH_OPTIONS);
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

        // Bind methods for less overhead
        const c = this.synthCore;
        this.process = c.process.bind(c);
        this.systemExclusive = c.systemExclusive.bind(c);
        this.controllerChange = c.controllerChange.bind(c);
        this.noteOn = c.noteOn.bind(c);
        this.noteOff = c.noteOff.bind(c);
        this.polyPressure = c.polyPressure.bind(c);
        this.channelPressure = c.channelPressure.bind(c);
        this.pitchWheel = c.pitchWheel.bind(c);
        this.programChange = c.programChange.bind(c);
        this.processMessage = c.processMessage.bind(c);
        this.processMessages = c.processMessages.bind(c);

        for (let i = 0; i < 16; i++) {
            // Don't send events as we're creating the initial channels
            this.synthCore.createMIDIChannel(false);
        }
        void this.ready.then(() => {
            SpessaLog.info("%cSpessaSynth is ready!", ConsoleColors.recognized);
        });
    }

    /**
     * All MIDI channels of the synthesizer.
     * @readonly
     */
    public get midiChannels(): readonly MIDIChannel[] {
        return this.synthCore.midiChannels;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * The global MIDI parameters of the synthesizer.
     * These are only editable via MIDI messages.
     */
    public get midiParameters(): Readonly<GlobalMIDIParameter> {
        return this.synthCore.midiParameters;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * The global system parameters of the synthesizer.
     * These are only editable via the API.
     *
     * Use {@link SpessaSynthProcessor.setSystemParameter} to set them.
     */
    public get systemParameters(): Readonly<GlobalSystemParameter> {
        return this.synthCore.systemParameters;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Current total amount of voices that are currently playing.
     */
    public get voiceCount() {
        return this.synthCore.voiceCount;
    }

    /**
     * The current time of the synthesizer, in seconds.
     */
    public get currentTime() {
        return this.synthCore.currentTime;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Synthesizer's reverb processor.
     */
    public get reverbProcessor() {
        return this.synthCore.reverbProcessor;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Synthesizer's chorus processor.
     */
    public get chorusProcessor() {
        return this.synthCore.chorusProcessor;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Synthesizer's delay processor.
     */
    public get delayProcessor() {
        return this.synthCore.delayProcessor;
    }

    /**
     * The sound bank manager, which manages all sound banks and presets.
     */
    public get soundBankManager() {
        return this.synthCore.soundBankManager;
    }

    /**
     * Executes a system exclusive message for the synthesizer.
     *
     * > **Tip**
     * >
     * > Refer to the [MIDI Implementation](../../docs/extra/midi-implementation.md)
     * > for the list of supported System Exclusives.
     *
     * @param syx The system exclusive message as an array of bytes.
     * @param channelOffset The channel offset for the message as they usually can only address the first 16 channels.
     * For example, to send a system exclusive on channel 16,
     * send a system exclusive for channel 0 and set an offset of 16.
     */
    public systemExclusive(syx: SysExAcceptedArray, channelOffset?: number) {
        // Patched with core in the constructor.
        void syx;
        void channelOffset;
    }

    /**
     * Executes a MIDI controller change message on the specified channel.
     * @param channel The MIDI channel to change the controller on.
     * It usually ranges from 0 to 15, but it depends on the channel count.
     * @param controller The MIDI controller number (0-127).
     * Refer to the [MIDI Implementation](../../docs/extra/midi-implementation.md) for the list of controllers
     * supported by default.
     * @param value The value of the controller (0-127).
     */
    public controllerChange(
        channel: number,
        controller: MIDIController,
        value: number
    ) {
        // Patched with core in the constructor.
        void channel;
        void controller;
        void value;
    }

    /**
     * Executes a MIDI Note On message on the specified channel.
     * Starts playing a note.
     * @param channel The MIDI channel to send the note on.
     * It usually ranges from 0 to 15, but it depends on the channel count.
     * @param midiNote The MIDI note number to play.
     * Ranges from 0 to 127.
     * @param velocity The velocity of the note, from 0 to 127.
     * Ranges from 0 to 127, where 127 is the loudest and 1 is the quietest.
     * If the velocity is 0, it will be treated as a Note Off message.
     */
    public noteOn(channel: number, midiNote: number, velocity: number) {
        // Patched with core in the constructor.
        void channel;
        void midiNote;
        void velocity;
    }

    /**
     * Executes a MIDI Note Off message on the specified channel.
     * Stops playing a note.
     * @param channel The MIDI channel to send the note off.
     * It usually ranges from 0 to 15, but it depends on the channel count.
     * @param midiNote The MIDI note number to stop playing.
     * Ranges from 0 to 127.
     */
    public noteOff(channel: number, midiNote: number) {
        // Patched with core in the constructor.
        void channel;
        void midiNote;
    }

    /**
     * Executes a MIDI Poly Pressure (Aftertouch) message on the specified channel.
     * This differs from the Channel Pressure in that it's per-note and not for the whole channel.
     * @param channel The MIDI channel to send the poly pressure on.
     * It usually ranges from 0 to 15, but it depends on the channel count.
     * @param midiNote The MIDI note number to apply the pressure to.
     * Ranges from 0 to 127.
     * @param pressure The pressure value, from 0 to 127.
     */
    public polyPressure(channel: number, midiNote: number, pressure: number) {
        // Patched with core in the constructor.
        void channel;
        void midiNote;
        void pressure;
    }

    /**
     * Executes a MIDI Channel Pressure (Aftertouch) message on the specified channel.
     * @param channel The MIDI channel to send the channel pressure on.
     * It usually ranges from 0 to 15, but it depends on the channel count.
     * @param pressure The pressure value, from 0 to 127.
     */
    public channelPressure(channel: number, pressure: number) {
        // Patched with core in the constructor.
        void channel;
        void pressure;
    }

    /**
     * Executes a MIDI Pitch Wheel message on the specified channel.
     * @param channel The MIDI channel to send the pitch wheel on.
     * It usually ranges from 0 to 15, but it depends on the channel count.
     * @param pitch The new 14-bit MIDI pitch value (0-16,383). 8,192 is center.
     * @param midiNote The MIDI note number for the per-note pitch wheel mode.
     * Leave unset or set it to -1 for the regular pitch wheel.
     */
    public pitchWheel(channel: number, pitch: number, midiNote?: number) {
        // Patched with core in the constructor.
        void channel;
        void pitch;
        void midiNote;
    }

    /**
     * Executes a MIDI Program Change message on the specified channel.
     * @param channel The MIDI channel to send the program change on.
     * It usually ranges from 0 to 15, but it depends on the channel count.
     * @param programNumber The program number to change to, from 0 to 127.
     */
    public programChange(channel: number, programNumber: number) {
        // Patched with core in the constructor.
        void channel;
        void programNumber;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Processes a raw MIDI message and allows scheduling it at a specific time.
     * @param message The binary MIDI message data to process.
     * @param channelOffset The channel offset for the message. It will be added to message's channel number if applicable.
     * @param options Additional options for scheduling the message.
     */
    public processMessage(
        message: SysExAcceptedArray | MIDIMessage,
        channelOffset?: number,
        options?: SynthMethodOptions
    ) {
        // Patched with core in the constructor.
        void message;
        void channelOffset;
        void options;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Processes multiple MIDI messages and allows scheduling them at a specific time.
     * @param message The binary MIDI messages to process.
     * @param channelOffset The channel offset for the messages. It will be added to messages' channel numbers if applicable.
     * @param options Additional options for scheduling the messages.
     */
    public processMessages(
        message: (SysExAcceptedArray | MIDIMessage)[],
        channelOffset?: number,
        options?: SynthMethodOptions
    ) {
        // Patched with core in the constructor.
        void message;
        void channelOffset;
        void options;
    }

    /**
     * Renders Float32 PCM audio data to stereo outputs; buffer size must be equal or smaller than {@link SynthProcessorOptions.maxBufferSize `maxBufferSize`}.
     * All float arrays must have the same length.
     *
     * > **Danger**
     * >
     * > This method renders a single quantum of audio.
     * > The LFOs and envelopes are only processed at the beginning.
     * > `sampleCount` cannot exceed `maxBufferSize`. Larger values will throw an exception!
     *
     * > **Tip**
     * >
     * > The legacy `processSplit` method has been superseded in 4.4.0 by process with visualization channels.
     * > This approach allows visualization with insertion effects and upcoming EQ.
     *
     * @param left The left output buffer for PCM data.
     * @param right The right output buffer for PCM data.
     * @param startIndex The offset at which to start rendering audio in the provided arrays. Default is 0.
     * @param sampleCount The number of samples to render.
     * Default is the entire length, starting from `startIndex`.
     * @param channelOutputs optional stereo channel outputs with dry (no effects) PCM data of specific channels.
     * These shouldn't be added to the `left` and `right` outputs. Recommended use-case is visualization.
     */
    public process(
        left: Float32Array,
        right: Float32Array,
        startIndex?: number,
        sampleCount?: number,
        channelOutputs?: Float32Array[][]
    ) {
        // Patched with core in the constructor.
        void left;
        void right;
        void startIndex;
        void sampleCount;
        void channelOutputs;
    }

    /**
     * A handler for missing presets during program change.
     * By default, it warns to console.
     * It may be useful for allowing the synthesizer to work without any sound banks.
     * @param patch The MIDI patch that was requested.
     * @param system The MIDI System for the request.
     * @returns If a {@link BasicPreset} instance is returned, it will be used by the channel as a fallback.
     */
    public onMissingPreset = (
        patch: MIDIPatch,
        system: MIDISystem
    ): BasicPreset | undefined => {
        SpessaLog.warn(
            `No preset found for ${MIDIPatchTools.toMIDIString(patch)}! Did you forget to add a sound bank?`
        );
        // Make tsc happy!
        void system;
        return undefined;
    };

    // noinspection JSUnusedGlobalSymbols
    /**
     * Locks or unlocks a given {@link GlobalMIDIParameter}.
     * This prevents any changes to it until it's unlocked.
     * @param parameter The Global MIDI Parameter to lock.
     * @param isLocked If the parameter should be locked.
     */
    public lockMIDIParameter<P extends keyof GlobalMIDIParameter>(
        parameter: P,
        isLocked: boolean
    ) {
        this.synthCore.lockMIDIParameter(parameter, isLocked);
    }

    /**
     * Sets a {@link GlobalSystemParameter} of the synthesizer.
     * @param parameter The type of the system parameter to set.
     * @param value The value to set for the system parameter.
     */
    public setSystemParameter<P extends keyof GlobalSystemParameter>(
        parameter: P,
        value: GlobalSystemParameter[P]
    ) {
        this.synthCore.setSystemParameter(parameter, value);
    }

    /**
     * Executes a full synthesizer reset.
     * This will reset all controllers to their default values,
     * except for the locked controllers.
     * @param system The MIDI system to reset the synthesizer to. Defaults to `gs`.
     */
    public reset(system: MIDISystem = DEFAULT_SYNTH_MODE) {
        this.synthCore.reset(system);
    }

    /**
     * Applies the snapshot to this `SpessaSynthProcessor` instance.
     *
     * > **Warning**
     * >
     * > This method overrides the existing System Parameters with the ones from the snapshot.
     *
     * @param snapshot The snapshot to apply.
     */
    public applySnapshot(snapshot: SynthesizerSnapshot) {
        this.savedSnapshot = snapshot;
        applySnapshot.call(this.synthCore, snapshot);
        // Don't reset here, I don't know why I put a reset here previously.
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Gets a synthesizer snapshot from this processor instance.
     */
    public getSnapshot(): SynthesizerSnapshot {
        return getSynthesizerSnapshot.call(this.synthCore);
    }

    /**
     * Sets the embedded sound bank.
     * @param bank The sound bank file to set.
     * @param offset The bank offset of the embedded sound bank.
     * @internal
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
            this.applySnapshot(this.savedSnapshot);
        }
        SpessaLog.info(
            `%cEmbedded sound bank set at offset %c${offset}`,
            ConsoleColors.recognized,
            ConsoleColors.value
        );
    }

    /**
     * Removes the embedded sound bank from the synthesizer.
     * @internal
     */
    public clearEmbeddedSoundBank() {
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

    /**
     * Creates a new MIDI channel and adds it to the synthesizer.
     * Emits a {@link SynthesizerEvent.channelAdded} event.
     */
    public createMIDIChannel() {
        this.synthCore.createMIDIChannel(true);
    }

    /**
     * Stops all notes on all channels.
     * @param force If true, all notes are stopped immediately,
     * otherwise they are stopped gracefully.
     */
    public stopAllChannels(force = false) {
        this.synthCore.stopAllChannels(force);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     *  Destroy the synthesizer processor, clearing all channels and voices.
     *  This is irreversible, so use with caution.
     */
    public destroy() {
        this.synthCore.destroySynthProcessor();
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Clears the synthesizer's voice cache.
     * This can be used to hear the changes after editing a {@link BasicSoundBank}
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
     * @internal
     */
    public getVoicesForPreset(
        preset: SynthesizerPatch,
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
    private callEvent<K extends keyof SynthesizerEvent>(
        eventName: K,
        eventData: SynthesizerEvent[K]
    ) {
        this.onEventCall?.({
            type: eventName,
            data: eventData
        } as SynthesizerEventCallback);
    }

    private missingPreset(patch: MIDIPatch, system: MIDISystem) {
        return this.onMissingPreset(patch, system);
    }
}
