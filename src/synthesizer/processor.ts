import { SpessaSynthInfo } from "../utils/loggin";
import { consoleColors } from "../utils/other";
import {
    DEFAULT_SYNTH_METHOD_OPTIONS,
    EMBEDDED_SOUND_BANK_ID,
    MIDI_CHANNEL_COUNT
} from "./audio_engine/engine_components/synth_constants";
import { stbvorbis } from "../externals/stbvorbis_sync/stbvorbis_wrapper";
import {
    getAllMasterParametersInternal,
    getMasterParameterInternal,
    setMasterParameterInternal
} from "./audio_engine/engine_methods/controller_control/master_parameters";
import { SoundBankManager } from "./audio_engine/engine_components/sound_bank_manager";
import { PAN_SMOOTHING_FACTOR } from "./audio_engine/engine_components/dsp_chain/stereo_panner";
import { FILTER_SMOOTHING_FACTOR } from "./audio_engine/engine_components/dsp_chain/lowpass_filter";
import { getEvent } from "../midi/midi_message";
import { IndexedByteArray } from "../utils/indexed_array";
import { DEFAULT_SYNTH_OPTIONS } from "./audio_engine/engine_components/synth_processor_options";
import { fillWithDefaults } from "../utils/fill_with_defaults";
import { killVoicesIntenral } from "./audio_engine/engine_methods/stopping_notes/voice_killing";
import { getVoicesForPresetInternal, getVoicesInternal } from "./audio_engine/engine_components/voice";
import { systemExclusiveInternal } from "./audio_engine/engine_methods/system_exclusive";
import { resetAllControllersInternal } from "./audio_engine/engine_methods/controller_control/reset_controllers";
import { SynthesizerSnapshot } from "./audio_engine/snapshot/synthesizer_snapshot";
import type {
    SynthMethodOptions,
    SynthProcessorEvent,
    SynthProcessorEventData,
    SynthProcessorOptions,
    VoiceList
} from "./types";
import { type MIDIController, type MIDIMessageType, midiMessageTypes } from "../midi/enums";
import { ProtectedSynthValues } from "./audio_engine/engine_components/internal_synth_values";
import { KeyModifierManager } from "./audio_engine/engine_components/key_modifier_manager";
import { MIDIChannel } from "./audio_engine/engine_components/midi_channel";
import { SoundBankLoader } from "../soundbank/sound_bank_loader";
import { customControllers } from "./enums";
import type { MIDIPatch } from "../soundbank/basic_soundbank/midi_patch";

/**
 * Processor.ts
 * purpose: the core synthesis engine
 */

// Gain smoothing for rapid volume changes. Must be run EVERY SAMPLE
const GAIN_SMOOTHING_FACTOR = 0.01;

