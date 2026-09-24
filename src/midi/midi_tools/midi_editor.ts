import { SpessaLog } from "../../utils/loggin";
import { ConsoleColors } from "../../utils/other";
import { MIDIMessage } from "../midi_message";
import { MIDI_DRUM_CHANNEL } from "../../synthesizer/audio_engine/synth_constants";
import {
    type MIDIPatch,
    MIDIPatchTools
} from "../../soundbank/basic_soundbank/midi_patch";
import type { MIDISystem } from "../../soundbank/types";
import type { ChannelMIDIParameter } from "../../synthesizer/audio_engine/channel/parameters/midi";
import type {
    GSChorusParameter,
    GSDelayParameter,
    GSReverbParameter,
    InsertionProcessorSnapshot
} from "../../synthesizer/audio_engine/effects/types";
import type { GlobalMIDIParameter } from "../../synthesizer/audio_engine/parameters/midi";
import { BankSelectHacks } from "../../utils/midi_hacks";
import type { BasicMIDI } from "../basic_midi";
import {
    type MIDIController,
    MIDIControllers,
    MIDIMessageTypes
} from "../enums";
import { MIDIUtils } from "./midi_utils";
import { ParameterTracker } from "./parameter_tracker";
import type {
    DrumParameter,
    TimelineEvent,
    UserDrumSetParameter
} from "../types";
import { RP_15_RESET_CC_NUMS } from "../../synthesizer/audio_engine/channel/reset";
import type { AnalyzedMIDIMessage } from "./analyzed_message";
import {
    DEFAULT_GS_DRUM_MAP,
    DEFAULT_XG_DRUM_MAP,
    MELODIC_MAP
} from "./sysex_data";

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
     * - `specific value` - replaces every system reset with the desired one.
     *
     * > **Note**
     * >
     * > By default, a meaningful GM reset (one with notes after it)
     * > is replaced with a GS reset. Set the `system` parameter to `gm`
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
    reverbParams?: ClearableParameter<GSReverbParameter>;
    /**
     * The GS chorus parameters.
     * - `"clear"` - all existing parameter change MIDI messages are cleared.
     * - {@link GSChorusParameter} - clear + the new parameters are set via System Exclusive messages.
     */
    chorusParams?: ClearableParameter<GSChorusParameter>;
    /**
     * The GS delay parameters.
     * - `"clear"` - all existing parameter change MIDI messages are cleared.
     * - {@link GSDelayParameter} - clear + the new parameters are set via System Exclusive messages.
     */
    delayParams?: ClearableParameter<GSDelayParameter>;
    /**
     * The GS Insertion Effect parameters.
     * - `"clear"` - all existing parameter change MIDI messages are cleared.
     * - {@link InsertionProcessorSnapshot} - clear + the new parameters are set via System Exclusive messages.
     */
    insertionParams?: ClearableParameter<InsertionProcessorSnapshot>;
}

// Internal tracking interface
interface ChannelStatus {
    // True while the channel has not yet had its first note on after a reset
    isFirstNoteOn: boolean;
    // RPN/NRPN tracking
    param: ParameterTracker;
    // If the parameters (MSB, LSB and the first data) were cleared.
    // Some MIDIs send param MSB once and then set via LSB only, like:
    // MSB,
    // LSB,
    // Data,
    // LSB,
    // Data,
    // And even though it violates MIDI 1.0, it works...
    clearedParams: {
        // Param LSB
        pLSB: boolean;
        // Param MSB
        pMSB: boolean;
        // Data (any)
        data: boolean;
    };

    // Channel number for logging
    readonly channel: number;

    // Currently tracked drum map of this channel
    drumMap: number;

    // Direct copy of channelModification.keyShift
    // RELATIVE semitones, for easier access rather than having to do "?? 0"
    readonly relativeKeyShift: number;

    // Direct copy of channelModification.fineTune
    // RELATIVE cents, for easier access rather than having to do "?? 0"
    readonly relativeFineTune: number;

    // Since tuning has to be applied relatively,
    // We need to track the currently applied tuning
    currentFineTune: number;

    // Same case as with above, since total tune may exceed the RPN range.
    currentKeyShift: number;

    // Pending N/RPN replacement, awaiting a possible second data entry.
    //
    // Parameter data arrives as two separate data entries (MSB and LSB, in any order).
    // We don't know if the second data byte will come, so the first analysis (and potential insert) uses a partial value from the 3-message N/RPN.
    // Each entry is analyzed independently, so the first insert uses a partial value.
    // A later data entry for the same parameter updates the inserted messages.
    // Selections, note-ons and resets all void the record (treated as a new data entry).
    pendingParam:
        | {
              // The inserted [paramMSB, paramLSB, dataMSB, dataLSB] events for in-place patching
              events: MIDIMessage[];
          }
        | undefined;
}

/**
 * A GM reset location, for meaningful resets.
 * A reset is defined as meaningful only if notes come after it.
 * For example, many MIDIs do:
 *
 * GM -> GS -> note data
 *
 * That GM reset is meaningless, so it can stay unmodified as the actual reset that matters is GS.
 * Meaningful ones are replaced with GS in-place
 * (unless the `system` parameter is explicitly set).
 *
 * They are replaced so bank selects (and many other parameters) actually work.
 */
interface PotentialGMReset {
    /**
     * The reset event itself.
     */
    event: MIDIMessage;
    /**
     * The track containing the event.
     */
    track: number;
}

/**
 * A single-use class for editing a MIDI file.
 * @internal
 */
export class MIDIEditor {
    private readonly midi;
    private readonly channelChanges = new Map<number, ChannelModification>();
    private system;
    private readonly channelStatuses = new Array<ChannelStatus>();
    /**
     * MIDI port number for the corresponding track
     */
    private readonly midiPorts;
    /**
     * MIDI port: channel offset
     */
    private midiPortChannelOffsets: Record<number, number> = {};

    private currentPortOffset = 0;
    /**
     * If the current event is an N/RPN event,
     * this is set, otherwise -1.
     */
    private currentParameterChannel = -1;

    /**
     * Track only channels to clear
     */
    private readonly clearedChannels = new Set<number>();

