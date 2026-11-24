import type { MIDIMessage } from "../../midi_message";
import type { MIDIPatch } from "../../../soundbank/basic_soundbank/midi_patch";
import type { MIDISystem } from "../../../soundbank/types";
import type { ChannelMIDIParameter } from "../../../synthesizer/audio_engine/channel/parameters/midi";
import type { GlobalMIDIParameter } from "../../../synthesizer/audio_engine/parameters/midi";
import type { MIDIController } from "../../enums";
import type { ParameterCC, ParameterTracker } from "../parameter_tracker";
import type { DrumParameter, UserDrumSetParameter } from "../../types";
import type {
    GSChorusParameter,
    GSDelayParameter,
    GSEqualizerParameter,
    GSInsertionBlockSnapshot,
    GSReverbParameter
} from "../../../synthesizer/audio_engine/effects/gs/types";
import type { XGSystemEffectBlockSnapshot } from "../../../synthesizer/audio_engine/effects/xg/interface/xg_system_effect_block";
import type { XGChorusBlockSnapshot } from "../../../synthesizer/audio_engine/effects/xg/interface/xg_chorus_block";
import type { XGVariationBlockSnapshot } from "../../../synthesizer/audio_engine/effects/xg/interface/xg_variation_block";
import type { XGInsertionBlockSnapshot } from "../../../synthesizer/audio_engine/effects/xg/interface/xg_insertion_block";

/**
 * Represents a value that means "clear this parameter" instead of "replace this parameter with".
 * Essentially:
 * - `undefined` - no change.
 * - `clear` - clear all changes of this parameter from the MIDI file.
 * - `T` - clear all changes of this parameter from the MIDI file and add `T` (replace this parameter with `T`).
 *
 * @group MIDI.Editing
 */
export type ClearableParameter<T> = T | "clear";

/**
 * This represents modifications applied to a single MIDI channel when using {@link BasicMIDI.modify}.
 *
 * @group MIDI.Editing
 * */
export interface ChannelModification {
    /**
     * All controllers that should be modified for this channel.
     * - Key: the MIDI controller number.
     * - value:
     *   - `"clear"` - all controller changes for this controller are removed.
     *   - `number` - clear + sets the new controller
     *     before the channel's first note-on, re-applying it after every system reset,
     *     effectively locking it to the set value.
     */
    controllers?: Map<MIDIController, ClearableParameter<number>>;

    /**
     * The new program of this channel.
     * - `"clear"` - all program changes for this channel are removed.
     * - {@link MIDIPatch} - clear + sets the new patch according to the MIDI system
     *     before the channel's first note-on, re-applying it after every system reset,
     *     effectively locking it to the set value.
     *
     * > **Important**
     * >
     * > Program changes include bank selects.
     * > A {@link MIDIPatch} also replaces the file's drum mode changes
     * > (the `drumMap` MIDI parameter, like GS Use For Rhythm Part).
     * > Set `midiParams.drumMap` to choose a specific drum map.
     */
    patch?: ClearableParameter<MIDIPatch>;

    /**
     * The {@link ChannelMIDIParameter} changes for this channel.
     * - Key: the MIDI parameter name.
     * - value:
     *   - `"clear"` - all changes for this parameter are removed.
     *   - `specific value` - clear + sets the new parameter
     *     before the channel's first note-on, re-applying it after every system reset,
     *     effectively locking it to the set value.
     */
    midiParams?: {
        [P in keyof ChannelMIDIParameter]?: ClearableParameter<
            ChannelMIDIParameter[P]
        >;
    };

    /**
     * The channel key shift in semitones.
     * Note on/off and poly pressure MIDI note numbers are shifted.
     *
     * This differs from the `keyShift` MIDI Parameter in that it shifts the actual note numbers,
     * and doesn't delete or overwrite existing shifts.
     */
    keyShift?: number;

