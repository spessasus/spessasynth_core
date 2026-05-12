import { SpessaLog } from "../utils/loggin";
import { ConsoleColors } from "../utils/other";
import {
    DEFAULT_SYNTH_MODE,
    EMBEDDED_SOUND_BANK_ID
} from "./audio_engine/synth_constants";
import { stbvorbis } from "../externals/stbvorbis_sync/stbvorbis_wrapper";
import { DEFAULT_SYNTH_OPTIONS } from "./audio_engine/synth_processor_options";
import { fillWithDefaults } from "../utils/fill_with_defaults";
import {
    applySnapshot,
    getSynthesizerSnapshot,
    type SynthesizerSnapshot
} from "./audio_engine/synthesizer_snapshot";
import type {
    SynthMethodOptions,
    SynthProcessorEvent,
    SynthProcessorEventData,
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
import type { GlobalMasterParameter } from "./audio_engine/master_parameters";
import type { MIDIChannel } from "./audio_engine/channel/midi_channel";
import type { MIDIGlobalParameter } from "./audio_engine/midi_parameters";
import type { MIDISystem } from "../soundbank/types";
import type { SysExAcceptedArray } from "../midi/types";

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

    /**
     * Renders float32 audio data to stereo outputs; buffer size must be equal or smaller than `maxBufferSize`.
     * All float arrays must have the same length.
     * @param left the left output channel.
     * @param right the right output channel.
     * @param startIndex start offset of the passed arrays, rendering starts at this index, defaults to 0.
     * @param sampleCount the length of the rendered buffer, defaults to float32array length - startOffset.
     */
    public readonly process: (
        left: Float32Array,
        right: Float32Array,
        startIndex?: number,
        sampleCount?: number
    ) => void;

    // noinspection JSUnusedGlobalSymbols
    /**
     * Renders float32 audio data to stereo outputs; buffer size must be equal or smaller than `maxBufferSize`.
     * All float arrays must have the same length.
     * @param outputs any number stereo pairs (L, R) to render channels separately into.
     * @param effectsLeft the left stereo effect output buffer.
     * @param effectsRight the left stereo effect output buffer.
     * @param startIndex start offset of the passed arrays, rendering starts at this index, defaults to 0.
     * @param sampleCount the length of the rendered buffer, defaults to float32array length - startOffset.
     */
    public readonly processSplit: (
        outputs: Float32Array[][],
        effectsLeft: Float32Array,
        effectsRight: Float32Array,
        startIndex?: number,
        sampleCount?: number
    ) => void;

    /**
     * Executes a system exclusive message for the synthesizer.
     * @param syx The system exclusive message as an array of bytes.
     * @param channelOffset The channel offset to apply (default is 0).
     */
    public readonly systemExclusive: (
        syx: SysExAcceptedArray,
        channelOffset?: number
    ) => void;

    /**
     * Executes a MIDI controller change message on the specified channel.
     * @param channel The MIDI channel to change the controller on.
     * @param controller The MIDI controller number (0-127).
     * @param value The value of the controller (0-127).
     */
    public readonly controllerChange: (
        channel: number,
        controller: MIDIController,
        value: number
    ) => void;

    /**
     * Executes a MIDI Note-on message on the specified channel.
     * @param channel The MIDI channel to send the note on.
     * @param midiNote The MIDI note number to play.
     * @param velocity The velocity of the note, from 0 to 127.
     * @remarks
     * If the velocity is 0, it will be treated as a Note-off message.
     */
    public readonly noteOn: (
        channel: number,
        midiNote: number,
        velocity: number
    ) => void;

    /**
     * Executes a MIDI Note-off message on the specified channel.
     * @param channel The MIDI channel to send the note off.
     * @param midiNote The MIDI note number to stop playing.
     */
    public readonly noteOff: (channel: number, midiNote: number) => void;

    /**
     * Executes a MIDI Poly Pressure (Aftertouch) message on the specified channel.
     * @param channel The MIDI channel to send the poly pressure on.
     * @param midiNote The MIDI note number to apply the pressure to.
     * @param pressure The pressure value, from 0 to 127.
     */
    public readonly polyPressure: (
        channel: number,
        midiNote: number,
        pressure: number
    ) => void;

    /**
     * Executes a MIDI Channel Pressure (Aftertouch) message on the specified channel.
     * @param channel The MIDI channel to send the channel pressure on.
     * @param pressure The pressure value, from 0 to 127.
     */
    public readonly channelPressure: (
        channel: number,
        pressure: number
    ) => void;

    /**
     * Executes a MIDI Pitch Wheel message on the specified channel.
     * @param channel The MIDI channel to send the pitch wheel on.
     * @param pitch The new pitch value: 0-16383
     * @param midiNote The MIDI note number (optional), pass -1 for the regular pitch wheel.
     */
    public readonly pitchWheel: (
        channel: number,
        pitch: number,
        midiNote?: number
    ) => void;

    /**
     * Executes a MIDI Program Change message on the specified channel.
     * @param channel The MIDI channel to send the program change on.
     * @param programNumber The program number to change to, from 0 to 127.
     */
    public readonly programChange: (
        channel: number,
        programNumber: number
    ) => void;

    // noinspection JSUnusedGlobalSymbols
    /**
     * Processes a raw MIDI message.
     * @param message The message to process.
     * @param channelOffset The channel offset for the message.
     * @param options Additional options for scheduling the message.
     */
    public readonly processMessage: (
        message: Uint8Array | number[],
        channelOffset?: number,
        options?: SynthMethodOptions
    ) => void;

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
        this.processSplit = c.processSplit.bind(c);
        this.systemExclusive = c.systemExclusive.bind(c);
        this.controllerChange = c.controllerChange.bind(c);
        this.noteOn = c.noteOn.bind(c);
        this.noteOff = c.noteOff.bind(c);
        this.polyPressure = c.polyPressure.bind(c);
        this.channelPressure = c.channelPressure.bind(c);
        this.pitchWheel = c.pitchWheel.bind(c);
        this.programChange = c.programChange.bind(c);
        this.processMessage = c.processMessage.bind(c);

        for (let i = 0; i < 16; i++) {
            // Don't send events as we're creating the initial channels
            this.synthCore.createMIDIChannel(false);
        }
        void this.processorInitialized.then(() => {
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
    public get midiParameters(): Readonly<MIDIGlobalParameter> {
        return this.synthCore.midiParameters;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * The global master parameters of the synthesizer.
     * These are only editable via the API.
     */
    public get masterParameters(): Readonly<GlobalMasterParameter> {
        return this.synthCore.masterParameters;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Current total amount of voices that are currently playing.
     */
    public get voiceCount() {
        return this.synthCore.voiceCount;
    }

    /**
     * The current time of the synthesizer, in seconds. You probably should not modify this directly.
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

    // noinspection JSUnusedGlobalSymbols
    /**
     * Handles the custom key overrides: velocity and preset
     */
    public get keyModifierManager() {
        return this.synthCore.keyModifierManager;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Renders float32 audio data to stereo outputs; buffer size of 128 is recommended.
     * All float arrays must have the same length.
     * @param outputs output stereo channels (L, R).
     * @param reverb unused legacy parameter.
     * @param chorus unused legacy parameter.
     * @param startIndex start offset of the passed arrays, rendering starts at this index, defaults to 0.
     * @param sampleCount the length of the rendered buffer, defaults to float32array length - startOffset.
     * @deprecated use process() as the effects are now integrated.
     */
    public renderAudio(
        outputs: Float32Array[],
        reverb: Float32Array[],
        chorus: Float32Array[],
        startIndex = 0,
        sampleCount = 0
    ) {
        void reverb;
        void chorus;
        const maxBuff = this.synthCore.maxBufferSize;
        if (sampleCount > maxBuff) {
            let samples = 0;
            while (samples < sampleCount) {
                const blockSize = Math.min(maxBuff, sampleCount - samples);
                this.synthCore.process(
                    outputs[0],
                    outputs[1],
                    startIndex + samples,
                    blockSize
                );
                samples += blockSize;
            }
        } else
            this.synthCore.process(
                outputs[0],
                outputs[1],
                startIndex,
                sampleCount
            );
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Renders the float32 audio data of each channel, routing effects to external outputs.
     * Buffer size of 128 is recommended.
     * All float arrays must have the same length.
     * @param reverbChannels unused legacy parameter.
     * @param chorusChannels unused legacy parameter.
     * @param separateChannels a total of 16 stereo pairs (L, R) for each MIDI channel.
     * @param startIndex start offset of the passed arrays, rendering starts at this index, defaults to 0.
     * @param sampleCount the length of the rendered buffer, defaults to float32array length - startOffset.
     * @deprecated use processSplit() as the effects are now integrated.
     */
    public renderAudioSplit(
        reverbChannels: Float32Array[],
        chorusChannels: Float32Array[],
        separateChannels: Float32Array[][],
        startIndex = 0,
        sampleCount = 0
    ) {
        void chorusChannels;
        const maxBuff = this.synthCore.maxBufferSize;
        if (sampleCount > maxBuff) {
            let samples = 0;
            while (samples < sampleCount) {
                const blockSize = Math.min(maxBuff, sampleCount - samples);
                this.synthCore.processSplit(
                    separateChannels,
                    reverbChannels[0],
                    reverbChannels[1],
                    startIndex + samples,
                    blockSize
                );
                samples += blockSize;
            }
        } else
            this.synthCore.processSplit(
                separateChannels,
                reverbChannels[0],
                reverbChannels[1],
                startIndex,
                sampleCount
            );
    }

    /**
     * A handler for missing presets during program change. By default, it warns to console.
     * @param patch The MIDI patch that was requested.
     * @param system The MIDI System for the request.
     * @returns If a BasicPreset instance is returned, it will be used by the channel.
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

    /**
     * Sets a master parameter of the synthesizer.
     * @param type The type of the master parameter to set.
     * @param value The value to set for the master parameter.
     */
    public setMasterParameter<P extends keyof GlobalMasterParameter>(
        type: P,
        value: GlobalMasterParameter[P]
    ) {
        this.synthCore.setMasterParameter(type, value);
    }

    /**
     * Executes a full system reset of all controllers.
     * This will reset all controllers to their default values,
     * except for the locked controllers.
     */
    public resetAllControllers(system: MIDISystem = DEFAULT_SYNTH_MODE) {
        this.synthCore.reset(system);
    }

    /**
     * Applies the snapshot to this `SpessaSynthProcessor` instance.
     * @param snapshot The snapshot to apply.
     */
    public applySnapshot(snapshot: SynthesizerSnapshot) {
        this.savedSnapshot = snapshot;
        applySnapshot.call(this.synthCore, snapshot);
        this.resetAllControllers();
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
     * Creates a new MIDI channel for the synthesizer.
     */
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

    // noinspection JSUnusedGlobalSymbols
    /**
     * DEPRECATED, does nothing!
     * @param amount
     * @deprecated
     */
    public killVoices(amount: number) {
        SpessaLog.warn(
            `killVoices is deprecated, don't use it! Amount requested: ${amount}`
        );
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

    private missingPreset(patch: MIDIPatch, system: MIDISystem) {
        return this.onMissingPreset(patch, system);
    }
}