    private addedReset = false;
    // Track reset position to insert setups right after
    private readonly resetPosition: TimelineEvent = {
        tr: 0,
        ev: 0
    };
    /**
     * Tick time of the last system reset.
     */
    private resetTicks = 0;
    /**
     * The event of the last tracked system reset,
     * for syncing this.system if it gets replaced later.
     */
    private lastReset: MIDIMessage | undefined = undefined;
    /**
     * Meaningful GM resets found during the main loop.
     * Every entry gets replaced with GS
     * if the `system` global MIDI param has not been explicitly set.
     */
    private readonly gmResets: PotentialGMReset[] = [];
    /**
     * The most recent GM reset, still awaiting notes.
     * Discarded whenever another reset is encountered.
     */
    private pendingGMReset: PotentialGMReset | undefined = undefined;

    private readonly reverbParams;
    private readonly chorusParams;
    private readonly delayParams;
    private readonly insertionParams;
    private readonly userDrumSetParams;
    private readonly midiParams;
    /**
     * Current, for handleEvent
     * @private
     */
    private trackNum = 0;

    /**
     * Current, for handleEvent
     * @private
     */
    private eventIndexes = [0];

    /**
     * Allows easy editing of the file by removing channels, changing programs,
     * changing controllers and transposing channels, plus lots of other parameters.
     * Note that this modifies the MIDI in-place.
     * @internal
     */
    public constructor(midi: BasicMIDI, opts: ModifyMIDIOptions) {
        this.midi = midi;
        SpessaLog.groupCollapsed(
            "%cApplying changes to the MIDI file...",
            ConsoleColors.info
        );
        const {
            channels,
            reverbParams,
            chorusParams,
            delayParams,
            insertionParams,
            userDrumParams,
            midiParams
        } = opts;

        // Save options
        this.reverbParams = reverbParams;
        this.chorusParams = chorusParams;
        this.delayParams = delayParams;
        this.insertionParams = insertionParams;
        this.userDrumSetParams = userDrumParams;
        this.midiParams = midiParams;

        // Track only channels to change here
        if (channels) {
            for (const [channel, ch] of channels) {
                if (ch === "clear") this.clearedChannels.add(channel);
                else this.channelChanges.set(channel, ch);
            }
        }

        this.system =
            (opts.midiParams?.system === "clear"
                ? undefined
                : opts.midiParams?.system) ?? "gs";

        // It copies midiPorts everywhere else, but here 0 works so DO NOT CHANGE!
        /**
         * MIDI port number for the corresponding track
         */
        this.midiPorts = midi.tracks.map((t) => t.port);

        // Assign port offsets
        for (let i = 0; i < midi.tracks.length; i++) {
            this.assignMIDIPort(i, midi.tracks[i].port);
        }

        const channelsAmount = this.currentPortOffset;
        for (let i = 0; i < channelsAmount; i++) {
            this.channelStatuses.push({
                channel: i,
                isFirstNoteOn: true,
                drumMap:
                    i % 16 === MIDI_DRUM_CHANNEL
                        ? DEFAULT_GS_DRUM_MAP
                        : MELODIC_MAP,
                param: new ParameterTracker(i),
                clearedParams: {
                    pLSB: true,
                    pMSB: true,
                    data: true
                },
                relativeKeyShift: this.channelChanges.get(i)?.keyShift ?? 0,
                relativeFineTune: this.channelChanges.get(i)?.fineTune ?? 0,
                currentFineTune: 0,
                currentKeyShift: 0,
                pendingParam: undefined
            });
        }
    }

    public apply() {
        // Go through all events one by one
        this.midi.iterate(this.handleEvent.bind(this));
        this.applyResetParams();
    }

    private assignMIDIPort(trackNum: number, port: number) {
        // Do not assign ports to empty tracks

        if (this.midi.tracks[trackNum].channels.size === 0) return;

        // Assign new 16 channels if the port is not occupied yet
        if (this.currentPortOffset === 0) {
            this.currentPortOffset += 16;
            this.midiPortChannelOffsets[port] = 0;
        }

        if (this.midiPortChannelOffsets[port] === undefined) {
            this.midiPortChannelOffsets[port] = this.currentPortOffset;
            this.currentPortOffset += 16;
        }

        this.midiPorts[trackNum] = port;
    }

    /**
     * This function adds the events before the current one IN ORDER they are in the array,
     * So the first event in the array will end up as the first one before the current event.
     * @param events
     */
    private addEventsBefore(...events: MIDIMessage[]) {
        const track = this.trackNum;
        const at = this.eventIndexes[track];
        for (const item of events) {
            this.midi.tracks[track].addEvents(this.eventIndexes[track], item);
            // Update event indexes
            this.eventIndexes[track]++;
        }
        // Update reset position if needed
        if (track === this.resetPosition.tr && at <= this.resetPosition.ev) {
            this.resetPosition.ev += events.length;
        }
    }

    /**
     * This function adds the events after the current one IN ORDER they are in the array,
     * So the first event in the array will end up as the first one after the current event.
     * @param events
     */
    private addEventsAfter(...events: MIDIMessage[]) {
        const track = this.trackNum;
        const at = this.eventIndexes[track] + 1;
        for (const item of events) {
            this.midi.tracks[track].addEvents(
                this.eventIndexes[track] + 1,
                item
            );
            // Update event indexes
            this.eventIndexes[track]++;
        }
        // Update reset position if needed
        if (track === this.resetPosition.tr && at <= this.resetPosition.ev) {
            this.resetPosition.ev += events.length;
        }
    }

    /**
     * Deletes this event, or parameter.
     * @private
     */
    private deleteThisEvent() {
        this.deleteTrackEvent(this.trackNum, this.eventIndexes[this.trackNum]);
    }

    /**
     * Deletes an event from a track and keeps every cached RPN/NRPN parameter
     * event index valid.
     *
     * The parameter trackers cache absolute event indexes so a whole N/RPN group can be removed later. Whenever
     * an event is deleted, the loop position and every cached index that comes
     * after the deleted event must shift down by one, otherwise a later cleanup
     * would delete the wrong events.
     * Testcase: midi_editor_nrpn_test.ts (Case: interleaved NRPN between channels)
     * @param track The track to delete the event from.
     * @param index The index of the event to delete.
     * @private
     */
    private deleteTrackEvent(track: number, index: number) {
        this.midi.tracks[track].deleteEvent(index);

        // Move the loop back if we deleted the current (or a previous) event.
        // This prevents it from skipping over the shifted events.
        if (index <= this.eventIndexes[track]) {
            this.eventIndexes[track]--;
        }

        // Update all trackers accordingly
        for (const channelStatus of this.channelStatuses) {
            channelStatus.param.deleteEvent(track, index);
        }

        // Update reset index if needed
        if (track === this.resetPosition.tr && index <= this.resetPosition.ev) {
            this.resetPosition.ev--;
        }
    }

