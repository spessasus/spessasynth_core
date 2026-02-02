import type {
    CachedVoiceList,
    SynthMethodOptions,
    SynthProcessorEventData,
    SynthProcessorOptions,
    SynthSystem
} from "../types";
import type { BasicPreset } from "../../soundbank/basic_soundbank/basic_preset";
import { DEFAULT_MASTER_PARAMETERS } from "./engine_components/master_parameters";
import { Voice } from "./engine_components/voice";
import type { MIDIPatch } from "../../soundbank/basic_soundbank/midi_patch";
import { CachedVoice } from "./engine_components/voice_cache";
import { SpessaSynthInfo, SpessaSynthWarn } from "../../utils/loggin";
import { MIDIChannel } from "./engine_components/midi_channel";
import { SoundBankManager } from "./engine_components/sound_bank_manager";
import { KeyModifierManager } from "./engine_components/key_modifier_manager";
import { DEFAULT_SYNTH_MODE } from "./engine_components/synth_constants";
import { customControllers } from "../enums";
import { modulatorSources } from "../../soundbank/enums";
import {
    getAllMasterParametersInternal,
    getMasterParameterInternal,
    setMasterParameterInternal
} from "./engine_methods/controller_control/master_parameters";
import { systemExclusiveInternal } from "./engine_methods/system_exclusive";
import { getEvent } from "../../midi/midi_message";
import {
    type MIDIController,
    type MIDIMessageType,
    midiMessageTypes
} from "../../midi/enums";
import { IndexedByteArray } from "../../utils/indexed_array";
import { consoleColors } from "../../utils/other";
import { NON_CC_INDEX_OFFSET } from "../exports";
import { LowpassFilter } from "./engine_components/dsp_chain/lowpass_filter";

import type { ChorusProcessor, ReverbProcessor } from "./effects/types";

// Gain smoothing for rapid volume changes. Must be run EVERY SAMPLE
const GAIN_SMOOTHING_FACTOR = 0.01;

// Pan smoothing for rapid pan changes
const PAN_SMOOTHING_FACTOR = 0.05;
/**
 * The core synthesis engine which interacts with channels and holds all the synth parameters.
 */
export class SynthesizerCore {
    /**
     * Voices of this synthesizer, as a fixed voice pool.
     */
    public readonly voices: Voice[];

    /**
     * All MIDI channels of the synthesizer.
     */
    public midiChannels: MIDIChannel[] = [];

    /**
     * The synthesizer's reverb processor.
     */
    public readonly reverbProcessor: ReverbProcessor;

    /**
     * The synthesizer's chorus processor.
     */
    public readonly chorusProcessor: ChorusProcessor;

    /**
     * 0-1
     * This parameter sets the amount of chorus sound that will be sent to the reverb.
     * Higher values result in more sound being sent.
     */
    public chorusToReverb = 0;

    /**
     * 0-1
     * This parameter sets the amount of chorus sound that will be sent to the delay. Higher
     * values result in more sound being sent.
     */
    public chorusToDelay = 0;

    /**
     * The sound bank manager, which manages all sound banks and presets.
     */
    public soundBankManager: SoundBankManager = new SoundBankManager(
        this.updatePresetList.bind(this)
    );
    /**
     * Handles the custom key overrides: velocity and preset
     */
    public keyModifierManager: KeyModifierManager = new KeyModifierManager();
    public readonly sampleRate;
    /**
     * This.tunings[program * 128 + key] = midiNote,cents (fraction)
     * All MIDI Tuning Standard tunings, 128 keys for each of 128 programs.
     * -1 means no change.
     */
    public readonly tunings = new Float32Array(128 * 128).fill(-1);
    /**
     * The master parameters of the synthesizer.
     */
    public masterParameters = DEFAULT_MASTER_PARAMETERS;
    /**
     * The current time of the synthesizer, in seconds.
     */
    public currentTime = 0;
    /**
     * The volume gain, set by MIDI sysEx
     */
    public midiVolume = 1;