    /**
     * The channel tuning in cents.
     * Tuned using RPN Fine Tune.
     *
     * > **Note**
     * >
     * > Values outside the RPN range [-100; 99.986] get added to the key shift,
     * > so e.g. 150 cents is applied as
     * > +1 semitone + 50 cents.
     *
     *
     * This differs from the `fineTune` MIDI Parameter
     * in that it is relative to the tuning applied in the MIDI file,
     * and it does not overwrite it.
     */
    fineTune?: number;

    /**
     * The channel drum parameter changes, set via NRPN at the channel's first note on.
     * - `"clear"` - all drum parameter changes for this channel are removed
     *   (both NRPN edits and any drum map SysEx edits affecting this channel).
     * - {@link ChannelDrumModification} - modifies the channel's drum notes.
     *
     * > **Note**
     * >
     * > `assignGroup`, `rxNoteOn` and `rxNoteOff` are SysEx-only:
     * > `"clear"` removes them from the file, but they can not be set
     * > and will throw an error if a value is provided.
     */
    drumParams?: ClearableParameter<ChannelDrumModification>;
}

/**
 * All modifications for this User Drum Set.
 * - Key: the MIDI note number for the note to modify.
 * - value:
 *   - `"clear"` - all modifications for this note are removed.
 *   - `object` - partial parameter changes for this note:
 *     - Key: User Drum Set parameter name.
 *     - value:
 *       - `"clear"` - all changes for this parameter are removed.
 *       - `specific value` - clear + insert a message setting this after a reset.
 *
 * @group MIDI.Editing
 */
export type UserDrumModification = Map<
    number,
    ClearableParameter<{
        [P in keyof UserDrumSetParameter]?: ClearableParameter<
            UserDrumSetParameter[P]
        >;
    }>
>;

/**
 * All drum note modifications for a single channel.
 * - Key: the MIDI drum key/note number to modify.
 * - value:
 *   - `"clear"` - all drum parameter changes for this note are removed.
 *   - `object` - partial parameter changes for this note:
 *     - Key: drum parameter name.
 *     - value:
 *       - `"clear"` - all changes for this parameter are removed.
 *       - `specific value` - clear + insert a message setting this at the channel's first note on.
 *
 *
 * > **Note**
 * >
 * > `assignGroup`, `rxNoteOn` and `rxNoteOff` are SysEx-only:
 * > `"clear"` removes them from the file, but they can not be set
 * > and will throw an error if a value is provided.
 *
 * @group MIDI.Editing
 */
export type ChannelDrumModification = Map<
    number,
    ClearableParameter<{
        [P in keyof DrumParameter]?: ClearableParameter<DrumParameter[P]>;
    }>
>;

/**
 * Options editing a MIDI sequence using {@link BasicMIDI.modify}.
 *
 * @group MIDI.Editing
 */
export interface ModifyMIDIOptions {
    /**
     * The channel changes.
     * - Key: the MIDI channel number.
     * - value:
     *   - `"clear"` - all MIDI messages for this channel, such as Note On are removed.
     *   - {@link ChannelModification} - modifies the channel.
     */
    channels?: Map<number, ClearableParameter<ChannelModification>>;

