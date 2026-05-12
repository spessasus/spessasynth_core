import type { GlobalMIDIParameterChangeCallback } from "../types";
import { DEFAULT_SYNTH_MODE } from "./synth_constants";
import type { SynthesizerCore } from "./synthesizer_core";
import type { MIDISystem } from "../../soundbank/types";

export interface GlobalMIDIParameter {
    /**
     * The MIDI system used by the synthesizer for bank selects and system exclusives. (GM, GM2, GS, XG)
     * Set by MIDI SysEx.
     */
    system: MIDISystem;
    /**
     * The global key shift in semitones.
     * Drum channels ignore this value.
     * Set by MIDI SysEx.
     */
    keyShift: number;
    /**
     * The global tuning in cents.
     * Drum channels ignore this value.
     * Set by MIDI SysEx.
     */
    fineTune: number;

    /**
     * The global volume gain.
     * Set by MIDI SysEx.
     */
    gain: number;

    /**
     * The global panning.
     * - -1 - hard left
     * - 0 - center
     * - 1 - hard right
     * Set by MIDI SysEx.
     */
    pan: number;
}

export const DEFAULT_GLOBAL_MIDI_PARAMETERS: GlobalMIDIParameter = {
    gain: 1,
    pan: 0,
    keyShift: 0,
    fineTune: 0,
    system: DEFAULT_SYNTH_MODE
};

/**
 * Sets a global MIDI parameter of the synthesizer.
 * @param parameter The type of the global MIDI parameter to set.
 * @param value The value to set for the global MIDI parameter.
 */
export function setMIDIParameterInternal<P extends keyof GlobalMIDIParameter>(
    this: SynthesizerCore,
    parameter: P,
    value: GlobalMIDIParameter[P]
) {
    this.midiParameters[parameter] = value;

    for (const ch of this.midiChannels) ch.updateInternalParams();

    this.callEvent("globalMIDIParamChange", {
        parameter,
        value
    } as GlobalMIDIParameterChangeCallback);
}

/**
 * Resets all global MIDI parameters to their default values.
 * @param system the MIDI system to set when resetting.
 */
export function resetMIDIParametersInternal(
    this: SynthesizerCore,
    system: MIDISystem
) {
    this.setMIDIParameter("gain", 1);
    this.setMIDIParameter("pan", 0);
    this.setMIDIParameter("keyShift", 0);
    this.setMIDIParameter("fineTune", 0);
    this.setMIDIParameter("system", system);
}