// The core synthesis engine of spessasynth.
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
    public enableEffects = true;

    /**
     * Is the event system enabled?
     */
    public enableEventSystem: boolean;

    /**
     * Calls when an event occurs.
     * @param event The event that occurred.
     */
    public onEventCall?: (event: SynthProcessorEvent) => unknown;

    /**
     * Executes a system exclusive message for the synthesizer.
     * @param syx The system exclusive message as an array of bytes.
     * @param channelOffset The channel offset to apply (default is 0).
     */
    public readonly systemExclusive: typeof systemExclusiveInternal =
        systemExclusiveInternal.bind(this) as typeof systemExclusiveInternal;
    /**
     * Executes a full system reset of all controllers.
     * This will reset all controllers to their default values,
     * except for the locked controllers.
     */
    public readonly resetAllControllers: typeof resetAllControllersInternal =
        resetAllControllersInternal.bind(
            this
        ) as typeof resetAllControllersInternal;
    /**
     * Sets a master parameter of the synthesizer.
     * @param type The type of the master parameter to set.
     * @param value The value to set for the master parameter.
     */
    public readonly setMasterParameter: typeof setMasterParameterInternal =
        setMasterParameterInternal.bind(
            this
        ) as typeof setMasterParameterInternal;
    // noinspection JSUnusedGlobalSymbols
    /**
     * Gets a master parameter of the synthesizer.
     * @param type The type of the master parameter to get.
     * @returns The value of the master parameter.
     */
    public readonly getMasterParameter: typeof getMasterParameterInternal =
        getMasterParameterInternal.bind(
            this
        ) as typeof getMasterParameterInternal;
    /**
     * Gets all master parameters of the synthesizer.
     * @returns All the master parameters.
     */
    public readonly getAllMasterParameters: typeof getAllMasterParametersInternal =
        getAllMasterParametersInternal.bind(
            this
        ) as typeof getAllMasterParametersInternal;
    /**
     * Gets voices for a preset.
     * @param preset The preset to get voices for.
     * @param bankMSB The bank to cache the voices in.
     * @param program Program to cache the voices in.
     * @param midiNote The MIDI note to use.
     * @param velocity The velocity to use.
     * @param realKey The real MIDI note if the "midiNote" was changed by MIDI Tuning Standard.
     * @returns Output is an array of voices.
     * @remarks
     * This is a public method, but it is only intended to be used by the sequencer.
     */
    public readonly getVoicesForPreset: typeof getVoicesForPresetInternal =
        getVoicesForPresetInternal.bind(
            this
        ) as typeof getVoicesForPresetInternal;
    /**
     * Kills the specified number of voices based on their priority.
     * @param amount The number of voices to remove.
     */
    public readonly killVoices: typeof killVoicesIntenral =
        killVoicesIntenral.bind(this) as typeof killVoicesIntenral;
    // Protected methods
    protected readonly getVoices = getVoicesInternal.bind(this);
    // This contains the properties that have to be accessed from the MIDI channels.
    protected privateProps: ProtectedSynthValues;
    /**
     * Tor applying the snapshot after an override sound bank too.
     */
    protected savedSnapshot?: SynthesizerSnapshot;
    /**
     * Synth's event queue from the main thread
     */
    protected eventQueue: { callback: () => unknown; time: number }[] = [];

    // The time of a single sample, in seconds.
    private readonly sampleTime: number;

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
        this.enableEffects = options.enableEffects;
        this.enableEventSystem = options.enableEventSystem;
        this.currentSynthTime = options.initialTime;
        this.sampleRate = sampleRate;
        this.sampleTime = 1 / sampleRate;
        if (Number.isNaN(options.initialTime) || Number.isNaN(sampleRate)) {
            throw new TypeError("Initial time or sample rate is NaN!");
        }

        // Initialize the protected synth values
        this.privateProps = new ProtectedSynthValues(
            this.callEvent.bind(this),
            this.getVoices.bind(this),
            this.killVoices.bind(this),
            // These smoothing factors were tested on 44,100 Hz, adjust them to target sample rate here
            // Volume envelope smoothing factor
            GAIN_SMOOTHING_FACTOR * (44_100 / sampleRate),
            // Pan smoothing factor
            PAN_SMOOTHING_FACTOR * (44_100 / sampleRate),
            // Filter smoothing factor
            FILTER_SMOOTHING_FACTOR * (44_100 / sampleRate)
        );

        for (let i = 0; i < MIDI_CHANNEL_COUNT; i++) {
            // Don't send events as we're creating the initial channels
            this.createMIDIChannelInternal(false);
        }
        void this.processorInitialized.then(() => {
            SpessaSynthInfo(
                "%cSpessaSynth is ready!",
                consoleColors.recognized
            );
        });
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
        this.soundBankManager.addSoundBank(
            loadedFont,
            EMBEDDED_SOUND_BANK_ID,
            offset
        );
        // Rearrange so the embedded is first (most important as it overrides all others)
        const order = this.soundBankManager.priorityOrder;
        order.pop();
        order.unshift(EMBEDDED_SOUND_BANK_ID);
        this.soundBankManager.priorityOrder = order;

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
            this.soundBankManager.soundBankList.some(
                (s) => s.id === EMBEDDED_SOUND_BANK_ID
            )
        ) {
            this.soundBankManager.deleteSoundBank(EMBEDDED_SOUND_BANK_ID);
        }
    }

    // Creates a new MIDI channel for the synthesizer.
    public createMIDIChannel() {
        this.createMIDIChannelInternal(true);
    }

    /**
     * Stops all notes on all channels.
     * @param force if true, all notes are stopped immediately, otherwise they are stopped gracefully.
     */
    public stopAllChannels(force = false) {
        SpessaSynthInfo("%cStop all received!", consoleColors.info);
        for (const channel of this.midiChannels) {
            channel.stopAllNotes(force);
        }
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
    public renderAudio(
        outputs: Float32Array[],
        reverb: Float32Array[],
        chorus: Float32Array[],
        startIndex = 0,
        sampleCount = 0
    ) {
        this.renderAudioSplit(
            reverb,
            chorus,
            new Array(16).fill(outputs) as Float32Array[][],
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
    public renderAudioSplit(
        reverbChannels: Float32Array[],
        chorusChannels: Float32Array[],
        separateChannels: Float32Array[][],
        startIndex = 0,
        sampleCount = 0
    ) {
        // Process event queue
        const time = this.currentSynthTime;
        while (this.eventQueue[0]?.time <= time) {
            this.eventQueue.shift()?.callback();
        }
        const revL = reverbChannels[0];
        const revR = reverbChannels[1];
        const chrL = chorusChannels[0];
        const chrR = chorusChannels[1];

        // Validate
        startIndex = Math.max(startIndex, 0);
        const quantumSize =
            sampleCount || separateChannels[0][0].length - startIndex;

        // For every channel
        this.totalVoicesAmount = 0;
        for (const [index, channel] of this.midiChannels.entries()) {
            if (channel.voices.length === 0 || channel.isMuted) {
                // There's nothing to do!
                continue;
            }
            const voiceCount = channel.voices.length;
            const ch = index % 16;

            // Render to the appropriate output
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
            // If voice count changed, update voice amount
            if (channel.voices.length !== voiceCount) {
                channel.sendChannelProperty();
            }
        }

        // Advance the time appropriately
        this.currentSynthTime += quantumSize * this.sampleTime;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     *  Destroy the synthesizer processor, clearing all channels and voices.
     *  This is irreversible, so use with caution.
     */
    public destroySynthProcessor() {
        for (const c of this.midiChannels) {
            c.voices.length = 0;
            c.sustainedVoices.length = 0;
            c.lockedControllers = [];
            c.preset = undefined;
        }
        this.clearCache();
        this.midiChannels.length = 0;
        this.soundBankManager.destroy();
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
        this.midiChannels[channel].controllerChange(
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
        this.midiChannels[channel].noteOn(midiNote, velocity);
    }

    /**
     * Executes a MIDI Note-off message on the specified channel.
     * @param channel The MIDI channel to send the note off.
     * @param midiNote The MIDI note number to stop playing.
     */
    public noteOff(channel: number, midiNote: number) {
        this.midiChannels[channel].noteOff(midiNote);
    }

    /**
     * Executes a MIDI Poly Pressure (Aftertouch) message on the specified channel.
     * @param channel The MIDI channel to send the poly pressure on.
     * @param midiNote The MIDI note number to apply the pressure to.
     * @param pressure The pressure value, from 0 to 127.
     */
    public polyPressure(channel: number, midiNote: number, pressure: number) {
        this.midiChannels[channel].polyPressure(midiNote, pressure);
    }

    /**
     * Executes a MIDI Channel Pressure (Aftertouch) message on the specified channel.
     * @param channel The MIDI channel to send the channel pressure on.
     * @param pressure The pressure value, from 0 to 127.
     */
    public channelPressure(channel: number, pressure: number) {
        this.midiChannels[channel].channelPressure(pressure);
    }

    /**
     * Executes a MIDI Pitch Wheel message on the specified channel.
     * @param channel The MIDI channel to send the pitch wheel on.
     * @param pitch The new pitch value: 0-16384
     */
    public pitchWheel(channel: number, pitch: number) {
        this.midiChannels[channel].pitchWheel(pitch);
    }

    /**
     * Executes a MIDI Program Change message on the specified channel.
     * @param channel The MIDI channel to send the program change on.
     * @param programNumber The program number to change to, from 0 to 127.
     */
    public programChange(channel: number, programNumber: number) {
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
    public processMessage(
        message: Uint8Array | number[],
        channelOffset = 0,
        force = false,
        options: SynthMethodOptions = DEFAULT_SYNTH_METHOD_OPTIONS
    ) {
        const call = () => {
            const statusByteData = getEvent(message[0] as MIDIMessageType);

            const channel = statusByteData.channel + channelOffset;
            // Process the event
            switch (statusByteData.status as MIDIMessageType) {
                case midiMessageTypes.noteOn: {
                    const velocity = message[2];
                    if (velocity > 0) {
                        this.noteOn(channel, message[1], velocity);
                    } else {
                        this.noteOff(channel, message[1]);
                    }
                    break;
                }

                case midiMessageTypes.noteOff: {
                    if (force) {
                        this.midiChannels[channel].killNote(message[1]);
                    } else {
                        this.noteOff(channel, message[1]);
                    }
                    break;
                }

                case midiMessageTypes.pitchWheel: {
                    // LSB | (MSB << 7)
                    this.pitchWheel(channel, (message[2] << 7) | message[1]);
                    break;
                }

                case midiMessageTypes.controllerChange: {
                    this.controllerChange(
                        channel,
                        message[1] as MIDIController,
                        message[2]
                    );
                    break;
                }

                case midiMessageTypes.programChange: {
                    this.programChange(channel, message[1]);
                    break;
                }

                case midiMessageTypes.polyPressure: {
                    this.polyPressure(channel, message[0], message[1]);
                    break;
                }

                case midiMessageTypes.channelPressure: {
                    this.channelPressure(channel, message[1]);
                    break;
                }

                case midiMessageTypes.systemExclusive: {
                    this.systemExclusive(
                        new IndexedByteArray(message.slice(1)),
                        channelOffset
                    );
                    break;
                }

                case midiMessageTypes.reset: {
                    // Do not **force** stop channels (breaks seamless loops, for example th06)
                    this.stopAllChannels();
                    this.resetAllControllers();
                    break;
                }

                default: {
                    break;
                }
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
    public clearCache() {
        this.privateProps.cachedVoices.clear();
    }

    /**
     * @param volume {number} 0 to 1
     */
    protected setMIDIVolume(volume: number) {
        // GM2 specification, section 4.1: volume is squared.
        // Though, according to my own testing, Math.E seems like a better choice
        this.privateProps.midiVolume = Math.pow(volume, Math.E);
    }

    /**
     * Sets the synth's primary tuning.
     * @param cents
     */
    protected setMasterTuning(cents: number) {
        cents = Math.round(cents);
        for (const channel of this.midiChannels) {
            channel.setCustomController(customControllers.masterTuning, cents);
        }
    }

    /**
     * Calls synth event
     * @param eventName the event name
     * @param eventData the event data
     */
    protected callEvent<K extends keyof SynthProcessorEventData>(
        eventName: K,
        eventData: SynthProcessorEventData[K]
    ) {
        this.onEventCall?.({
            type: eventName,
            data: eventData
        } as SynthProcessorEvent);
    }

    protected getCachedVoice(
        patch: MIDIPatch,
        midiNote: number,
        velocity: number
    ): VoiceList | undefined {
        return this.privateProps.cachedVoices.get(
            this.getCachedVoiceIndex(patch, midiNote, velocity)
        );
    }

    protected setCachedVoice(
        patch: MIDIPatch,
        midiNote: number,
        velocity: number,
        voices: VoiceList
    ) {
        this.privateProps.cachedVoices.set(
            this.getCachedVoiceIndex(patch, midiNote, velocity),
            voices
        );
    }

    private getCachedVoiceIndex(
        patch: MIDIPatch,
        midiNote: number,
        velocity: number
    ) {
        let bankMSB = patch.bankMSB;
        let bankLSB = patch.bankLSB;
        const { isGMGSDrum, program } = patch;
        if (isGMGSDrum) {
            bankMSB = 128;
            bankLSB = 0;
        }
        // 128x128x128x128x128 array!
        return (
            bankMSB + // 128 ^ 0
            bankLSB * 128 + // 128 ^ 1
            program * 16_384 + // 128 ^ 2
            2_097_152 * midiNote + // 128 ^ 3
            268_435_456 * velocity
        ); // 128 ^ 4
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
            this.callEvent("newChannel", undefined);
            channel.sendChannelProperty();
            channel.setDrums(true);
        }
    }

    private updatePresetList() {
        const mainFont = this.soundBankManager.presetList;
        this.clearCache();
        this.privateProps.callEvent("presetListChange", mainFont);
        this.getDefaultPresets();
        // Unlock presets
        for (const c of this.midiChannels) {
            c.setPresetLock(false);
        }
        this.resetAllControllers();
    }

    private getDefaultPresets() {
        // Override this to XG, to set the default preset to NOT be XG drums!
        this.privateProps.defaultPreset = this.soundBankManager.getPreset(
            {
                bankLSB: 0,
                bankMSB: 0,
                program: 0,
                isGMGSDrum: false
            },
            "xg"
        );
        this.privateProps.drumPreset = this.soundBankManager.getPreset(
            {
                bankLSB: 0,
                bankMSB: 0,
                program: 0,
                isGMGSDrum: true
            },
            "gs"
        );
    }
}