    private deleteCurrentEvent() {
        if (this.currentParameterChannel !== -1) {
            this.deleteCurrentParameter();
            return;
        }
        this.deleteThisEvent();
    }

    private deleteCurrentParameter() {
        const ch = this.channelStatuses[this.currentParameterChannel];
        // Delete the parameter selection pair + the data entry that we're currently processing.
        // We don't wait for lsb as it's not required to arrive :-(
        // Why, MIDI, why are you like this?
        // Now I have to handle this complex mess that has to work for either single or double data...
        // And both parameters aren't even required to be sent! Well, they are! But some files don't care.
        // And Sound Canvases don't seem to care either...

        // Testcase: MIDI_Jam & Spoon_Right In The Night.mid, channel 12.
        // That's why we track what we can and can't delete.
        const p = ch.param;
        const msb = p.paramMSB;
        const lsb = p.paramLSB;

        // Delete the current data entry event first.
        // This is safe because it's the event currently being processed in the loop,
        // Meaning its index is always higher than or equal
        // To the cached MSB/LSB (possibly on a different track).
        if (!ch.clearedParams.data) {
            this.deleteThisEvent();
            SpessaLog.info(
                `%cClearing Non/Registered Parameter on %c${ch.channel}%c. (Current data entry)`,
                ConsoleColors.info,
                ConsoleColors.recognized,
                ConsoleColors.info
            );

            // Flag data as deleted
            ch.clearedParams.data = true;
        }

        // Delete params

        // The cached MSB/LSB indexes are kept valid by `deleteTrackEvent`.
        // It shifts all cached indexes whenever an event is deleted.
        if (!ch.clearedParams.pMSB) {
            // Delete param MSB
            this.deleteTrackEvent(msb.track, msb.event);

            // Flag MSB as deleted
            ch.clearedParams.pMSB = true;

            SpessaLog.info(
                `%cClearing Non/Registered Parameter on %c${ch.channel}%c. (Param MSB)`,
                ConsoleColors.info,
                ConsoleColors.recognized,
                ConsoleColors.info
            );
        }

        if (!ch.clearedParams.pLSB) {
            // Delete param LSB
            this.deleteTrackEvent(lsb.track, lsb.event);

            // Flag LSB as deleted
            ch.clearedParams.pLSB = true;

            SpessaLog.info(
                `%cClearing Non/Registered Parameter on %c${ch.channel}%c. (Param LSB)`,
                ConsoleColors.info,
                ConsoleColors.recognized,
                ConsoleColors.info
            );
        }
    }