    /**
     * Are the chorus and reverb effects enabled?
     */
    public enableEffects: boolean;

    /**
     * Is the event system enabled?
     */
    public enableEventSystem: boolean;

    /**
     * The pan of the left channel.
     */
    public panLeft = 0.5;
    /**
     * The pan of the right channel.
     */
    public panRight = 0.5;
    /**
     * Synth's default (reset) preset.
     */
    public defaultPreset: BasicPreset | undefined;
    /**
     * Synth's default (reset) drum preset.
     */
    public drumPreset: BasicPreset | undefined;
    /**
     * Gain smoothing factor, adjusted to the sample rate.
     */
    public readonly gainSmoothingFactor: number;
    /**
     * Pan smoothing factor, adjusted to the sample rate.
     */
    public readonly panSmoothingFactor: number;
    /**
     * Calls when an event occurs.
     * @param eventType The event type.
     * @param eventData The event data.
     */
    public eventCallbackHandler: <K extends keyof SynthProcessorEventData>(
        eventType: K,
        eventData: SynthProcessorEventData[K]
    ) => unknown;

    public readonly missingPresetHandler: (
        patch: MIDIPatch,
        system: SynthSystem
    ) => undefined | BasicPreset;

    /**
     * Cached voices for all presets for this synthesizer.
     * Nesting is calculated in getCachedVoiceIndex, returns a list of voices for this note.
     */
    public readonly cachedVoices = new Map<number, CachedVoiceList>();
    /**
     * Sets a master parameter of the synthesizer.
     * @param type The type of the master parameter to set.
     * @param value The value to set for the master parameter.
     */
    public readonly setMasterParameter: typeof setMasterParameterInternal =
        setMasterParameterInternal.bind(this);
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
        getAllMasterParametersInternal.bind(this);
    public readonly systemExclusive: typeof systemExclusiveInternal =
        systemExclusiveInternal.bind(this);
    /**
     * Current total amount of voices that are currently playing.
     */
    public voiceCount = 0;
    /**
     * Last time the priorities were assigned.
     * Used to prevent assigning priorities multiple times when more than one voice is triggered during a quantum.
     */
    private lastPriorityAssignmentTime = 0;
    /**
     * Synth's event queue from the main thread
     */
    private eventQueue: { callback: () => unknown; time: number }[] = [];
    /**
     * The time of a single sample, in seconds.
     */
    private readonly sampleTime: number;

    public constructor(
        eventCallbackHandler: <K extends keyof SynthProcessorEventData>(
            eventType: K,
            eventData: SynthProcessorEventData[K]
        ) => unknown,
        missingPresetHandler: (
            patch: MIDIPatch,
            system: SynthSystem
        ) => BasicPreset | undefined,
        sampleRate: number,
        options: SynthProcessorOptions
    ) {
        this.eventCallbackHandler = eventCallbackHandler;
        this.missingPresetHandler = missingPresetHandler;
        this.sampleRate = sampleRate;
        this.sampleTime = 1 / sampleRate;
        this.currentTime = options.initialTime;
        this.enableEffects = options.enableEffects;
        this.enableEventSystem = options.enableEventSystem;
        // These smoothing factors were tested on 44,100 Hz, adjust them to target sample rate here
        // Volume  smoothing factor
        this.gainSmoothingFactor =
            GAIN_SMOOTHING_FACTOR * (44_100 / sampleRate);
        // Pan smoothing factor
        this.panSmoothingFactor = PAN_SMOOTHING_FACTOR * (44_100 / sampleRate);
        LowpassFilter.initCache(this.sampleRate);

        // Initialize effects
        this.reverbProcessor = options.reverbProcessor;
        this.chorusProcessor = options.chorusProcessor;

        // Initialize voices
        this.voices = [];
        for (let i = 0; i < this.masterParameters.voiceCap; i++) {
            this.voices.push(new Voice(this.sampleRate));
        }
    }

