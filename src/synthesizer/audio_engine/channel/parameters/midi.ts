import type { MIDIController } from "../../../../midi/enums";

export interface ChannelMIDIParameter {
    /**
     * The current pressure (aftertouch) of this channel.
     */
    pressure: number;

    /**
     * The current pitch wheel value (0-16,383) of this channel.
     */
    pitchWheel: number;

    /**
     * The current pitch wheel range, in semitones.
     */
    pitchWheelRange: number;

    /**
     * The multiplier of the modulation wheel modulator.
     *
     * The MIDI specification assumes the default modulation depth is 50 cents,
     * but it may vary for different sound banks.
     * For example, if a MIDI requests a modulation depth of 100 cents,
     * the multiplier will be 2,
     * which, for a preset with a depth of 50,
     * will create a total modulation depth of 100 cents.
     */
    modulationDepth: number;

    /**
     * The channel's receiving number (0-based index).
     * This allows triggering multiple parts (channels) with a single note message.
     * @remarks
     * Only used when customChannelNumbers is enabled.
     */
    rxChannel: number;

    /**
     * If the channel is in the poly mode.
     * - `true` - POLY ON - regular playback.
     * - `false` - MONO ON - one note per channel,
     * highest still pressed note is restored after releasing the currently playing one.
     */
    polyMode: boolean;

    /**
     * The key shift of the channel (in semitones).
     * Drum channels ignore this value.
     */
    keyShift: number;

    /**
     * Cents, RPN/SysEx for fine-tuning.
     * Drum channels ignore this value.
     */
    fineTune: number;

    /**
     * Enables random panning for every note played on this channel.
     */
    randomPan: boolean;

    /**
     * Assign mode for the channel.
     * `ASSIGN MODE` is the parameter that determines how voice assignment will be handled when sounds overlap on identical note numbers in the same channel (i.e., repeatedly struck notes).
     * This is initialized to a mode suitable for each Part, so for general purposes there is no need to change this.
     *
     * - 0 - Single: If the same note is played multiple times in succession, the previously-sounding note will be completely silenced, and then the new note will be sounded.
     * - 1 - LimitedMulti: If the same note is played multiple times in succession, the previously-sounding note will be continued to a certain extent even after the new note is sounded. (Default setting)
     * - 2 - FullMulti: If the same note is played multiple times in succession, the previously-sounding note(s) will continue sounding for their natural length even after the new note is sounded.
     *
     * SpessaSynth treats LimitedMulti like FullMulti.
     * Essentially Limited and Full are normal
     * and Single is like `monophonicRetrigger` system parameter.
     */
    assignMode: number;

    /**
     * Indicates whether this channel uses the insertion EFX processor.
     */
    efxAssign: boolean;

    /**
     * CC1 for GS controller matrix.
     * An arbitrary MIDI controller, which can be bound to any synthesis parameter.
     * Default is 16.
     */
    cc1: MIDIController;

    /**
     * CC2 for GS controller matrix.
     * An arbitrary MIDI controller, which can be bound to any synthesis parameter.
     * Default is 17.
     */
    cc2: MIDIController;

    /**
     * Drum map for GS system exclusive tracking.
     * Only used for selecting the correct channel when setting drum parameters through sysEx,
     * as those don't specify the channel, but the drum number.
     *
     * The only values that are allowed are 0 (melodic) 1 or 2.
     */
    drumMap: number;
}

export const DEFAULT_CHANNEL_MIDI_PARAMETERS: ChannelMIDIParameter = {
    pitchWheel: 8192,
    pitchWheelRange: 2,
    pressure: 0,
    modulationDepth: 1,
    rxChannel: 0,
    polyMode: true,
    keyShift: 0,
    randomPan: false,
    assignMode: 2,
    efxAssign: false,
    cc1: 0x10,
    cc2: 0x11,
    drumMap: 0,
    fineTune: 0
};