    /**
     * The User Drum Set changes.
     * - Key: the User Drum Set number, 0 based.
     * 0 is the User Drum Set 1 located at MIDI program 64, and 1 is User Drum Set 2 located at MIDI program 65.
     * - value:
     *   - `"clear"` - all existing changes for this drum set are removed.
     *   - {@link UserDrumModification} - modifies the drum set.
     */
    userDrumParams?: Map<number, ClearableParameter<UserDrumModification>>;
    /**
     * The {@link GlobalMIDIParameter} changes.
     * - Key: the MIDI parameter name.
     * - value:
     *   - `"clear"` - all changes for this parameter are removed.
     *   - `specific value` - clear + sets the new parameter,
     *      re-applying it after every system reset,
     *      effectively locking it to the set value.
     *
     * For the `system` parameter specifically:
     * - `"clear"` - deletes every system reset. Setup is inserted
     *   before the first note on without any reset.
     *   Without a reset, the synth stays in GS, so the setup and the locked patches are written for GS.
     *   XG setups are not written.
     * - `specific value` - replaces every system reset with the desired one.
     *
     * > **Note**
     * >
     * > By default, a meaningful GM reset (one with notes after it, or the last reset of a file without notes)
     * > is replaced with a GS reset (or `fallbackReset`, if set, or XG if only XG setups are requested).
     * > Set the `system` parameter to `gm`
     * > to keep the GM reset (and replace all others with GM).
     * > This is done to allow the bank selections and other parameters to work.
     */
    midiParams?: {
        [P in keyof GlobalMIDIParameter]?: ClearableParameter<
            GlobalMIDIParameter[P]
        >;
    };
    /**
     * The desired GS reverb parameters.
     * - `"clear"` - all existing parameter change MIDI messages are removed.
     * - {@link GSReverbParameter} - clear + the new parameters are set via System Exclusive messages.
     */
    gsReverbParams?: ClearableParameter<GSReverbParameter>;
    /**
     * The GS chorus parameters.
     * - `"clear"` - all existing parameter change MIDI messages are cleared.
     * - {@link GSChorusParameter} - clear + the new parameters are set via System Exclusive messages.
     */
    gsChorusParams?: ClearableParameter<GSChorusParameter>;
    /**
     * The GS delay parameters.
     * - `"clear"` - all existing parameter change MIDI messages are cleared.
     * - {@link GSDelayParameter} - clear + the new parameters are set via System Exclusive messages.
     */
    gsDelayParams?: ClearableParameter<GSDelayParameter>;
    /**
     * The GS equalizer parameters.
     * - `"clear"` - all existing parameter change MIDI messages are cleared.
     * - {@link GSEqualizerParameter} - clear + the new parameters are set via System Exclusive messages.
     */
    gsEqualizerParams?: ClearableParameter<GSEqualizerParameter>;
    /**
     * The GS Insertion Effect parameters.
     * - `"clear"` - all existing parameter change MIDI messages are cleared.
     * - {@link GSInsertionBlockSnapshot} - clear + the new parameters are set via System Exclusive messages.
     * The controller values of the EFX control sources are not part of it, they come from the controllers.
     */
    gsInsertionParams?: ClearableParameter<
        Omit<GSInsertionBlockSnapshot, "controlValues">
    >;

    /**
     * The desired XG reverb parameters.
     * - `"clear"` - all existing parameter change MIDI messages are removed.
     * - {@link XGSystemEffectBlockSnapshot} - clear + the new parameters are set via System Exclusive messages.
     */
    xgReverbParams?: ClearableParameter<XGSystemEffectBlockSnapshot>;
    /**
     * The desired XG chorus parameters.
     * - `"clear"` - all existing parameter change MIDI messages are removed.
     * - {@link XGChorusBlockSnapshot} - clear + the new parameters are set via System Exclusive messages.
     */
    xgChorusParams?: ClearableParameter<XGChorusBlockSnapshot>;
    /**
     * The desired XG variation parameters.
     * - `"clear"` - all existing parameter change MIDI messages are removed.
     * - {@link XGVariationBlockSnapshot} - clear + the new parameters are set via System Exclusive messages.
     */
    xgVariationParams?: ClearableParameter<XGVariationBlockSnapshot>;

    /**
     * The desired XG insertion parameters.
     * Key is the insertion effect number.
     *
     * Value is:
     * - `"clear"` - all existing parameter change MIDI messages are removed.
     * - {@link XGInsertionBlockSnapshot} - clear + the new parameters are set via System Exclusive messages.
     */
    xgInsertionParams?: Map<
        number,
        ClearableParameter<XGInsertionBlockSnapshot>
    >;

