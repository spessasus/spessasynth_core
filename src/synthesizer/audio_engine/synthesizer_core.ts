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
import {
    DEFAULT_SYNTH_METHOD_OPTIONS,
    DEFAULT_SYNTH_MODE,
    INITIAL_BUFFER_SIZE
} from "./engine_components/synth_constants";
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
import {
    type DelayProcessor,
    type InsertionProcessor,
    type InsertionProcessorConstructor,
    NON_CC_INDEX_OFFSET
} from "../exports";
import { LowpassFilter } from "./engine_components/dsp_chain/lowpass_filter";

import type { ChorusProcessor, ReverbProcessor } from "./effects/types";
import { ThruFX } from "./effects/insertion/thru";
import { insertionList } from "./effects/insertion_list"; // Gain smoothing for rapid volume changes. Must be run EVERY SAMPLE

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
    public readonly midiChannels: MIDIChannel[] = [];
    /**
     * The insertion processor's left input buffer.
     */
    public insertionInputL = new Float32Array(INITIAL_BUFFER_SIZE);
    /**
     * The insertion processor's right input buffer.
     */
    public insertionInputR = new Float32Array(INITIAL_BUFFER_SIZE);
    /**
     * The reverb processor's input buffer.
     */
    public reverbInput = new Float32Array(INITIAL_BUFFER_SIZE);
    /**
     * The chorus processor's input buffer.
     */
    public chorusInput = new Float32Array(INITIAL_BUFFER_SIZE);
    /**
     * The delay processor's input buffer.
     */
    public delayInput = new Float32Array(INITIAL_BUFFER_SIZE);
    /**
     * Delay is not used outside SC-88+ MIDIs, this is an optimization.
     */
    public delayActive = false;
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
     * A sysEx may set a "Part" (channel) to receive on a different channel number.
     * This slows down the access, so this toggle tracks if it's enabled or not.
     */
    public customChannelNumbers = false;
    /**
     * The fallback processor when the requested insertion is not available.
     */
    protected readonly insertionFallback = new ThruFX();
    /**
     * The current insertion processor.
     */
    protected insertionProcessor: InsertionProcessor = this.insertionFallback;
    /**
     * All the insertion effects available to the processor.
     * The key is the EFX type stored as MSB << 8 | LSB
     */
    protected readonly insertionEffects = new Map<number, InsertionProcessor>();
    /**
     * Insertion is not used outside SC-88Pro+ MIDIs, this is an optimization.
     */
    protected insertionActive = false;

    /**
     * The synthesizer's reverb processor.
     */
    protected readonly reverbProcessor: ReverbProcessor;
    /**
     * The synthesizer's chorus processor.
     */
    protected readonly chorusProcessor: ChorusProcessor;
    /**
     * The synthesizer's delay processor.
     */
    protected readonly delayProcessor: DelayProcessor;
    /**
     * For F5 system exclusive.
     */
    protected portSelectChannelOffset = 0;
    /**
     * Last time the priorities were assigned.
     * Used to prevent assigning priorities multiple times when more than one voice is triggered during a quantum.
     */
    private lastPriorityAssignmentTime = 0;
    /**
     * Synth's event queue from the main thread
     */
    private eventQueue: {
        message: Uint8Array | number[];
        force: boolean;
        channelOffset: number;
        time: number;
    }[] = [];
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
        this.delayProcessor = options.delayProcessor;

        // Register insertion
        for (const insertion of insertionList)
            this.registerInsertionProcessor(insertion);

        // Initialize voices
        this.voices = [];
        for (let i = 0; i < this.masterParameters.voiceCap; i++) {
            this.voices.push(new Voice(this.sampleRate));
        }
    }

    public controllerChange(
        channel: number,
        controllerNumber: MIDIController,
        controllerValue: number
    ) {
        if (this.customChannelNumbers) {
            for (const ch of this.midiChannels)
                if (ch.rxChannel === channel)
                    ch.controllerChange(controllerNumber, controllerValue);
            return;
        }
        this.midiChannels[
            channel + this.portSelectChannelOffset
        ].controllerChange(controllerNumber, controllerValue);
    }

    public noteOn(channel: number, midiNote: number, velocity: number) {
        if (this.customChannelNumbers) {
            for (const ch of this.midiChannels)
                if (ch.rxChannel === channel) ch.noteOn(midiNote, velocity);
            return;
        }
        this.midiChannels[channel + this.portSelectChannelOffset].noteOn(
            midiNote,
            velocity
        );
    }

    public noteOff(channel: number, midiNote: number) {
        if (this.customChannelNumbers) {
            for (const ch of this.midiChannels)
                if (ch.rxChannel === channel) ch.noteOff(midiNote);
            return;
        }
        this.midiChannels[channel + this.portSelectChannelOffset].noteOff(
            midiNote
        );
    }

    public polyPressure(channel: number, midiNote: number, pressure: number) {
        if (this.customChannelNumbers) {
            for (const ch of this.midiChannels)
                if (ch.rxChannel === channel)
                    ch.polyPressure(midiNote, pressure);
            return;
        }
        this.midiChannels[channel + this.portSelectChannelOffset].polyPressure(
            midiNote,
            pressure
        );
    }

    public channelPressure(channel: number, pressure: number) {
        if (this.customChannelNumbers) {
            for (const ch of this.midiChannels)
                if (ch.rxChannel === channel) ch.channelPressure(pressure);
            return;
        }
        this.midiChannels[
            channel + this.portSelectChannelOffset
        ].channelPressure(pressure);
    }

    public pitchWheel(channel: number, pitch: number, midiNote = -1) {
        if (this.customChannelNumbers) {
            for (const ch of this.midiChannels)
                if (ch.rxChannel === channel) ch.pitchWheel(pitch, midiNote);
            return;
        }
        this.midiChannels[channel + this.portSelectChannelOffset].pitchWheel(
            pitch,
            midiNote
        );
    }

    public programChange(channel: number, programNumber: number) {
        if (this.customChannelNumbers) {
            for (const ch of this.midiChannels)
                if (ch.rxChannel === channel) ch.programChange(programNumber);
            return;
        }
        this.midiChannels[channel + this.portSelectChannelOffset].programChange(
            programNumber
        );
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
        if (this.masterParameters.autoAllocateVoices) {
            // Allocate a new voice and return it
            const v = new Voice(this.sampleRate);
            this.voices.push(v);
            this.masterParameters.voiceCap++;
            this.callEvent("masterParameterChange", {
                parameter: "voiceCap",
                value: this.masterParameters.voiceCap
            });
            return v;
        }
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
        channelOffset = 0,
        force = false,
        options: SynthMethodOptions = DEFAULT_SYNTH_METHOD_OPTIONS
    ) {
        const time = options.time;
        if (time > this.currentTime) {
            this.eventQueue.push({
                message,
                channelOffset,
                force,
                time
            });
            this.eventQueue.sort((e1, e2) => e1.time - e2.time);
        } else {
            this.processMessageInternal(message, channelOffset, force);
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
        this.portSelectChannelOffset = 0;
        this.customChannelNumbers = false;
        this.setMIDIVolume(1);
        // Hall2 default
        this.setReverbMacro(4);
        // Chorus3 default
        this.setChorusMacro(2);
        // Delay1 default
        this.setDelayMacro(0);
        this.delayActive = false;
        this.insertionActive = false;
        this.insertionProcessor = this.insertionFallback;
        this.insertionProcessor.reset();
        this.insertionProcessor.sendLevelToReverb = 40 / 127;
        this.insertionProcessor.sendLevelToChorus = 0;
        this.insertionProcessor.sendLevelToDelay = 0;
        this.callEvent("effectChange", {
            effect: "insertion",
            parameter: 0,
            value: this.insertionProcessor.type
        });

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
        this.processSplit(
            [[left, right]],
            left,
            right,
            startIndex,
            sampleCount
        );
    }

    /**
     * The main rendering pipeline, renders all voices the processes the effects:
     * ```
     *                   ┌────────────────────────────────┐
     *                   │        Voice Processor         │
     *                   └───────────────┬────────────────┘
     *                                   │
     *              ┌──────────┬─────────┼────────────────────────┐
     *              │          │         │                        │
     *              │          │         𜸊                        │
     *              │          │ ┌───────┴───────┐                │
     *              │          │ │    Chorus     │                │
     *              │          │ │   Processor   ├──────────┐     │
     *              │          │ └─┬──────────┬──┘          │     │
     *              │          │   │          │             │     │
     *              │          │   │          │             │     │
     *              │          │   │          │             │     │
     *              │          │   │          │             │     │
     *              │          │   │          𜸊             𜸊     𜸊
     *              │          │   │ ┌────────┴───────┐   ┌─┴─────┴────────┐
     *              │          └───┼>┤     Delay      ├─>>┤     Reverb     │
     *              │              │ │   Processor    │   │   Processor    │
     *              │              │ └────────┬───────┘   └───────┬────────┘
     *              │              │          │                   │
     *              │              │          │                   │
     *              │              │          │                   │
     *              │              │          │                   │
     *              𜸊              𜸊          𜸊                   𜸊
     *    ┌─────────┴──────────┐ ┌─┴──────────┴───────────────────┴────┐
     *    │  Dry Output Pairs  │ │        Stereo Effects Output        │
     *    └────────────────────┘ └─────────────────────────────────────┘
     * ```
     * The pipeline is quite similar to the one on SC-8850 manual page 78.
     * All output arrays must be the same length, the method will crash otherwise.
     * @param outputs The stereo pairs for each MIDI channel's dry output, will be wrapped if less.
     * @param effectsLeft The left stereo effect output buffer.
     * @param effectsRight The right stereo effect output buffer.
     * @param startIndex The index to start writing at into the output buffer.
     * @param samples The amount of samples to write.
     */
    public processSplit(
        outputs: Float32Array[][],
        effectsLeft: Float32Array,
        effectsRight: Float32Array,
        startIndex = 0,
        samples = 0
    ) {
        // Process event queue
        if (this.eventQueue.length > 0) {
            const time = this.currentTime;
            while (this.eventQueue[0]?.time <= time) {
                const q = this.eventQueue.shift();
                if (q) {
                    this.processMessageInternal(
                        q.message,
                        q.channelOffset,
                        q.force
                    );
                }
            }
        }

        // Validate
        startIndex = Math.max(startIndex, 0);
        const sampleCount = samples || outputs[0][0].length - startIndex;

        // Grow buffers if needed
        if (this.enableEffects) {
            // Grow buffers if needed
            if (this.reverbInput.length < sampleCount) {
                SpessaSynthWarn(
                    "Buffer size has increased, this will cause a memory allocation!"
                );
                this.reverbInput = new Float32Array(sampleCount);
                this.chorusInput = new Float32Array(sampleCount);
                this.delayInput = new Float32Array(sampleCount);
                this.insertionInputL = new Float32Array(sampleCount);
                this.insertionInputR = new Float32Array(sampleCount);
            } else {
                // Clear the buffers
                this.reverbInput.fill(0);
                this.chorusInput.fill(0);
                if (this.delayActive) this.delayInput.fill(0);
                if (this.insertionActive) {
                    this.insertionInputL.fill(0);
                    this.insertionInputR.fill(0);
                }
            }
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
                sampleCount
            );

            // Update voice count
            ch.voiceCount++;
            this.voiceCount++;
        }

        // Process effects
        if (this.enableEffects) {
            const {
                chorusInput,
                delayInput,
                reverbInput,
                insertionInputR,
                insertionInputL
            } = this;

            // Insertion first
            if (this.insertionActive) {
                this.insertionProcessor.process(
                    insertionInputL,
                    insertionInputR,
                    effectsLeft,
                    effectsRight,
                    reverbInput,
                    chorusInput,
                    delayInput,
                    startIndex,
                    sampleCount
                );
            }

            // Chorus first, it feeds to reverb and delay
            this.chorusProcessor.process(
                chorusInput,
                effectsLeft,
                effectsRight,
                reverbInput,
                delayInput,
                startIndex,
                sampleCount
            );
            // CC#94 in XG is variation, not delay
            if (this.delayActive && this.masterParameters.midiSystem !== "xg") {
                // Process delay
                this.delayProcessor.process(
                    delayInput,
                    effectsLeft,
                    effectsRight,
                    reverbInput,
                    startIndex,
                    sampleCount
                );
            }
            // Finally process the reverb processor (it goes directly into the output buffer)
            this.reverbProcessor.process(
                reverbInput,
                effectsLeft,
                effectsRight,
                startIndex,
                sampleCount
            );
        }

        // Update voice count
        for (const c of this.midiChannels) {
            c.updateVoiceCount();
        }

        // Advance the time appropriately
        this.currentTime += sampleCount * this.sampleTime;
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

    protected setReverbMacro(macro: number) {
        if (this.masterParameters.reverbLock) return;
        // SC-8850 manual page 81
        const rev = this.reverbProcessor;
        rev.level = 64;
        rev.preDelayTime = 0;
        rev.character = macro;
        switch (macro) {
            /**
             * REVERB MACRO is a macro parameter that allows global setting of reverb parameters.
             * When you select the reverb type with REVERB MACRO, each reverb parameter will be set to their most
             * suitable value.
             *
             * Room1, Room2, Room3
             * These reverbs simulate the reverberation of a room. They provide a well-defined
             * spacious reverberation.
             * Hall1, Hall2
             * These reverbs simulate the reverberation of a concert hall. They provide a deeper
             * reverberation than the Room reverbs.
             * Plate
             * This simulates a plate reverb (a studio device using a metal plate).
             * Delay
             * This is a conventional delay that produces echo effects.
             * Panning Delay
             * This is a special delay in which the delayed sounds move left and right.
             * It is effective when you are listening in stereo.
             */
            default: {
                // Room1
                rev.character = 0;
                rev.preLowpass = 3;
                rev.time = 80;
                rev.delayFeedback = 0;
                rev.preDelayTime = 0;
                break;
            }

            case 1: {
                // Room2
                rev.preLowpass = 4;
                rev.time = 56;
                rev.delayFeedback = 0;
                break;
            }

            case 2: {
                // Room3
                rev.preLowpass = 0;
                rev.time = 72;
                rev.delayFeedback = 0;
                break;
            }

            case 3: {
                // Hall1
                rev.preLowpass = 4;
                rev.time = 72;
                rev.delayFeedback = 0;
                break;
            }

            case 4: {
                // Hall2
                rev.preLowpass = 0;
                rev.time = 64;
                rev.delayFeedback = 0;
                break;
            }

            case 5: {
                // Plate
                rev.preLowpass = 0;
                rev.time = 88;
                rev.delayFeedback = 0;
                break;
            }

            case 6: {
                // Delay
                rev.preLowpass = 0;
                rev.time = 32;
                rev.delayFeedback = 40;
                break;
            }

            case 7: {
                // Panning delay
                rev.preLowpass = 0;
                rev.time = 64;
                rev.delayFeedback = 32;
                break;
            }
        }
        this.callEvent("effectChange", {
            effect: "reverb",
            parameter: "macro",
            value: macro
        });
    }

    protected setChorusMacro(macro: number) {
        if (this.masterParameters.chorusLock) return;
        // SC-8850 manual page 83
        const chr = this.chorusProcessor;
        chr.level = 64;
        chr.preLowpass = 0;
        chr.delay = 127;
        chr.sendLevelToDelay = 0;
        chr.sendLevelToReverb = 0;
        switch (macro) {
            /**
             * CHORUS MACRO is a macro parameter that allows global setting of chorus parameters.
             * When you select the chorus type with CHORUS MACRO, each chorus parameter will be set to their
             * most suitable value.
             *
             * Chorus1, Chorus2, Chorus3, Chorus4
             * These are conventional chorus effects that add spaciousness and depth to the
             * sound.
             * Feedback Chorus
             * This is a chorus with a flanger-like effect and a soft sound.
             * Flanger
             * This is an effect sounding somewhat like a jet airplane taking off and landing.
             * Short Delay
             * This is a delay with a short delay time.
             * Short Delay (FB)
             * This is a short delay with many repeats.
             */
            default: {
                // Chorus1
                chr.feedback = 0;
                chr.delay = 112;
                chr.rate = 3;
                chr.depth = 5;
                break;
            }

            case 1: {
                // Chorus2
                chr.feedback = 5;
                chr.delay = 80;
                chr.rate = 9;
                chr.depth = 19;
                break;
            }

            case 2: {
                // Chorus3
                chr.feedback = 8;
                chr.delay = 80;
                chr.rate = 3;
                chr.depth = 19;
                break;
            }

            case 3: {
                // Chorus4
                chr.feedback = 16;
                chr.delay = 64;
                chr.rate = 9;
                chr.depth = 16;
                break;
            }

            case 4: {
                // FbChorus
                chr.feedback = 64;
                chr.delay = 127;
                chr.rate = 2;
                chr.depth = 24;
                break;
            }

            case 5: {
                // Flanger
                chr.feedback = 112;
                chr.delay = 127;
                chr.rate = 1;
                chr.depth = 5;
                break;
            }

            case 6: {
                // SDelay
                chr.feedback = 0;
                chr.depth = 127;
                chr.rate = 0;
                chr.depth = 127;
                break;
            }

            case 7: {
                // SDelayFb
                chr.feedback = 80;
                chr.depth = 127;
                chr.rate = 0;
                chr.depth = 127;
                break;
            }
        }
        this.callEvent("effectChange", {
            effect: "chorus",
            parameter: "macro",
            value: macro
        });
    }

    protected setDelayMacro(macro: number) {
        if (this.masterParameters.delayLock) return;
        // SC-8850 manual page 85
        const dly = this.delayProcessor;
        dly.level = 64;
        dly.preLowpass = 0;
        dly.sendLevelToReverb = 0;
        dly.levelRight = dly.levelLeft = 0;
        dly.levelCenter = 127;
        switch (macro) {
            /**
             * DELAY MACRO is a macro parameter that allows global setting of delay parameters. When you select the delay type with DELAY MACRO, each delay parameter will be set to their most
             * suitable value.
             *
             * Delay1, Delay2, Delay3
             * These are conventional delays. 1, 2 and 3 have progressively longer delay times.
             * Delay4
             * This is a delay with a rather short delay time.
             * Pan Delay1. Pan Delay2. Pan Delay3
             * The delay sound moves between left and right. This is effective when listening in
             * stereo. 1, 2 and 3 have progressively longer delay times.
             * Pan Delay4
             * This is a rather short delay with the delayed sound moving between left and
             * right.
             * It is effective when listening in stereo.
             * Dly To Rev
             * Reverb is added to the delay sound, which moves between left and right.
             * It is effective when listening in stereo.
             * PanRepeat
             * The delay sound moves between left and right,
             * but the pan positioning is different from the effects listed above.
             * It is effective when listening in stereo.
             */
            case 0:
            default: {
                // Delay1
                dly.timeCenter = 97;
                dly.timeRatioRight = dly.timeRatioLeft = 1;
                dly.feedback = 80;
                break;
            }

            case 1: {
                // Delay2
                dly.timeCenter = 106;
                dly.timeRatioRight = dly.timeRatioLeft = 1;
                dly.feedback = 80;
                break;
            }

            case 2: {
                // Delay3
                dly.timeCenter = 115;
                dly.timeRatioRight = dly.timeRatioLeft = 1;
                dly.feedback = 72;
                break;
            }

            case 3: {
                // Delay4
                dly.timeCenter = 83;
                dly.timeRatioRight = dly.timeRatioLeft = 1;
                dly.feedback = 72;
                break;
            }

            case 4: {
                // PanDelay1
                dly.timeCenter = 105;
                dly.timeRatioLeft = 12;
                dly.timeRatioRight = 24;
                dly.levelCenter = 0;
                dly.levelLeft = 125;
                dly.levelRight = 60;
                dly.feedback = 74;
                break;
            }

            case 5: {
                // PanDelay2
                dly.timeCenter = 109;
                dly.timeRatioLeft = 12;
                dly.timeRatioRight = 24;
                dly.levelCenter = 0;
                dly.levelLeft = 125;
                dly.levelRight = 60;
                dly.feedback = 71;
                break;
            }

            case 6: {
                // PanDelay3
                dly.timeCenter = 115;
                dly.timeRatioLeft = 12;
                dly.timeRatioRight = 24;
                dly.levelCenter = 0;
                dly.levelLeft = 120;
                dly.levelRight = 64;
                dly.feedback = 73;
                break;
            }

            case 7: {
                // PanDelay4
                dly.timeCenter = 93;
                dly.timeRatioLeft = 12;
                dly.timeRatioRight = 24;
                dly.levelCenter = 0;
                dly.levelLeft = 120;
                dly.levelRight = 64;
                dly.feedback = 72;
                break;
            }

            case 8: {
                // DelayToReverb
                dly.timeCenter = 109;
                dly.timeRatioLeft = 12;
                dly.timeRatioRight = 24;
                dly.levelCenter = 0;
                dly.levelLeft = 114;
                dly.levelRight = 60;
                dly.feedback = 61;
                dly.sendLevelToReverb = 36;
                break;
            }

            case 9: {
                // PanRepeat
                dly.timeCenter = 110;
                dly.timeRatioLeft = 21;
                dly.timeRatioRight = 32;
                dly.levelCenter = 97;
                dly.levelLeft = 127;
                dly.levelRight = 67;
                dly.feedback = 40;
                break;
            }
        }
        this.callEvent("effectChange", {
            effect: "delay",
            parameter: "macro",
            value: macro
        });
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

    private registerInsertionProcessor(proc: InsertionProcessorConstructor) {
        const p = new proc(this.sampleRate);
        this.insertionEffects.set(p.type, p);
    }

    private processMessageInternal(
        message: Uint8Array | number[],
        channelOffset: number,
        force: boolean
    ) {
        const statusByteData = getEvent(message[0] as MIDIMessageType);

        const channelNumber = statusByteData.channel + channelOffset;
        // Process the event
        switch (statusByteData.status as MIDIMessageType) {
            case midiMessageTypes.noteOn: {
                const velocity = message[2];
                if (velocity > 0) {
                    this.noteOn(channelNumber, message[1], velocity);
                } else {
                    this.noteOff(channelNumber, message[1]);
                }
                break;
            }

            case midiMessageTypes.noteOff: {
                if (force) {
                    this.midiChannels[channelNumber].killNote(message[1]);
                } else {
                    this.noteOff(channelNumber, message[1]);
                }
                break;
            }

            case midiMessageTypes.pitchWheel: {
                // LSB | (MSB << 7)
                this.pitchWheel(channelNumber, (message[2] << 7) | message[1]);
                break;
            }

            case midiMessageTypes.controllerChange: {
                this.controllerChange(
                    channelNumber,
                    message[1] as MIDIController,
                    message[2]
                );
                break;
            }

            case midiMessageTypes.programChange: {
                this.programChange(channelNumber, message[1]);
                break;
            }

            case midiMessageTypes.polyPressure: {
                this.polyPressure(channelNumber, message[1], message[2]);
                break;
            }

            case midiMessageTypes.channelPressure: {
                this.channelPressure(channelNumber, message[1]);
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
    }

    /**
     * Assigns priorities to the voices.
     * Gets the priority of a voice based on its channel and state.
     * Higher priority means the voice is more important and should be kept longer.
     */
    private assignVoicePriorities() {
        if (this.lastPriorityAssignmentTime === this.currentTime) return;
        SpessaSynthInfo(
            "%cPolyphony exceeded, stealing voices",
            consoleColors.warn
        );
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