    /**
     * Assigns the first available voice for use.
     * If none available, will assign priorities.
     */
    public assignVoice() {
        for (let i = 0; i < this.masterParameters.voiceCap; i++) {
            const v = this.voices[i];
            if (!v.isActive) {
                // Prevent this voice from being stolen
                v.priority = Infinity;
                return v;
            }
        }
        // No match, assign priorities
        this.assignVoicePriorities();
        let lowest = this.voices[0];
        for (let i = 0; i < this.masterParameters.voiceCap; i++) {
            const v = this.voices[i];
            if (v.priority < lowest.priority) lowest = v;
        }
        lowest.priority = Infinity;
        return lowest;
    }

    /**
     * Stops all notes on all channels.
     * @param force if true, all notes are stopped immediately, otherwise they are stopped gracefully.
     */
    public stopAllChannels(force: boolean) {
        SpessaSynthInfo("%cStop all received!", consoleColors.info);
        for (const channel of this.midiChannels) {
            channel.stopAllNotes(force);
        }
    }

    /**
     * Processes a raw MIDI message.
     * @param message The message to process.
     * @param channelOffset The channel offset for the message.
     * @param force If true, forces the message to be processed.
     * @param options Additional options for scheduling the message.
     */
    public processMessage(
        message: Uint8Array | number[],
        channelOffset: number,
        force: boolean,
        options: SynthMethodOptions
    ) {
        const call = () => {
            const statusByteData = getEvent(message[0] as MIDIMessageType);

            const channel = statusByteData.channel + channelOffset;
            // Process the event
            switch (statusByteData.status as MIDIMessageType) {
                case midiMessageTypes.noteOn: {
                    const velocity = message[2];
                    if (velocity > 0) {
                        this.midiChannels[channel].noteOn(message[1], velocity);
                    } else {
                        this.midiChannels[channel].noteOff(message[1]);
                    }
                    break;
                }

                case midiMessageTypes.noteOff: {
                    if (force) {
                        this.midiChannels[channel].killNote(message[1]);
                    } else {
                        this.midiChannels[channel].noteOff(message[1]);
                    }
                    break;
                }

                case midiMessageTypes.pitchWheel: {
                    // LSB | (MSB << 7)
                    this.midiChannels[channel].pitchWheel(
                        (message[2] << 7) | message[1]
                    );
                    break;
                }

                case midiMessageTypes.controllerChange: {
                    this.midiChannels[channel].controllerChange(
                        message[1] as MIDIController,
                        message[2]
                    );
                    break;
                }

                case midiMessageTypes.programChange: {
                    this.midiChannels[channel].programChange(message[1]);
                    break;
                }

                case midiMessageTypes.polyPressure: {
                    this.midiChannels[channel].polyPressure(
                        message[0],
                        message[1]
                    );
                    break;
                }

                case midiMessageTypes.channelPressure: {
                    this.midiChannels[channel].channelPressure(message[1]);
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
                    this.stopAllChannels(false);
                    this.resetAllControllers();
                    break;
                }

                default: {
                    break;
                }
            }
        };

        const time = options.time;
        if (time > this.currentTime) {
            this.eventQueue.push({
                callback: call.bind(this),
                time: time
            });
            this.eventQueue.sort((e1, e2) => e1.time - e2.time);
        } else {
            call();
        }
    }

    public destroySynthProcessor() {
        this.voices.length = 0;
        for (const c of this.midiChannels) {
            c.lockedControllers = [];
            c.preset = undefined;
        }
        this.clearCache();
        this.midiChannels.length = 0;
        this.soundBankManager.destroy();
    }