    private handleEvent(
        e: MIDIMessage,
        trackNum: number,
        eventIndexes: number[]
    ) {
        this.trackNum = trackNum;
        this.eventIndexes = eventIndexes;
        this.currentParameterChannel = -1;

        const portOffset =
            this.midiPortChannelOffsets[this.midiPorts[trackNum]] ?? 0;
        if (e.statusByte === MIDIMessageTypes.midiPort) {
            this.assignMIDIPort(trackNum, e.data[0]);
            return;
        }
        // Only process voice + system exclusive messages
        if (
            e.statusByte < MIDIMessageTypes.noteOff ||
            e.statusByte > MIDIMessageTypes.systemExclusive
        )
            return;

        const status = e.statusByte & 0xf0;
        const midiChannel = e.statusByte & 0xf;
        const channel = midiChannel + portOffset;
        // Clear channel?
        if (
            e.statusByte !== MIDIMessageTypes.systemExclusive &&
            this.clearedChannels.has(channel)
        ) {
            this.deleteCurrentEvent();
            return;
        }
        const channelStatus = this.channelStatuses[channel];
        const channelChange = this.channelChanges.get(channel);
        switch (status) {
            case MIDIMessageTypes.noteOn: {
                // Check velocity 0
                if (e.data[1] === 0) {
                    // That is a note off
                    if (!channelChange) break;
                    e.data[0] = Math.max(
                        0,
                        Math.min(
                            127,
                            e.data[0] +
                                channelStatus.relativeKeyShift +
                                channelStatus.currentKeyShift
                        )
                    );
                    break;
                }
                // A first note after a GM reset makes it meaningful, track for replacement
                if (this.pendingGMReset !== undefined) {
                    this.gmResets.push(this.pendingGMReset);
                    this.pendingGMReset = undefined;
                }
                // Is it first?
                if (channelStatus.isFirstNoteOn) {
                    this.firstNoteOn(e.ticks, channel);
                    channelStatus.isFirstNoteOn = false;
                }
                // A note voids any pending parameter halves:
                // Rewriting them afterward would change what it heard.
                channelStatus.pendingParam = undefined;
                // Transpose key and clamp if needed
                // For 0 it will stay as is
                e.data[0] = Math.max(
                    0,
                    Math.min(
                        127,
                        e.data[0] +
                            channelStatus.relativeKeyShift +
                            channelStatus.currentKeyShift
                    )
                );
                break;
            }

            case MIDIMessageTypes.noteOff:
            // Poly pressure is also transposed
            case MIDIMessageTypes.polyPressure: {
                if (!channelChange) break;
                e.data[0] = Math.max(
                    0,
                    Math.min(
                        127,
                        e.data[0] +
                            channelStatus.relativeKeyShift +
                            channelStatus.currentKeyShift
                    )
                );
                break;
            }

            case MIDIMessageTypes.programChange: {
                // Do we delete it?
                if (channelChange?.patch) {
                    // This channel has program change. BEGONE!
                    this.deleteCurrentEvent();
                    return;
                }
                break;
            }

            case MIDIMessageTypes.pitchWheel: {
                // Do we delete it?
                if (channelChange?.midiParams?.pitchWheel) {
                    // Locked, remove
                    this.deleteCurrentEvent();
                }
                break;
            }

            case MIDIMessageTypes.channelPressure: {
                // Do we delete it?
                if (channelChange?.midiParams?.pressure) {
                    // Locked, remove
                    this.deleteCurrentEvent();
                }
                break;
            }

            case MIDIMessageTypes.controllerChange: {
                this.handleControllerChange(
                    e.data[0] as MIDIController,
                    e.data[1],
                    channel
                );
                break;
            }

            case MIDIMessageTypes.systemExclusive: {
                const syxs = MIDIUtils.analyzeSysEx(e.data);
                for (const syx of syxs) {
                    // Clear channel sysExes too
                    if (
                        "channel" in syx &&
                        this.clearedChannels.has(syx.channel + portOffset)
                    ) {
                        // BEGONE, CHANNEL CHANGE!
                        this.deleteCurrentEvent();
                        return;
                    }
                    switch (syx.type) {
                        case "Map Drum Setup": {
                            // Delete map drum setups affecting modified channels
                            if (
                                this.shouldClearMapDrum(
                                    syx.drumMap,
                                    syx.key,
                                    syx.parameter
                                )
                            ) {
                                this.deleteCurrentEvent();
                                return;
                            }
                            break;
                        }

                        case "GS Reverb Param": {
                            // Delete all reverb params since we're setting new ones
                            if (this.reverbParams) {
                                this.deleteCurrentEvent();
                                return;
                            }
                            break;
                        }

                        case "GS Chorus Param": {
                            // Delete all chorus params since we're setting new ones
                            if (this.chorusParams) {
                                this.deleteCurrentEvent();
                                return;
                            }
                            break;
                        }

                        case "GS Delay Param": {
                            // Delete all delay params since we're setting new ones
                            if (this.delayParams) {
                                this.deleteCurrentEvent();
                                return;
                            }
                            break;
                        }

                        case "GS Insertion Param": {
                            // Delete all insertion params since we're setting new ones
                            if (this.insertionParams) {
                                this.deleteCurrentEvent();
                                return;
                            }
                            break;
                        }

                        case "Program Change": {
                            // SysEx can change programs
                            // Do we delete it?
                            if (
                                this.channelChanges.get(
                                    syx.channel + portOffset
                                )?.patch
                            ) {
                                // This channel has program change. BEGONE!
                                this.deleteCurrentEvent();

                                return;
                            }
                            break;
                        }

                        case "Global MIDI Param": {
                            if (syx.parameter === "system") {
                                this.handleReset(syx.value, e);
                                return;
                            }
                            if (this.midiParams?.[syx.parameter]) {
                                // Locked, remove
                                this.deleteCurrentEvent();
                                return;
                            }
                            break;
                        }

                        case "Channel MIDI Param": {
                            this.handleChannelMIDIParam(
                                syx.channel + portOffset,
                                syx
                            );
                            break;
                        }

                        case "Controller Change": {
                            // SysEx can change controllers too!
                            this.handleControllerChange(
                                syx.controller,
                                syx.value,
                                syx.channel + portOffset
                            );
                            break;
                        }

                        case "User Drum Setup": {
                            const params = this.userDrumSetParams?.get(
                                syx.drumSet
                            );
                            if (!params) return;
                            // Clear whole drum set?
                            if (params === "clear") {
                                // BEGONE!
                                this.deleteCurrentEvent();
                                return;
                            }
                            const noteParams = params.get(syx.midiNote);
                            // Clear this note?
                            if (noteParams === "clear") {
                                // BEGONE!
                                this.deleteCurrentEvent();
                                return;
                            }

                            // Clear this parameter on this note?
                            // Either clear or set value clears it
                            if (noteParams?.[syx.parameter] !== undefined) {
                                // BEGONE!
                                this.deleteCurrentEvent();
                                return;
                            }
                        }
                    }
                }
                return;
            }
        }
    }

    private handleChannelMIDIParam(
        channel: number,
        data: Extract<AnalyzedMIDIMessage, { type: "Channel MIDI Param" }>,
        isRPN = false
    ) {
        const channelStatus = this.channelStatuses[channel];
        // Track the drum map
        if (data.parameter === "drumMap") {
            channelStatus.drumMap = data.value;
        }
        const channelChange = this.channelChanges.get(channel);
        if (!channelChange) return;

        if (data.parameter === "fineTune" && channelStatus.relativeFineTune) {
            channelStatus.currentFineTune = data.value;
            // Add the relative fine tune to the existing one
            const newTune = channelStatus.relativeFineTune + data.value;

            channelStatus.currentKeyShift = Math.trunc(newTune / 100);
            const targetTune = newTune % 100;

            SpessaLog.info(
                `%cFine tuning already present on ${channel}%c (${data.value})%c, ` +
                    `new relative tune: %c${newTune}%c cents. Key shift: %c${channelStatus.currentKeyShift}%c semitones. ` +
                    `Actual RPN value to set: %c${targetTune} cents.`,
                ConsoleColors.info,
                ConsoleColors.recognized,
                ConsoleColors.info,
                ConsoleColors.value,
                ConsoleColors.info,
                ConsoleColors.value,
                ConsoleColors.info,
                ConsoleColors.value
            );

            // And update this tuning
            const index = this.eventIndexes[this.trackNum];
            const e = this.midi.tracks[this.trackNum].events[index];

            this.deleteCurrentEvent();

            // Don't update tuning if no notes have played.
            if (channelStatus.isFirstNoteOn) {
                return;
            }

            // Build the replacement rpn
            const newRPN = MIDIUtils.setChannelMIDIParameter(
                e.ticks,
                channel % 16,
                this.system,
                "fineTune",
                targetTune
            );
            const pending = channelStatus.pendingParam;

            // If we have a pending N/RPN, then this is its extra byte
            if (pending !== undefined && isRPN) {
                // This is the extra byte of the RPN message, update the original with the corrected value
                SpessaLog.info(
                    `%cSecond RPN data byte on ${channel}%c, updating inserted parameter in place.`,
                    ConsoleColors.info,
                    ConsoleColors.recognized
                );
                pending.events[2].data[1] = newRPN[2].data[1];
                pending.events[3].data[1] = newRPN[3].data[1];
                channelStatus.pendingParam = undefined;
                return;
            }

            // And update this tuning
            this.addEventsBefore(...newRPN);
            // Track after adding, only for RPN change.
            // A not-RPN message voids any pending pair instead:
            // A later half belongs to a new message, not the old one.
            channelStatus.pendingParam = isRPN ? { events: newRPN } : undefined;
        } else if (channelChange?.midiParams?.[data.parameter]) {
            // Locked, remove
            // We don't remove fineTune because we can adjust it relatively
            this.deleteCurrentEvent();
        }
    }