    /**
     * The system reset to add when the file has no reset followed by notes
     * (a file without notes keeps its last reset instead).
     * Unlike `midiParams.system`, existing resets are left untouched.
     * Ignored when `midiParams.system` is set (it takes precedence).
     * When `midiParams.system` is `"clear"`, no reset is added and this is ignored.
     * When unset, the added reset defaults to `"xg"`
     * if only XG setups are requested, otherwise to `"gs"`.
     *
     * If GM resets are replaced, they use this system if provided,
     * otherwise `"xg"` if only XG setups are requested, otherwise `"gs"`.
     */
    fallbackReset?: MIDISystem;
}

/**
 * Internal tracking of a channel's state while editing.
 */
export interface ChannelStatus {
    /**
     * True while the channel has not yet had its first note on after a reset.
     */
    isFirstNoteOn: boolean;

    /**
     * RPN/NRPN tracking.
     */
    param: ParameterTracker;

    /**
     * If the parameters (MSB, LSB and the first data) were cleared.
     * Some MIDIs send param MSB once and then set via LSB only, like:
     * MSB,
     * LSB,
     * Data,
     * LSB,
     * Data,
     * And even though it violates MIDI 1.0, it works...
     */
    clearedParams: {
        /**
         * Param selection, per controller.
         * RPN and NRPN selections are separate,
         * The synth remembers both (all 4, msb + lsb for both rpn and nrpn).
         */
        selection: Record<ParameterCC, boolean>;

        /**
         * Data (any).
         */
        data: boolean;
    };

    /**
     * If the current N/RPN selection was changed from what the file selected, per controller.
     * Happens when the editor deletes a file's selection (cleared data entry)
     * Or inserts its own (locked parameters).
     * A later kept data entry relies on the file's selection,
     * So the modified ones get reinserted right before it, then they are unchanged again.
     * This way, nothing is added if nothing uses the selection.
     */
    selectionModified: Record<ParameterCC, boolean>;

    /**
     * If the output's last selection was registered (RPN).
     */
    outputRegistered: boolean;

    /**
     * Channel number for logging.
     */
    readonly channel: number;

    /**
     * Currently tracked drum map of this channel.
     */
    drumMap: number;

    /**
     * The file's last bank select MSB, for the XG drum setup of a program change.
     */
    bankMSB: number;

    /**
     * Direct copy of channelModification.keyShift.
     * RELATIVE semitones, for easier access rather than having to do "?? 0".
     */
    readonly relativeKeyShift: number;

    /**
     * Direct copy of channelModification.fineTune.
     * RELATIVE cents, for easier access rather than having to do "?? 0".
     */
    readonly relativeFineTune: number;

    /**
     * Since tuning has to be applied relatively,
     * We need to track the currently applied tuning.
     */
    currentFineTune: number;

    /**
     * Same case as with above, since total tune may exceed the RPN range.
     */
    currentKeyShift: number;

    /**
     * The key shift applied to each held note, indexed by the file's key number.
     * The current shift may change while a note is held (like relative fine tune crossing 100 cents),
     * So note offs and poly pressure must use the shift that their corresponding note on had.
     * Testcase: midi_editor_rpn_fine_tuning.ts (Tuning change while a note is held)
     */
    readonly noteShifts: Int16Array;

    /**
     * Pending N/RPN replacement, awaiting a possible second data entry.
     *
     * Parameter data arrives as two separate data entries (MSB and LSB, in any order).
     * We don't know if the second data byte will come, so the first analysis (and potential insert) uses a partial value from the 3-message N/RPN.
     * Each entry is analyzed independently, so the first insert uses a partial value.
     * A later data entry for the same parameter updates the inserted messages.
     * Selections, note-ons and resets all void the record (treated as a new data entry).
     */
    pendingParam:
        | {
              /**
               * The inserted [paramMSB, paramLSB, dataMSB, dataLSB] events for in-place patching.
               */
              events: MIDIMessage[];
          }
        | undefined;
}

/**
 * A position surviving additions and deletions for tracking resets.
 */
export interface ResetPosition {
    /**
     * The reset event itself.
     */
    event: MIDIMessage;

    /**
     * The system this reset switches to.
     */
    system: MIDISystem;

    /**
     * The track containing the event.
     */
    track: number;
}
