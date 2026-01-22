import type {
    MTSProgramTuning,
    SynthProcessorEventData,
    VoiceList
} from "../../types";
import type { BasicPreset } from "../../../soundbank/basic_soundbank/basic_preset";
import { DEFAULT_MASTER_PARAMETERS } from "./master_parameters";

// This class holds all the internal values of the synthesizer.
// They are used by both SpessaSynthProcessor and its MIDIChannel instances.
// It is used to isolate them from the API.
// Essentially think like all these belong to SpessaSynthProcessor and are "protected".
export class ProtectedSynthValues {
    /**
     * This.tunings[program][key] = tuning
     */
    public readonly tunings: MTSProgramTuning[] = [];

    // The master parameters of the synthesizer.
    public masterParameters = DEFAULT_MASTER_PARAMETERS;
    /**
     * The volume gain, set by MIDI sysEx
     */
    public midiVolume = 1;
    /**
     * Set via system exclusive.
     * Note: Remember to reset in system reset!
     */
    public reverbSend = 1;
    /**
     * Set via system exclusive.
     * Note: Remember to reset in system reset!
     */
    public chorusSend = 1;
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

    // Volume envelope smoothing factor, adjusted to the sample rate.
    public readonly volumeEnvelopeSmoothingFactor: number;

    // Pan smoothing factor, adjusted to the sample rate.
    public readonly panSmoothingFactor: number;

    // Filter smoothing factor, adjusted to the sample rate.
    public readonly filterSmoothingFactor: number;
    /**
     * Calls when an event occurs.
     * @param eventType The event type.
     * @param eventData The event data.
     */
    public eventCallbackHandler: <K extends keyof SynthProcessorEventData>(
        eventType: K,
        eventData: SynthProcessorEventData[K]
    ) => unknown;
    public getVoices: (
        channel: number,
        midiNote: number,
        velocity: number,
        realKey: number
    ) => VoiceList;
    public voiceKilling: (amount: number) => unknown;
    /**
     * Cached voices for all presets for this synthesizer.
     * Nesting is calculated in getCachedVoiceIndex, returns a list of voices for this note.
     */
    public readonly cachedVoices = new Map<number, VoiceList>();

    public constructor(
        eventCallbackHandler: <K extends keyof SynthProcessorEventData>(
            eventType: K,
            eventData: SynthProcessorEventData[K]
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
    public callEvent<K extends keyof SynthProcessorEventData>(
        eventName: K,
        eventData: SynthProcessorEventData[K]
    ) {
        this.eventCallbackHandler(eventName, eventData);
    }
}
