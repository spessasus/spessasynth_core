import type { MIDISystem, SynthMethodOptions } from "../types";

/**
 * Synthesizer's default voice cap.
 */
export const VOICE_CAP = 350;
/**
 * Default MIDI drum channel.
 */
export const DEFAULT_PERCUSSION = 9;
/**
 * Default bank select and SysEx mode.
 */
export const DEFAULT_SYNTH_MODE: MIDISystem = "gs";

/**
 * Used globally to identify the embedded sound bank
 * This is used to prevent the embedded bank from being deleted.
 */
export const EMBEDDED_SOUND_BANK_ID = `SPESSASYNTH_EMBEDDED_BANK_${Math.random()}_DO_NOT_DELETE`;

export const GENERATOR_OVERRIDE_NO_CHANGE_VALUE = 32_767;

export const DEFAULT_SYNTH_METHOD_OPTIONS: SynthMethodOptions = {
    time: 0
};
/**
 * If the note is released faster than that, it forced to last that long
 * This is used mostly for drum channels, where a lot of midis like to send instant note off after a note on
 */
export const MIN_NOTE_LENGTH = 0.03;
/**
 * This sounds way nicer for an instant hi-hat cutoff
 */
export const MIN_EXCLUSIVE_LENGTH = 0.07;

/**
 * This panning factor ensures that spessasynth doesn't stay too loud.
 * You can set te `gain` master parameter to an inverse of it to negate the effect.
 */
export const SPESSASYNTH_GAIN_FACTOR = 0.6;

/**
 * The default buffer size for the synthesizer.
 */
export const SPESSA_BUFSIZE = 128;

/**
 * This is needed because effects (regular ones) are send straight from the mono signal, whereas
 * insertion effects receive the panned audio (twice), which reduces gain by a factor of cos(pi/4) * cos(pi/4) (master pan + voice pan).
 * This reverses it.
 */
export const EFX_SENDS_GAIN_CORRECTION = 1 / Math.cos(Math.PI / 4) ** 2;