    /**
     * @param channel channel to get voices for
     * @param midiNote the MIDI note to use
     * @param velocity the velocity to use
     * @returns output is an array of Voices
     */
    public getVoices(
        channel: number,
        midiNote: number,
        velocity: number
    ): CachedVoiceList {
        const channelObject = this.midiChannels[channel];

        // Override patch
        const overridePatch = this.keyModifierManager.hasOverridePatch(
            channel,
            midiNote
        );

        let preset = channelObject.preset;
        if (overridePatch) {
            const patch = this.keyModifierManager.getPatch(channel, midiNote);
            preset = this.soundBankManager.getPreset(
                patch,
                this.masterParameters.midiSystem
            );
        }

        // Warning is handled in program change
        if (!preset) {
            return [];
        }

        return this.getVoicesForPreset(preset, midiNote, velocity);
    }

    public createMIDIChannel(sendEvent: boolean) {
        const channel: MIDIChannel = new MIDIChannel(
            this,
            this.defaultPreset,
            this.midiChannels.length
        );
        this.midiChannels.push(channel);
        if (sendEvent) {
            this.callEvent("newChannel", undefined);
            channel.sendChannelProperty();
            channel.setDrums(true);
        }
    }

    /**
     * Executes a full system reset of all controllers.
     * This will reset all controllers to their default values,
     * except for the locked controllers.
     */
    public resetAllControllers(system: SynthSystem = DEFAULT_SYNTH_MODE) {
        // Call here because there are returns in this function.
        this.callEvent("allControllerReset", undefined);
        this.setMasterParameter("midiSystem", system);
        // Reset private props
        this.tunings.fill(-1); // Set all to no change
        this.setMIDIVolume(1);
        this.chorusProcessor.reset();
        this.reverbProcessor.reset();

        if (!this.drumPreset || !this.defaultPreset) {
            return;
        }
        // Reset channels
        for (
            let channelNumber = 0;
            channelNumber < this.midiChannels.length;
            channelNumber++
        ) {
            const ch: MIDIChannel = this.midiChannels[channelNumber];

            // Do not send CC changes as we call allControllerReset
            ch.resetControllers(false);
            ch.resetPreset();

            for (let ccNum = 0; ccNum < 128; ccNum++) {
                if (this.midiChannels[channelNumber].lockedControllers[ccNum]) {
                    // Was not reset so restore the value
                    this.callEvent("controllerChange", {
                        channel: channelNumber,
                        controllerNumber: ccNum as MIDIController,
                        controllerValue:
                            this.midiChannels[channelNumber].midiControllers[
                                ccNum
                            ] >> 7
                    });
                }
            }

            // Restore pitch wheel
            if (
                !this.midiChannels[channelNumber].lockedControllers[
                    NON_CC_INDEX_OFFSET + modulatorSources.pitchWheel
                ]
            ) {
                const val =
                    this.midiChannels[channelNumber].midiControllers[
                        NON_CC_INDEX_OFFSET + modulatorSources.pitchWheel
                    ];
                this.callEvent("pitchWheel", {
                    channel: channelNumber,
                    pitch: val,
                    midiNote: -1
                });
            }

            // Restore channel pressure
            if (
                !this.midiChannels[channelNumber].lockedControllers[
                    NON_CC_INDEX_OFFSET + modulatorSources.channelPressure
                ]
            ) {
                const val =
                    this.midiChannels[channelNumber].midiControllers[
                        NON_CC_INDEX_OFFSET + modulatorSources.channelPressure
                    ] >> 7;
                this.callEvent("channelPressure", {
                    channel: channelNumber,
                    pressure: val
                });
            }
        }
    }