    private shouldClearChannelDrum(
        channel: number,
        key: number,
        parameter: keyof DrumParameter
    ) {
        const drumParams = this.channelChanges.get(channel)?.drumParams;
        if (drumParams === undefined) return false;
        // "clear" removes all drum edits for this channel
        if (drumParams === "clear") return true;
        const noteParams = drumParams.get(key);
        if (noteParams === undefined) return false;
        // Either "clear" or a set value removes the file's message
        return noteParams === "clear" || noteParams[parameter] !== undefined;
    }

    /**
     * This checks the sysEx version of drum setup, which specifies a map rather than a channel.
     */
    private shouldClearMapDrum(
        drumMap: number,
        key: number,
        parameter: keyof DrumParameter
    ) {
        for (
            let channel = 0;
            channel < this.channelStatuses.length;
            channel++
        ) {
            if (this.channelStatuses[channel].drumMap !== drumMap) continue;
            if (this.shouldClearChannelDrum(channel, key, parameter)) {
                return true;
            }
        }
        return false;
    }

    private handleControllerChange(
        ccNum: MIDIController,
        value: number,
        channel: number
    ) {
        // Change may be undefined but don't check, because we may encounter a "clear Drum param" request while the channel is not changed
        // This still involves removing the drum NRPN
        // Also param tracking
        const channelChange = this.channelChanges.get(channel);
        const channelStatus = this.channelStatuses[channel];

        const index = this.eventIndexes[this.trackNum];
        const change = channelChange?.controllers?.get(ccNum);
        if (change !== undefined) {
            // This controller is locked, BEGONE CHANGE!
            this.deleteCurrentEvent();
            return;
        }
        switch (ccNum) {
            case MIDIControllers.bankSelect:
            case MIDIControllers.bankSelectLSB: {
                if (channelChange?.patch) {
                    // BEGONE!
                    this.deleteCurrentEvent();
                }
                return;
            }

            case MIDIControllers.registeredParameterLSB:
            case MIDIControllers.registeredParameterMSB:
            case MIDIControllers.nonRegisteredParameterMSB:
            case MIDIControllers.nonRegisteredParameterLSB: {
                // A new selection starts a new message
                channelStatus.pendingParam = undefined;
                // Flag the parameter as not cleared
                if (
                    ccNum === MIDIControllers.nonRegisteredParameterLSB ||
                    ccNum === MIDIControllers.registeredParameterLSB
                )
                    channelStatus.clearedParams.pLSB = false;
                else channelStatus.clearedParams.pMSB = false;

                channelStatus.param.controllerChange(
                    ccNum,
                    value,
                    this.trackNum,
                    index
                );
                return;
            }

            case MIDIControllers.dataEntryMSB:
            case MIDIControllers.dataEntryLSB: {
                channelStatus.clearedParams.data = false;
                const data = channelStatus.param.controllerChange(
                    ccNum,
                    value,
                    this.trackNum,
                    index
                );
                this.currentParameterChannel = channel;

                if (!data) return;
                switch (data.type) {
                    case "Channel Drum Setup": {
                        if (
                            this.shouldClearChannelDrum(
                                data.channel,
                                data.key,
                                data.parameter
                            )
                        ) {
                            // Drum param, BEGONE!
                            this.deleteCurrentEvent();
                        }
                        return;
                    }

                    case "Controller Change": {
                        // NRPN can change controllers too!
                        this.handleControllerChange(
                            data.controller,
                            data.value,
                            data.channel
                        );
                        return;
                    }

                    case "Channel MIDI Param": {
                        this.handleChannelMIDIParam(channel, data, true);
                    }
                }

                // If the parameters (MSB, LSB and the first data) were cleared.
                // Some MIDIs send param MSB once and then set via LSB only, like:
                // MSB,
                // LSB,
                // Data,
                // LSB,
                // Data,
                // And even though it violates MIDI 1.0, it works...
                // So since we've used those, mark them as "cleaned" so future LSB-only entries won't delete them.
                channelStatus.clearedParams.pLSB = true;
                channelStatus.clearedParams.pMSB = true;
                return;
            }

            case MIDIControllers.resetAllControllers: {
                this.handleResetAllControllers(channel);
                return;
            }

            default: {
                return;
            }
        }
    }
    /**
     * https://amei.or.jp/midistandardcommittee/Recommended_Practice/e/rp15.pdf
     * Reset controllers according to RP-15 Recommended Practice.
     *
     * From the PDF:
     * Upon receipt of Reset All Controllers message (Controller #121) the following actions are taken
     *  for the specified MIDI channel:
     *  Set Expression (#11) to 127.
     *  Set Modulation (#1) to 0.
     *  Set Pedals (#64, #65, #66, #67) to 0.
     *  Set Registered and Non-registered parameter number LSB and MSB
     *  (#98-#101) to null value (127)
     *  Set pitch bender to center (64/0)
     *  Reset channel pressure to 0
     *  Reset polyphonic pressure for all notes to 0.
     *  Do NOT reset Bank Select (#0/#32)
     *  Do NOT reset Volume (#7)
     *  Do NOT reset Pan (#10)
     *  Do NOT reset Program Change.
     *  Do NOT reset Effect Controllers (#91-#95)
     *  Do NOT reset Sound Controllers
     *  (#70-#79)
     *  Do NOT reset other channel mode messages (#120-#127).
     *  Do NOT reset registered or non-registered parameters.
     *  Any other controllers that a device can respond to should be set to 0, or the behavior should
     *  be specified and/or documented. If the manufacturer does not want the Reset All Controllers
     *  message to affect a particular controller, that is also permissible, as long as the behavior is
     *  documented.
     *
     *  Note:
     *  GS/XG only reset the specified CCs above.
     */
    private handleResetAllControllers(channel: number) {
        const track = this.midi.tracks[this.trackNum];
        // Add after this event, on the same tick.
        const index = this.eventIndexes[this.trackNum];
        const ticks = track.events[index].ticks;
        const channelChange = this.channelChanges.get(channel);
        if (!channelChange) return;

        // Restore MIDI parameters
        if (
            channelChange.midiParams?.pitchWheel !== undefined &&
            channelChange.midiParams?.pitchWheel !== "clear"
        ) {
            this.addEventsAfter(
                ...MIDIUtils.setChannelMIDIParameter(
                    ticks,
                    channel,
                    this.system,
                    "pitchWheel",
                    channelChange.midiParams.pitchWheel
                )
            );
        }
        if (
            channelChange.midiParams?.pressure !== undefined &&
            channelChange.midiParams?.pressure !== "clear"
        ) {
            this.addEventsAfter(
                ...MIDIUtils.setChannelMIDIParameter(
                    ticks,
                    channel,
                    this.system,
                    "pressure",
                    channelChange.midiParams.pressure
                )
            );
        }
        for (const cc of RP_15_RESET_CC_NUMS) {
            const value = channelChange.controllers?.get(cc);
            if (value !== undefined && value !== "clear") {
                this.addEventsAfter(
                    MIDIMessage.controllerChange(ticks, channel, cc, value)
                );
            }
        }
    }

