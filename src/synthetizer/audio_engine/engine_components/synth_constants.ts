import type { SynthSystem } from "../../types";

/**
 * Synthesizer's default voice cap.
 */
export const VOICE_CAP = 350;
/**
 * Default MIDI drum channel.
 */
export const DEFAULT_PERCUSSION = 9;
/**
 * MIDI channel count.
 */
export const MIDI_CHANNEL_COUNT = 16;
/**
 * Default bank select and SysEx mode.
 */
export const DEFAULT_SYNTH_MODE: SynthSystem = "gs";

export const ALL_CHANNELS_OR_DIFFERENT_ACTION = -1;

// used globally to identify the embedded sound bank
// this is used to prevent the embedded bank from being deleted.
export const EMBEDDED_SOUND_BANK_ID = `SPESSASYNTH_EMBEDDED_BANK_${Math.random()}`;

export const GENERATOR_OVERRIDE_NO_CHANGE_VALUE = 32767;
