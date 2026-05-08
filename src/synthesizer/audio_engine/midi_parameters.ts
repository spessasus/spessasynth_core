import type { MIDIGlobalParameterChangeCallback } from "../types";
import { DEFAULT_SYNTH_MODE } from "./synth_constants";
import type { SynthesizerCore } from "./synthesizer_core";
import type { MIDISystem } from "../../soundbank/types";

export interface MIDIGlobalParameter {
    /**
     * The MIDI system used by the synthesizer for bank selects and system exclusives. (GM, GM2, GS, XG)
     * Set by MIDI SysEx.
     */
    system: MIDISystem;
    /**
     * The global key shift in semitones.
     * Set by MIDI SysEx.
     */
    masterKeyShift: number;
    /**
     * The global tuning in cents.
     * Set by MIDI SysEx.
     */
    masterTune: number;

    /**
     * The global volume gain.
     * Set by MIDI SysEx.
     */
    masterVolume: number;

    /**
     * The global panning.
     * - -1 - hard left
     * - 0 - center
     * - 1 - hard right
     * Set by MIDI SysEx.
     */
    masterPan: number;
}

export const DEFAULT_MIDI_GLOBAL_PARAMETERS: MIDIGlobalParameter = {
    masterVolume: 1,
    masterPan: 0,
    masterKeyShift: 0,
    masterTune: 0,
    system: DEFAULT_SYNTH_MODE
};

/**
 * Sets a global MIDI parameter of the synthesizer.
 * @param parameter The type of the global MIDI parameter to set.
 * @param value The value to set for the global MIDI parameter.
 */
export function setMIDIParameterInternal<P extends keyof MIDIGlobalParameter>(
    this: SynthesizerCore,
    parameter: P,
    value: MIDIGlobalParameter[P]
) {
    this.midiParameters[parameter] = value;

    for (const ch of this.midiChannels) ch.updateInternalParams();

    this.callEvent("midiGlobalChange", {
        parameter,
        value
    } as MIDIGlobalParameterChangeCallback);
}

/**
 * Resets all global MIDI parameters to their default values.
 * @param system the MIDI system to set when resetting.
 */
export function resetMIDIParametersInternal(
    this: SynthesizerCore,
    system: MIDISystem
) {
    this.setMIDIParameter("masterVolume", 1);
    this.setMIDIParameter("masterPan", 0);
    this.setMIDIParameter("masterKeyShift", 0);
    this.setMIDIParameter("masterTune", 0);
    this.setMIDIParameter("system", system);
}