    private firstNoteOn(ticks: number, channel: number) {
        const channelChange = this.channelChanges.get(channel);
        // Make sure that we want to modify this channel at all
        if (!channelChange) return;
        const channelStatus = this.channelStatuses[channel];
        const midiChannel = channel % 16;

        // All right, so this is the first note on for this channel
        // The order is:
        // - patch selection
        // - controllers
        // - parameters
        // - relative fine tune
        // - drum setup

        // Program change
        const patch = channelChange.patch;
        if (patch && patch !== "clear") {
            SpessaLog.info(
                `%cSetting %c${channel}%c to %c${MIDIPatchTools.toMIDIString(patch)}%c. Track num: %c${this.trackNum}`,
                ConsoleColors.info,
                ConsoleColors.recognized,
                ConsoleColors.info,
                ConsoleColors.recognized,
                ConsoleColors.info,
                ConsoleColors.recognized
            );

            let desiredBankMSB = patch.bankMSB;
            let desiredBankLSB = patch.bankLSB;
            const desiredProgram = patch.program;

            // The output event order is: drums -> msb -> lsb -> program change
            if (
                patch.isGMGSDrum &&
                !BankSelectHacks.isSystemXG(this.system) &&
                midiChannel !== MIDI_DRUM_CHANNEL
            ) {
                // Add gs drum change first
                SpessaLog.info(
                    `%cAdding GS Drum change on track %c${this.trackNum}`,
                    ConsoleColors.recognized,
                    ConsoleColors.value
                );
                this.addEventsBefore(
                    ...MIDIUtils.setChannelMIDIParameter(
                        ticks,
                        midiChannel,
                        "gs",
                        "drumMap",
                        1
                    )
                );
            }

            if (BankSelectHacks.isSystemXG(this.system) && patch.isGMGSDrum) {
                // Best I can do is XG drums
                SpessaLog.info(
                    `%cAdding XG Drum change on track %c${this.trackNum}`,
                    ConsoleColors.recognized,
                    ConsoleColors.value
                );
                desiredBankMSB = BankSelectHacks.getDrumBank(this.system);
                desiredBankLSB = 0;
            }

            // Add bank change (MSB first)
            this.addEventsBefore(
                MIDIMessage.controllerChange(
                    ticks,
                    midiChannel,
                    MIDIControllers.bankSelect,
                    desiredBankMSB
                ),
                MIDIMessage.controllerChange(
                    ticks,
                    midiChannel,
                    MIDIControllers.bankSelectLSB,
                    desiredBankLSB
                )
            );

            // Add program change
            this.addEventsBefore(
                MIDIMessage.programChange(ticks, midiChannel, desiredProgram)
            );
        }

        // Add absolute tuning to the inserted tune.
        const absoluteTune = channelChange.midiParams?.fineTune;
        let finalTune: number | undefined;

        if (absoluteTune !== undefined && absoluteTune !== "clear") {
            // The parameter "fineTune" has been explicitly set, this is the absolute
            // Add the relative tuning to the absolute MIDI param
            const newTune = channelStatus.relativeFineTune + absoluteTune;
            channelStatus.currentKeyShift = Math.trunc(newTune / 100);
            finalTune = newTune % 100;
        } else if (channelStatus.relativeFineTune !== 0) {
            // Make the relative tuning be set in MIDI parameters.
            // Fine tune in channel MIDI Params is absolute, add the relative one to it.
            // A cleared param still applies the relative tune, if any.
            const newTune =
                channelStatus.relativeFineTune + channelStatus.currentFineTune;
            channelStatus.currentKeyShift = Math.trunc(newTune / 100);
            finalTune = newTune % 100;
        }

        // Add controllers
        if (channelChange.controllers)
            for (const [cc, value] of channelChange.controllers) {
                if (value === "clear") continue;
                const ccChange = MIDIMessage.controllerChange(
                    ticks,
                    midiChannel,
                    cc,
                    value
                );
                this.addEventsBefore(ccChange);
            }

        // Add MIDI parameters
        if (channelChange.midiParams) {
            for (const [param, value] of Object.entries(
                channelChange.midiParams
            ) as {
                [P in keyof ChannelMIDIParameter]: [
                    P,
                    ClearableParameter<ChannelMIDIParameter[P]>
                ];
            }[keyof ChannelMIDIParameter][]) {
                // Fine tune is inserted below from the calculated value above,
                // Don't set it here
                if (value === "clear" || param === "fineTune") continue;
                this.addEventsBefore(
                    ...MIDIUtils.setChannelMIDIParameter(
                        ticks,
                        midiChannel,
                        this.system,
                        param,
                        value
                    )
                );
            }
        }

        // Insert the target fine tune
        if (finalTune !== undefined) {
            this.addEventsBefore(
                ...MIDIUtils.setChannelMIDIParameter(
                    ticks,
                    midiChannel,
                    this.system,
                    "fineTune",
                    finalTune
                )
            );
        }

        // Add drum setup parameters
        if (channelChange.drumParams && channelChange.drumParams !== "clear") {
            for (const [key, noteParams] of channelChange.drumParams) {
                // Note cleared
                if (noteParams === "clear") continue;
                for (const [param, value] of Object.entries(noteParams) as {
                    [P in keyof DrumParameter]: [
                        P,
                        ClearableParameter<DrumParameter[P]>
                    ];
                }[keyof DrumParameter][]) {
                    // Parameter cleared
                    if (value === "clear" || value === undefined) continue;
                    this.addEventsBefore(
                        ...MIDIUtils.setDrumChannelParameter(
                            ticks,
                            midiChannel,
                            key,
                            param,
                            value
                        )
                    );
                }
            }
        }
    }