    public process(
        left: Float32Array,
        right: Float32Array,
        startIndex = 0,
        sampleCount = 0
    ) {
        // Process event queue
        if (this.eventQueue.length > 0) {
            const time = this.currentTime;
            while (this.eventQueue[0]?.time <= time) {
                this.eventQueue.shift()?.callback();
            }
        }

        // Validate
        startIndex = Math.max(startIndex, 0);
        const quantumSize = sampleCount || left.length - startIndex;

        if (this.enableEffects) {
            // Grow buffers if needed
            if (this.reverbProcessor.inputBuffer.length < quantumSize)
                this.reverbProcessor.inputBuffer = new Float32Array(
                    quantumSize
                );

            if (this.chorusProcessor.inputBuffer.length < quantumSize)
                this.chorusProcessor.inputBuffer = new Float32Array(
                    quantumSize
                );

            // Clear the buffers
            this.reverbProcessor.inputBuffer.fill(0);
            this.chorusProcessor.inputBuffer.fill(0);
        }

        // Clear voice count
        for (const c of this.midiChannels) {
            c.clearVoiceCount();
        }
        this.voiceCount = 0;

        // Process voices
        const cap = this.masterParameters.voiceCap;
        for (let i = 0; i < cap; i++) {
            const v = this.voices[i];
            if (!v.isActive) {
                continue;
            }
            const ch = this.midiChannels[v.channel];
            if (ch.isMuted) continue;
            ch.voiceCount++;
            this.voiceCount++;
            ch.renderVoice(
                v,
                this.currentTime,
                left,
                right,
                startIndex,
                quantumSize
            );
        }

        // Process effects
        if (this.enableEffects) {
            this.chorusProcessor.process(quantumSize, left, right);
            this.reverbProcessor.process(quantumSize, left, right);
        }

        // Update voice count
        for (const c of this.midiChannels) {
            c.updateVoiceCount();
        }

        // Advance the time appropriately
        this.currentTime += quantumSize * this.sampleTime;
    }

    public processSplit(
        outputs: Float32Array[][],
        effectsLeft: Float32Array,
        effectsRight: Float32Array,
        startIndex = 0,
        sampleCount = 0
    ) {
        // Process event queue
        if (this.eventQueue.length > 0) {
            const time = this.currentTime;
            while (this.eventQueue[0]?.time <= time) {
                this.eventQueue.shift()?.callback();
            }
        }

        // Validate
        startIndex = Math.max(startIndex, 0);
        const quantumSize = sampleCount || outputs[0][0].length - startIndex;

        if (this.enableEffects) {
            // Grow buffers if needed
            if (this.reverbProcessor.inputBuffer.length < quantumSize)
                this.reverbProcessor.inputBuffer = new Float32Array(
                    quantumSize
                );

            if (this.chorusProcessor.inputBuffer.length < quantumSize)
                this.chorusProcessor.inputBuffer = new Float32Array(
                    quantumSize
                );

            // Clear the buffers
            this.reverbProcessor.inputBuffer.fill(0);
            this.chorusProcessor.inputBuffer.fill(0);
        }

        // Clear voice count
        for (const c of this.midiChannels) {
            c.clearVoiceCount();
        }
        this.voiceCount = 0;

        // Process voices
        const cap = this.masterParameters.voiceCap;
        const outputCount = outputs.length;
        for (let i = 0; i < cap; i++) {
            const v = this.voices[i];
            const ch = this.midiChannels[v.channel];
            if (!v.isActive || ch.isMuted) {
                continue;
            }

            // Send the voice to appropriate output
            const outputIndex = v.channel % outputCount;
            ch.renderVoice(
                v,
                this.currentTime,
                outputs[outputIndex][0],
                outputs[outputIndex][1],
                startIndex,
                quantumSize
            );

            // Update voice count
            ch.voiceCount++;
            this.voiceCount++;
        }

        // Process effects
        if (this.enableEffects) {
            this.chorusProcessor.process(
                quantumSize,
                effectsLeft,
                effectsRight
            );
            this.reverbProcessor.process(
                quantumSize,
                effectsLeft,
                effectsRight
            );
        }

        // Update voice count
        for (const c of this.midiChannels) {
            c.updateVoiceCount();
        }

        // Advance the time appropriately
        this.currentTime += quantumSize * this.sampleTime;
    }
    /**
     * Gets voices for a preset.
     * @param preset The preset to get voices for.
     * @param midiNote The MIDI note to use.
     * @param velocity The velocity to use.
     * @returns Output is an array of voices.
     */
    public getVoicesForPreset(
        preset: BasicPreset,
        midiNote: number,
        velocity: number
    ): CachedVoiceList {
        const cached = this.getCachedVoice(preset, midiNote, velocity);
        // If cached, return it!
        if (cached !== undefined) {
            return cached;
        }
        // Not cached...
        // Create the voices
        const voices = new Array<CachedVoice>();
        for (const voiceParams of preset.getVoiceParameters(
            midiNote,
            velocity
        )) {
            const sample = voiceParams.sample;
            if (voiceParams.sample.getAudioData() === undefined) {
                SpessaSynthWarn(`Discarding invalid sample: ${sample.name}`);
                continue;
            }
            voices.push(
                new CachedVoice(
                    voiceParams,
                    midiNote,
                    velocity,
                    this.sampleRate
                )
            );
        }
        // Cache the voice
        this.setCachedVoice(preset, midiNote, velocity, voices);
        return voices;
    }

