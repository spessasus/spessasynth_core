import type { SynthMethodOptions } from "../types";
import type { MIDISystem } from "../../soundbank/types";

/**
 * Synthesizer's default voice cap.
 *
 * @group Synthesizer.Constants
 */
export const VOICE_CAP = 350;
/**
 * Default MIDI drum channel number, 0 based index.
 *
 * @group Synthesizer.Constants
 */
export const MIDI_DRUM_CHANNEL = 9;
/**
 * Default bank select and SysEx mode.
 *
 * @group Synthesizer.Constants
 */
export const DEFAULT_SYNTH_MODE: MIDISystem = "gs";

/**
 * Used globally to identify the embedded sound bank
 * This is used to prevent the embedded bank from being deleted.
 * @internal
 */
export const EMBEDDED_SOUND_BANK_ID = `SPESSASYNTH_EMBEDDED_BANK_${Math.random()}_DO_NOT_DELETE`;

export const GENERATOR_OVERRIDE_NO_CHANGE_VALUE = 32_767;

export const DEFAULT_SYNTH_METHOD_OPTIONS: SynthMethodOptions = {
    time: 0
};
/**
 * If the note is released faster than that, it forced to last that long
 * This is used mostly for drum channels, where a lot of midis like to send instant note off after a note on
 * @internal
 */
export const MIN_NOTE_LENGTH = 0.03;
/**
 * This sounds way nicer for an instant hi-hat cutoff
 * @internal
 */
export const MIN_EXCLUSIVE_LENGTH = 0.07;

/**
 * This panning factor ensures that spessasynth doesn't stay too loud.
 * You can set the `gain` system parameter to an inverse of it to negate the effect.
 *
 * @group Synthesizer.Constants
 */
export const SPESSASYNTH_GAIN_FACTOR = 0.6;

/**
 * The default buffer size for the synthesizer.
 *
 * @group Synthesizer.Constants
 */
export const SPESSA_BUFSIZE = 128;

/**
 * This is needed because effects (regular ones) are send straight from the mono signal, whereas
 * insertion effects receive the panned audio (twice), which reduces gain by a factor of cos(pi/4) * cos(pi/4) (master pan + voice pan).
 * This reverses it.
 * 1 / Math.cos(Math.PI / 4) ** 2 == 2
 */
export const EFX_SENDS_GAIN_CORRECTION = 2;

/**
 * The amount of MIDI controllers (128)
 * @internal
 */
export const CONTROLLER_TABLE_SIZE = 128;

/**
 * RPN NULL per MIDI spec.
 * @internal
 */
export const DEFAULT_RPN = 0x7f;
/**
 * Per MIDI spec, avoids handling AWE32 in data entry code.
 * @internal
 */
export const DEFAULT_NRPN = 127;

/**
 * The program number of GS User Drum Set 1.
 * @internal
 */
export const GS_USER_DRUM_1 = 64;

/**
 * The program number of GS User Drum Set 2.
 * @internal
 */
export const GS_USER_DRUM_2 = 65;