    private handleReset(system: MIDISystem, e: MIDIMessage) {
        const requested = this.midiParams?.system;
        if (requested === "clear") {
            // Delete every reset. The locked setup is inserted
            // Before the first note on without any reset.
            SpessaLog.info(
                "%cSystem reset cleared, removing!",
                ConsoleColors.info
            );
            this.deleteCurrentEvent();
            return;
        }
        if (requested !== undefined) {
            // Replace every reset with the desired one, in place.
            if (system !== requested) {
                SpessaLog.info(
                    `%cReplacing ${system.toUpperCase()} reset with ${requested.toUpperCase()}!`,
                    ConsoleColors.info
                );
                this.midi.tracks[this.trackNum].events[
                    this.eventIndexes[this.trackNum]
                ] = MIDIUtils.reset(e.ticks, requested);
            }
            this.trackReset(requested, e.ticks);
            return;
        }
        // A new reset makes the GM meaningless,
        // It had no notes after it, so it stays as is.
        if (this.pendingGMReset !== undefined) {
            this.pendingGMReset = undefined;
        }
        if (system === "gm") {
            // A GM reset: if notes follow, it's meaningful
            // And gets pushed to gmResets on the first note
            // To be replaced with GS in applyResetParams.
            // Track it here
            this.pendingGMReset = {
                event: e,
                track: this.trackNum
            };
        }
        this.trackReset(system, e.ticks);
    }

    private trackReset(system: MIDISystem, ticks: number) {
        SpessaLog.info(
            `%c${system.toUpperCase()} system on detected`,
            ConsoleColors.info
        );
        this.system = system;
        this.addedReset = true; // Flag as true so reset won't get added
        this.resetPosition.tr = this.trackNum;
        this.resetPosition.ev = this.eventIndexes[this.trackNum];
        this.lastReset =
            this.midi.tracks[this.trackNum].events[
                this.eventIndexes[this.trackNum]
            ];
        this.resetTicks = Math.max(this.resetTicks, ticks);
        // Reset NRPN (accuracy + prevent deletion before reset)
        // Reset tracked drum maps to defaults as well.
        const defaultMap =
            system === "xg" ? DEFAULT_XG_DRUM_MAP : DEFAULT_GS_DRUM_MAP;
        for (const ch of this.channelStatuses) {
            ch.param.reset();
            ch.pendingParam = undefined;
            ch.drumMap =
                ch.channel % 16 === MIDI_DRUM_CHANNEL
                    ? defaultMap
                    : MELODIC_MAP;
            ch.clearedParams = {
                pLSB: true,
                pMSB: true,
                data: true
            };
            // Reset means that new "first notes" are here to have the setups inserted
            ch.isFirstNoteOn = true;
        }
    }

