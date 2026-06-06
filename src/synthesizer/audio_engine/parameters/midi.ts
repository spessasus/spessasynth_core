import type { GlobalMIDIParameterChangeCallback } from "../../types";
import { DEFAULT_SYNTH_MODE } from "../synth_constants";
import type { SynthesizerCore } from "../synthesizer_core";
import type { MIDISystem } from "../../../soundbank/types";

export interface GlobalMIDIParameter {
    /**
     * The currently enabled MIDI system used by the synthesizer
     * for bank selects and system exclusives.
     * (GM, GM2, GS, XG)
     */
    system: MIDISystem;
    /**
     * The global key shift in semitones.
     * Drum channels ignore this value.
     */
    keyShift: number;
    /**
     * The global tuning in cents.
     * Drum channels ignore this value.
     */
    fineTune: number;

    /**
     * The master volume.
     * From 0 (silent) to 1 (full volume).
     *
     * This differs from the `gain` system parameter in that it is squared internally.
     */
    volume: number;

    /**
     * The master pan.
     * From -1 (left) to 1 (right). 0 is center.
     *
     * This uses the cosine panning law, so the perceived loudness remains constant as the pan changes.
     */
    pan: number;
}

export const DEFAULT_GLOBAL_MIDI_PARAMETERS: GlobalMIDIParameter = {
    volume: 1,
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
    if (this.lockedMIDIParameters[parameter]) return;
    this.midiParameters[parameter] = value;

    for (const ch of this.midiChannels) ch.updateInternalParams();

    this.callEvent("globalParamChange", {
        parameter,
        value
    } as GlobalMIDIParameterChangeCallback);
}

/**
 * Locks or unlocks a given Global MIDI Parameter.
 * This prevents any changes to it until it's unlocked.
 * @param parameter The Global MIDI Parameter to lock.
 * @param isLocked If the parameter should be locked.
 */
export function lockMIDIParameterInternal<P extends keyof GlobalMIDIParameter>(
    this: SynthesizerCore,
    parameter: P,
    isLocked: boolean
) {
    this.lockedMIDIParameters[parameter] = isLocked;
}
