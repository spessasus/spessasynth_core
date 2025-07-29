import type {
    MasterParameterType,
    MTSProgramTuning,
    ProcessorEventType,
    VoiceList
} from "../../types";
import { SYNTHESIZER_GAIN } from "../processor";
import {
    ALL_CHANNELS_OR_DIFFERENT_ACTION,
    DEFAULT_SYNTH_MODE,
    VOICE_CAP
} from "./synth_constants";
import { interpolationTypes } from "../../enums";
import type { BasicPreset } from "../../../soundbank/basic_soundbank/basic_preset";

// This class holds all the internal values of the synthesizer.
// They are used by both SpessaSynthProcessor and its MIDIChannel instances.
// It is used to isolate them from the API.
// Essentially think like all these belong to SpessaSynthProcessor and are "protected".
export class ProtectedSynthValues {
    /**
     * this.tunings[program][key] = tuning
     */
    readonly tunings: MTSProgramTuning[] = [];

    // The master parameters of the synthesizer.
    masterParameters: MasterParameterType = {
        masterGain: SYNTHESIZER_GAIN,
        masterPan: 0.0,
        voiceCap: VOICE_CAP,
        interpolationType: interpolationTypes.fourthOrder,
        midiSystem: DEFAULT_SYNTH_MODE,
        monophonicRetriggerMode: false,
        reverbGain: 1,
        chorusGain: 1,
        blackMIDIMode: false,
        transposition: 0,
        deviceID: ALL_CHANNELS_OR_DIFFERENT_ACTION
    };
    /**
     * The volume gain, set by MIDI sysEx
     */
    midiVolume = 1;
    /**
     * Set via system exclusive.
     */
    reverbSend = 1;
    /**
     * Set via system exclusive.
     */
    chorusSend = 1;
    /**
     * the pan of the left channel
     */
    panLeft = 0.5;
    /**
     * the pan of the right channel
     */
    panRight = 0.5;
    /**
     * Synth's default (reset) preset
     */
    defaultPreset: BasicPreset | undefined;
    /**
     * Synth's default (reset) drum preset
     */
    drumPreset: BasicPreset | undefined;

    // volume envelope smoothing factor, adjusted to the sample rate.
    readonly volumeEnvelopeSmoothingFactor: number;

    // pan smoothing factor, adjusted to the sample rate.
    readonly panSmoothingFactor: number;

    // filter smoothing factor, adjusted to the sample rate.
    readonly filterSmoothingFactor: number;
    /**
     * Calls when an event occurs.
     * @param eventType The event type.
     * @param eventData The event data.
     */
    eventCallbackHandler: <K extends keyof ProcessorEventType>(
        eventType: K,
        eventData: ProcessorEventType[K]
    ) => unknown;
    getVoices: (
        channel: number,
        midiNote: number,
        velocity: number,
        realKey: number
    ) => VoiceList;
    voiceKilling: (amount: number) => unknown;
    /**
     * Cached voices for all presets for this synthesizer.
     * Nesting goes like this:
     * this.cachedVoices[bankNumber][programNumber][midiNote][velocity] = a list of voices for that.
     */
    cachedVoices: VoiceList[][][][] = [];

    constructor(
        eventCallbackHandler: <K extends keyof ProcessorEventType>(
            eventType: K,
            eventData: ProcessorEventType[K]
        ) => unknown,
        getVoices: (
            channel: number,
            midiNote: number,
            velocity: number,
            realKey: number
        ) => VoiceList,
        voiceKillingFunction: (amount: number) => unknown,
        volumeEnvelopeSmoothingFactor: number,
        panSmoothingFactor: number,
        filterSmoothingFactor: number
    ) {
        this.eventCallbackHandler = eventCallbackHandler;
        this.getVoices = getVoices;
        this.voiceKilling = voiceKillingFunction;
        this.volumeEnvelopeSmoothingFactor = volumeEnvelopeSmoothingFactor;
        this.panSmoothingFactor = panSmoothingFactor;
        this.filterSmoothingFactor = filterSmoothingFactor;

        for (let i = 0; i < 128; i++) {
            this.tunings.push([]);
        }
    }

    /**
     * Copied callback so MIDI channels can call it.
     */
    callEvent<K extends keyof ProcessorEventType>(
        eventName: K,
        eventData: ProcessorEventType[K]
    ) {
        this.eventCallbackHandler(eventName, eventData);
    }
}