    private applyResetParams() {
        // Replace the collected meaningful GM resets with GS, in place.
        const replacedEvents = new Set<MIDIMessage>();
        for (const gmReset of this.gmResets) {
            const events = this.midi.tracks[gmReset.track].events;
            const index = events.indexOf(gmReset.event);
            if (index === -1) {
                continue;
            }
            SpessaLog.info(
                "%cReplacing meaningful GM reset with GS!",
                ConsoleColors.info
            );
            events[index] = MIDIUtils.reset(gmReset.event.ticks, "gs");
            replacedEvents.add(gmReset.event);
        }
        // If the last reset was a replaced GM, then we are now in GS.
        if (
            this.lastReset !== undefined &&
            replacedEvents.has(this.lastReset)
        ) {
            this.system = "gs";
        }

        // Check for a reset and insert one, only if we have setups to apply after it.
        if (
            !this.addedReset &&
            // A cleared system never gets a replacement reset.
            this.midiParams?.system !== "clear" &&
            // An explicitly requested system always needs its reset.
            (this.midiParams?.system !== undefined ||
                // Effects need reset too
                (this.reverbParams && this.reverbParams !== "clear") ||
                (this.chorusParams && this.chorusParams !== "clear") ||
                (this.delayParams && this.delayParams !== "clear") ||
                (this.insertionParams && this.insertionParams !== "clear") ||
                // User drum as well
                this.userDrumSetParams?.size ||
                // Add only when we have changes, removing them does not warrant the need for a gs reset.
                [...this.channelChanges.values()].some(
                    (c) => c.patch && c.patch !== "clear"
                ))
        ) {
            // There's no reset, add it on the first track at index 0 (or 1 if track name is first)
            let index = 0;
            if (
                this.midi.tracks[0].events[0].statusByte ===
                MIDIMessageTypes.trackName
            ) {
                index++;
            }
            // Add the requested system or GS.
            const targetSystem = this.midiParams?.system ?? "gs";
            this.midi.tracks[0].addEvents(
                index,
                MIDIUtils.reset(0, targetSystem)
            );
            this.resetPosition.tr = 0;
            this.resetPosition.ev = index;
            this.system = targetSystem;
            SpessaLog.info(
                `%c${targetSystem} reset not detected. Adding it.`,
                ConsoleColors.info
            );
        }

        // Insert right after the last reset, so the setups survive all resets.
        const targetTicks = Math.max(0, this.midi.firstNoteOn, this.resetTicks);
        const targetTrack = this.midi.tracks[this.resetPosition.tr];
        const targetIndex = this.resetPosition.ev + 1;

        /*
        ---
        MIDI RESET
        Here is the code that inserts all parameters after a reset
        ---
         */
        SpessaLog.info(
            `%cInserting after reset detected on track %c${this.resetPosition.tr}%c on index %c${targetIndex}%c!`,
            ConsoleColors.recognized,
            ConsoleColors.value,
            ConsoleColors.recognized,
            ConsoleColors.value,
            ConsoleColors.recognized
        );

        // Add MIDI parameters
        for (const param of Object.keys(
            this.midiParams ?? {}
        ) as (keyof GlobalMIDIParameter)[]) {
            if (param === "system") continue;
            const value = this.midiParams?.[param];
            if (value === undefined || value === "clear") continue;
            targetTrack.addEvents(
                targetIndex,
                ...MIDIUtils.setGlobalMIDIParameter(
                    targetTicks,
                    this.system,
                    param,
                    value
                )
            );
        }

        // Add effects
        if (this.reverbParams && this.reverbParams !== "clear") {
            const p = this.reverbParams;
            targetTrack.addEvents(
                targetIndex,
                MIDIUtils.setGSReverbParameter(targetTicks, "level", p.level),
                MIDIUtils.setGSReverbParameter(
                    targetTicks,
                    "preLowpass",
                    p.preLowpass
                ),
                MIDIUtils.setGSReverbParameter(
                    targetTicks,
                    "character",
                    p.character
                ),
                MIDIUtils.setGSReverbParameter(targetTicks, "time", p.time),
                MIDIUtils.setGSReverbParameter(
                    targetTicks,
                    "delayFeedback",
                    p.delayFeedback
                ),
                MIDIUtils.setGSReverbParameter(
                    targetTicks,
                    "preDelayTime",
                    p.preDelayTime
                )
            );
        }
        if (this.chorusParams && this.chorusParams !== "clear") {
            const p = this.chorusParams;
            targetTrack.addEvents(
                targetIndex,
                MIDIUtils.setGSChorusParameter(targetTicks, "level", p.level),
                MIDIUtils.setGSChorusParameter(
                    targetTicks,
                    "preLowpass",
                    p.preLowpass
                ),
                MIDIUtils.setGSChorusParameter(
                    targetTicks,
                    "feedback",
                    p.feedback
                ),
                MIDIUtils.setGSChorusParameter(targetTicks, "delay", p.delay),
                MIDIUtils.setGSChorusParameter(targetTicks, "rate", p.rate),
                MIDIUtils.setGSChorusParameter(targetTicks, "depth", p.depth),
                MIDIUtils.setGSChorusParameter(
                    targetTicks,
                    "sendLevelToReverb",
                    p.sendLevelToReverb
                ),
                MIDIUtils.setGSChorusParameter(
                    targetTicks,
                    "sendLevelToDelay",
                    p.sendLevelToDelay
                )
            );
        }
        if (this.delayParams && this.delayParams !== "clear") {
            const p = this.delayParams;
            targetTrack.addEvents(
                targetIndex,
                MIDIUtils.setGSDelayParameter(targetTicks, "level", p.level),
                MIDIUtils.setGSDelayParameter(
                    targetTicks,
                    "preLowpass",
                    p.preLowpass
                ),
                MIDIUtils.setGSDelayParameter(
                    targetTicks,
                    "timeCenter",
                    p.timeCenter
                ),
                MIDIUtils.setGSDelayParameter(
                    targetTicks,
                    "timeRatioLeft",
                    p.timeRatioLeft
                ),
                MIDIUtils.setGSDelayParameter(
                    targetTicks,
                    "timeRatioRight",
                    p.timeRatioRight
                ),
                MIDIUtils.setGSDelayParameter(
                    targetTicks,
                    "levelCenter",
                    p.levelCenter
                ),
                MIDIUtils.setGSDelayParameter(
                    targetTicks,
                    "levelLeft",
                    p.levelLeft
                ),
                MIDIUtils.setGSDelayParameter(
                    targetTicks,
                    "levelRight",
                    p.levelRight
                ),
                MIDIUtils.setGSDelayParameter(
                    targetTicks,
                    "feedback",
                    p.feedback
                ),
                MIDIUtils.setGSDelayParameter(
                    targetTicks,
                    "sendLevelToReverb",
                    p.sendLevelToReverb
                )
            );
        }

        if (this.insertionParams && this.insertionParams !== "clear") {
            const p = this.insertionParams;
            // Params and sends are stored in one table (0-19: params, 20-22: sends)
            const sendNames = [
                "sendLevelToReverb",
                "sendLevelToChorus",
                "sendLevelToDelay"
            ] as const;
            const evs = new Array<MIDIMessage>();
            for (let param = 0; param < p.params.length; param++) {
                const value = p.params[param];
                if (value === 255) continue;
                if (param < 20) {
                    evs.push(
                        MIDIUtils.setInsertionParameter(
                            targetTicks,
                            param,
                            value
                        )
                    );
                } else {
                    evs.push(
                        MIDIUtils.setInsertionParameter(
                            targetTicks,
                            sendNames[param - 20],
                            value
                        )
                    );
                }
            }

            // This adds them in order
            targetTrack.addEvents(targetIndex, ...evs);

            // Last means that it will be first, so the order is:
            // Type
            // Params and sends
            targetTrack.addEvents(
                targetIndex,
                MIDIUtils.setInsertionParameter(targetTicks, "type", p.type)
            );
        }

        // User Drum parameters
        if (this.userDrumSetParams)
            for (const [drumSet, params] of this.userDrumSetParams) {
                if (params !== "clear") {
                    for (const [midiNote, noteParams] of params) {
                        // Note cleared
                        if (noteParams === "clear") continue;

                        for (const [param, value] of Object.entries(
                            noteParams
                        ) as {
                            [K in keyof UserDrumSetParameter]: [
                                K,
                                ClearableParameter<UserDrumSetParameter[K]>
                            ];
                        }[keyof UserDrumSetParameter][]) {
                            // Parameter cleared
                            if (value === "clear" || value === undefined)
                                continue;
                            targetTrack.addEvents(
                                targetIndex,
                                MIDIUtils.setUserDrumParameter(
                                    targetTicks,
                                    drumSet,
                                    midiNote,
                                    param,
                                    value
                                )
                            );
                        }
                    }
                }
            }

        this.midi.flush();
        SpessaLog.groupEnd();
    }
}