    public clearCache() {
        this.cachedVoices.clear();
    }

    /**
     * Copied callback so MIDI channels can call it.
     */
    public callEvent<K extends keyof SynthProcessorEventData>(
        eventName: K,
        eventData: SynthProcessorEventData[K]
    ) {
        this.eventCallbackHandler(eventName, eventData);
    }

    /**
     * @param volume {number} 0 to 1
     */
    protected setMIDIVolume(volume: number) {
        // GM2 specification, section 4.1: volume is squared.
        // Though, according to my own testing, Math.E seems like a better choice
        this.midiVolume = Math.pow(volume, Math.E);
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

    protected getCachedVoice(
        patch: MIDIPatch,
        midiNote: number,
        velocity: number
    ): CachedVoiceList | undefined {
        return this.cachedVoices.get(
            this.getCachedVoiceIndex(patch, midiNote, velocity)
        );
    }

    protected setCachedVoice(
        patch: MIDIPatch,
        midiNote: number,
        velocity: number,
        voices: CachedVoiceList
    ) {
        this.cachedVoices.set(
            this.getCachedVoiceIndex(patch, midiNote, velocity),
            voices
        );
    }

    /**
     * Assigns priorities to the voices.
     * Gets the priority of a voice based on its channel and state.
     * Higher priority means the voice is more important and should be kept longer.
     */
    private assignVoicePriorities() {
        if (this.lastPriorityAssignmentTime === this.currentTime) return;
        this.lastPriorityAssignmentTime = this.currentTime;
        const cap = this.masterParameters.voiceCap;
        for (let i = 0; i < cap; i++) {
            const voice = this.voices[i];
            voice.priority = 0;
            if (this.midiChannels[voice.channel].drumChannel) {
                // Important
                voice.priority += 5;
            }
            if (voice.isInRelease) {
                // Not important
                voice.priority -= 5;
            }
            // Less velocity = less important
            voice.priority += voice.velocity / 25; // Map to 0-5
            // The newer, more important
            voice.priority -= voice.volEnv.state;
            if (voice.isInRelease) {
                voice.priority -= 5;
            }
            voice.priority -= voice.volEnv.attenuationCb / 200;
        }
    }

    private updatePresetList() {
        const mainFont = this.soundBankManager.presetList;
        this.clearCache();
        this.callEvent("presetListChange", mainFont);
        this.getDefaultPresets();
        // Unlock presets
        for (const c of this.midiChannels) {
            c.setPresetLock(false);
        }
        this.resetAllControllers();
    }

    private getDefaultPresets() {
        // Override this to XG, to set the default preset to NOT be XG drums!
        this.defaultPreset = this.soundBankManager.getPreset(
            {
                bankLSB: 0,
                bankMSB: 0,
                program: 0,
                isGMGSDrum: false
            },
            "xg"
        );
        this.drumPreset = this.soundBankManager.getPreset(
            {
                bankLSB: 0,
                bankMSB: 0,
                program: 0,
                isGMGSDrum: true
            },
            "gs"
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
}
