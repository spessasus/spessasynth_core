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
     * The modulation depth in cents.
     * This is internally converted to a multiplier by dividing by 50.
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

    /**
     * The relation between the input and the actual velocity.
     *
     * If Velo Depth is increased, small differences in your playing dynamics will make a large difference in the loudness of the sound.
     * If Velo Depth is decreased, even large differences in your playing dynamics will make only a small difference in the loudness of the sound.
     *
     * Examples (with offset being set to normal):
     *
     * - 64 is normal.
     * - 32 is half velocity at max volume.
     * - 127 is max velocity at half volume.
     *
     * Refer to [SC-8850 Owner's Manual](https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf), page 56.
     */
    velocitySenseDepth: number;
    /**
     * The offset to add to the input velocity.
     *
     * If Velo Offset is set higher than 64, even softly played notes (i.e., notes with a low velocity)
     * will be sounded loudly. If Velo Offset is set lower than 64,
     * even strongly played notes (i.e., notes with a high velocity) will be sounded softly.
     *
     * Examples (with depth set to normal):
     *
     * - 64 is normal.
     * - 32 is silent until half velocity, max velocity is half volume.
     * - 96 starts at half volume and reaches max volume at half velocity.
     * - 127 always forces velocity to max.
     *
     * Refer to [SC-8850 Owner's Manual](https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf), page 56.
     */
    velocitySenseOffset: number;
}

export const DEFAULT_CHANNEL_MIDI_PARAMETERS: ChannelMIDIParameter = {
    pitchWheel: 8192,
    pitchWheelRange: 2,
    pressure: 0,
    modulationDepth: 50,
    rxChannel: 0,
    polyMode: true,
    keyShift: 0,
    fineTune: 0,
    randomPan: false,
    assignMode: 2,
    efxAssign: false,
    cc1: 0x10,
    cc2: 0x11,
    drumMap: 0,
    velocitySenseDepth: 64,
    velocitySenseOffset: 64
};
