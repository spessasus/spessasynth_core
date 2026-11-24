import { SpessaLog } from "../../../utils/loggin";
import { ConsoleColors } from "../../../utils/other";
import type { MIDIMessage } from "../../midi_message";
import {
    DEFAULT_SYNTH_MODE,
    MIDI_DRUM_CHANNEL
} from "../../../synthesizer/audio_engine/synth_constants";
import type { BasicMIDI } from "../../basic_midi";
import { MIDIControllers, MIDIMessageTypes } from "../../enums";
import * as MIDIUtils from "../midi_utils";
import { PortTracker } from "../port_tracker";
import { ParameterTracker } from "../parameter_tracker";
import { DEFAULT_GS_DRUM_MAP, MELODIC_MAP } from "../sysex_data";
import type {
    ChannelModification,
    ModifyMIDIOptions,
    ChannelStatus,
    ResetPosition
} from "./types";
import { handleEvent } from "./handle_event";
import {
    handleChannelMIDIParam,
    isUserDrumLocked,
    shouldClearChannelDrum,
    shouldClearMapDrum,
    handleControllerChange,
    handleResetAllControllers
} from "./controller_change";
import { firstNoteOn, trackXGDrumSetup } from "./first_note_on";
import { handleReset, trackReset } from "./reset";
import { generateSetup } from "./generate_setup";

/**
 * A single-use class for editing a MIDI file.
 * @internal
 */
export class MIDIEditor {
    protected readonly midi;
    protected readonly channelChanges = new Map<number, ChannelModification>();
    protected system;
    protected readonly channelStatuses = new Array<ChannelStatus>();
    /**
     * Follows the MIDI port of each track, like the sequencer
     */
    protected readonly ports;
    /**
     * If the current event is an N/RPN event,
     * this is set, otherwise -1.
     */
    protected currentParameterChannel = -1;

    /**
     * Track only channels to clear
     */
    protected readonly clearedChannels = new Set<number>();

    /**
     * All resets which will have a setup inserted after them.
     * A reset is defined as meaningful only if:
     * - It has notes coming after it.
     * - It is the last reset of a file without notes (such file is defined as a setup file, the state it leaves is the one that matters).
     * For example, many MIDIs do:
     *
     * GM -> GS -> note data
     *
     * That GM reset is meaningless, so it can stay unmodified as the actual reset that matters is GS.
     * Meaningful GM ones are replaced with the fallback reset in-place
     * (unless the `system` parameter is explicitly set).
     */
    protected readonly meaningfulResets = new Array<ResetPosition>();
    /**
     * Meaningful GM resets found during the main loop (see {@link meaningfulResets}).
     * They are replaced with the GM replacement in place, unless GM is requested,
     * then they stay GM and only get the setup after them.
     */
    protected readonly gmResets = new Array<ResetPosition>();
    /**
     * The most recent reset, still awaiting notes.
     * Discarded as meaningless whenever another reset is encountered.
     * Removed and added to meaningful resets if a note is encountered.
     */
    protected pendingReset: ResetPosition | undefined = undefined;
    /**
     * If the current pending reset is GM.
     * This is used to track meaningful GM resets for replacements
     */
    protected isPendingResetGM = false;
    /**
     * If the main loop has seen a note on (velocity above 0) anywhere in the file so far.
     * A file without notes (a setup file) keeps its last pending reset as meaningful after the loop.
     */
    protected sawNote = false;
    /**
     * If new GS effect settings are requested.
     */
    protected readonly hasGSEffects;
    /**
     * If new XG effect settings are requested.
     */
    protected readonly hasXGEffects;
    /**
     * The system replacing meaningful GM resets, when GM is not requested.
     */
    protected readonly gmReplacement;

    /**
     * If the current event has already been deleted.
     */
    protected currentEventDeleted = false;

    protected readonly gsReverbParams;
    protected readonly gsChorusParams;
    protected readonly gsDelayParams;
    protected readonly gsEqualizerParams;
    protected readonly gsInsertionParams;

    protected readonly xgReverbParams;
    protected readonly xgChorusParams;
    protected readonly xgVariationParams;
    protected readonly xgInsertionParams;

    protected readonly userDrumSetParams;
    protected readonly midiParams;
    protected readonly fallbackReset;
    /**
     * Current, for handleEvent
     */
    protected trackNum = 0;

    /**
     * Current, for handleEvent
     */
    protected eventIndexes = [0];

    protected readonly handleEvent = handleEvent.bind(this);
    protected readonly handleChannelMIDIParam =
        handleChannelMIDIParam.bind(this);
    protected readonly isUserDrumLocked = isUserDrumLocked.bind(this);
    protected readonly shouldClearChannelDrum =
        shouldClearChannelDrum.bind(this);
    protected readonly shouldClearMapDrum = shouldClearMapDrum.bind(this);
    protected readonly handleControllerChange =
        handleControllerChange.bind(this);
    protected readonly handleResetAllControllers =
        handleResetAllControllers.bind(this);
    protected readonly firstNoteOn = firstNoteOn.bind(this);
    protected readonly trackXGDrumSetup = trackXGDrumSetup.bind(this);
    protected readonly handleReset = handleReset.bind(this);
    protected readonly trackReset = trackReset.bind(this);
    protected readonly generateSetup = generateSetup.bind(this);

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
            gsReverbParams,
            gsChorusParams,
            gsDelayParams,
            gsEqualizerParams,
            gsInsertionParams,
            xgReverbParams,
            xgChorusParams,
            xgVariationParams,
            xgInsertionParams,
            userDrumParams,
            midiParams
        } = opts;

        // Save options
        this.gsReverbParams = gsReverbParams;
        this.gsChorusParams = gsChorusParams;
        this.gsDelayParams = gsDelayParams;
        this.gsEqualizerParams = gsEqualizerParams;
        this.gsInsertionParams = gsInsertionParams;

        this.xgReverbParams = xgReverbParams;
        this.xgChorusParams = xgChorusParams;
        this.xgVariationParams = xgVariationParams;
        this.xgInsertionParams = xgInsertionParams;

        this.userDrumSetParams = userDrumParams;
        this.midiParams = midiParams;
        this.fallbackReset = opts.fallbackReset;

        // Track only channels to change here
        if (channels) {
            for (const [channel, ch] of channels) {
                if (ch === "clear") this.clearedChannels.add(channel);
                else this.channelChanges.set(channel, ch);
            }
        }

        this.hasXGEffects =
            (Boolean(this.xgReverbParams) && this.xgReverbParams !== "clear") ||
            (Boolean(this.xgChorusParams) && this.xgChorusParams !== "clear") ||
            (Boolean(this.xgVariationParams) &&
                this.xgVariationParams !== "clear") ||
            [...(this.xgInsertionParams?.values() ?? [])].some(
                (p) => p !== "clear"
            );
        this.hasGSEffects =
            (Boolean(this.gsReverbParams) && this.gsReverbParams !== "clear") ||
            (Boolean(this.gsChorusParams) && this.gsChorusParams !== "clear") ||
            (Boolean(this.gsDelayParams) && this.gsDelayParams !== "clear") ||
            (Boolean(this.gsEqualizerParams) &&
                this.gsEqualizerParams !== "clear") ||
            (Boolean(this.gsInsertionParams) &&
                this.gsInsertionParams !== "clear");

        // Are only xg changes requested?
        const xgOnly = this.hasXGEffects && !this.hasGSEffects;
        // A meaningful GM reset gets replaced (unless GM is requested).
        // XG when only XG setups are requested, otherwise they would never be written
        this.gmReplacement = this.fallbackReset ?? (xgOnly ? "xg" : "gs");

        // Before the first reset, the synth is in its default mode (GS), so the editor assumes it too.
        // A reset added by the editor comes before everything (see apply()),
        // So this matters for notes before the file's own first reset and for a cleared system.
        this.system = DEFAULT_SYNTH_MODE;

        this.ports = new PortTracker(midi);

        // The channel offsets come from the file (BasicMIDI.portChannelOffsetMap), like in the sequencer.
        // Always at least 16 channels, even if the file has no notes
        const channelCount = 16 + Math.max(...midi.portChannelOffsetMap);
        while (this.channelStatuses.length < channelCount) {
            const i = this.channelStatuses.length;
            this.channelStatuses.push({
                channel: i,
                isFirstNoteOn: true,
                // The default drum map before the first reset (GS, like the synth)
                drumMap:
                    i % 16 === MIDI_DRUM_CHANNEL
                        ? DEFAULT_GS_DRUM_MAP
                        : MELODIC_MAP,
                param: new ParameterTracker(i),
                clearedParams: {
                    selection: {
                        [MIDIControllers.registeredParameterMSB]: true,
                        [MIDIControllers.registeredParameterLSB]: true,
                        [MIDIControllers.nonRegisteredParameterMSB]: true,
                        [MIDIControllers.nonRegisteredParameterLSB]: true
                    },
                    data: true
                },
                selectionModified: {
                    [MIDIControllers.registeredParameterMSB]: false,
                    [MIDIControllers.registeredParameterLSB]: false,
                    [MIDIControllers.nonRegisteredParameterMSB]: false,
                    [MIDIControllers.nonRegisteredParameterLSB]: false
                },
                outputRegistered: true,
                relativeKeyShift: this.channelChanges.get(i)?.keyShift ?? 0,
                relativeFineTune: this.channelChanges.get(i)?.fineTune ?? 0,
                currentFineTune: 0,
                currentKeyShift: 0,
                noteShifts: new Int16Array(128),
                pendingParam: undefined,
                bankMSB: 0
            });
        }
    }

    /**
     * Applies the edit to the file, in these steps:
     * 1. Add a reset at the start if the setup needs one and the file has none that will be kept.
     * 2. The main loop ({@link handleEvent}) edits every event and collects the meaningful resets.
     * 3. A file without notes keeps its last reset as meaningful.
     * 4. Meaningful GM resets are replaced (or kept if GM is requested).
     * 5. A cleared system has no resets left, so the setup goes in once on the first track.
     * 6. The setup goes in after every meaningful reset.
     */
    public apply() {
        // A file without tracks has nothing to edit
        if (this.midi.tracks.length === 0) {
            SpessaLog.groupEnd();
            return;
        }
        const requestedSystem = this.midiParams?.system;

        // Step 1: add a missing reset.
        // It goes in before the main loop, so the loop treats it like the file's own:
        // The channel setups after it are written for its system,
        // And the first note makes it meaningful, so the global setup goes after it.
        const needsReset =
            // A cleared system never gets a replacement reset.
            requestedSystem !== "clear" &&
            // An explicitly requested system always needs its reset.
            (requestedSystem !== undefined ||
                this.fallbackReset !== undefined ||
                // Locked global parameters are written in the setup after a reset
                Object.entries(this.midiParams ?? {}).some(
                    ([param, v]) =>
                        param !== "system" && v !== undefined && v !== "clear"
                ) ||
                // Effects need reset too
                this.hasGSEffects ||
                this.hasXGEffects ||
                // User drum as well, only if something is set (removing needs no reset)
                [...(this.userDrumSetParams?.values() ?? [])].some(
                    (set) =>
                        set !== "clear" &&
                        [...set.values()].some(
                            (note) =>
                                note !== "clear" &&
                                // PitchFine is not a thing in GS, it's never written
                                Object.entries(note).some(
                                    ([param, v]) =>
                                        param !== "pitchFine" &&
                                        v !== undefined &&
                                        v !== "clear"
                                )
                        )
                ) ||
                // Add only when we have changes, removing them does not warrant the need for a gs reset.
                [...this.channelChanges.values()].some(
                    (c) => c.patch && c.patch !== "clear"
                ));
        if (needsReset) {
            // Look for a reset that the main loop keeps, using the main loop's rules:
            // - A reset followed by a note on (a meaningful reset),
            // - Or any reset in a file without notes (a setup file keeps its last reset).
            // Notes on cleared channels don't count, they get deleted.
            // To know a note's channel, the track ports are followed like the main loop does.
            const ports = new PortTracker(this.midi);
            let sawReset = false;
            let sawNote = false;
            let meaningful = false;
            // Not the timeline: the main loop iterates the live tracks, so this must too
            this.midi.iterate((e, track) => {
                // Done once a meaningful reset is found, port events only move their track
                if (meaningful || ports.update(e, track)) return;
                // The sequencer applies resets from any port, notes only play on ports that have notes
                const portOffset = ports.offset(track);
                if (
                    e.statusByte === MIDIMessageTypes.systemExclusive &&
                    MIDIUtils.analyzeSysEx(e.data).some(
                        (r) =>
                            r.type === "Global MIDI Param" &&
                            r.parameter === "system"
                    )
                ) {
                    sawReset = true;
                } else if (
                    portOffset !== undefined &&
                    (e.statusByte & 0xf0) === MIDIMessageTypes.noteOn &&
                    e.data[1] > 0 &&
                    !this.clearedChannels.has((e.statusByte & 0xf) + portOffset)
                ) {
                    sawNote = true;
                    // A reset followed by a note on
                    meaningful = sawReset;
                }
            });
            // A meaningful reset or a setup file is kept, so no reset gets added
            const hasKeptReset = meaningful || (sawReset && !sawNote);
            if (!hasKeptReset) {
                // A requested system, or the GM replacement (the fallback, XG for XG-only effects, otherwise GS)
                const system = requestedSystem ?? this.gmReplacement;
                this.midi.tracks[0].addEvents(
                    this.firstTrackIndexAt(0),
                    MIDIUtils.reset(0, system)
                );
                SpessaLog.info(
                    `%c${system} reset not detected. Adding it.`,
                    ConsoleColors.info
                );
            }
        }

        // Step 2: go through all events one by one and perform the initial edit
        this.midi.iterate(this.handleEvent);

        // Step 3: a file without notes (a setup file) gets the setup after its last reset.
        // A GM one is handled like a meaningful GM reset,
        // The synth ignores GS and XG setups in GM mode.
        //
        // Note:
        // GM always gets replaced. Even when the setup only has things GM can carry,
        // As this approach is simpler and GS acts like GM with no special messages.
        if (!this.sawNote && this.pendingReset !== undefined) {
            if (this.isPendingResetGM) this.gmResets.push(this.pendingReset);
            else this.meaningfulResets.push(this.pendingReset);
            this.pendingReset = undefined;
        }

        // Step 4: the meaningful GM resets.
        // With GM requested they stay GM and only get the setup after them,
        // Otherwise they are replaced in place with the GM replacement.
        for (const gmReset of this.gmResets) {
            if (requestedSystem === "gm") {
                this.meaningfulResets.push({ ...gmReset, system: "gm" });
                continue;
            }
            const events = this.midi.tracks[gmReset.track].events;
            const index = events.indexOf(gmReset.event);
            if (index === -1) continue;
            const fallback = this.gmReplacement;
            SpessaLog.info(
                `%cReplacing meaningful GM reset with ${fallback.toUpperCase()}!`,
                ConsoleColors.info
            );
            const replaced = MIDIUtils.reset(gmReset.event.ticks, fallback);
            events[index] = replaced;
            this.meaningfulResets.push({
                event: replaced,
                track: gmReset.track,
                system: fallback
            });
        }

        // Step 5: cleared system. Every reset was deleted, so there is nothing to add the setup to.
        // Insert the locked setup once on the first track instead, right before the first note.
        if (requestedSystem === "clear") {
            const targetTicks = Math.max(0, this.midi.firstNoteOn);
            const output = this.generateSetup(targetTicks, this.system);
            if (output.length > 0) {
                const index = this.firstTrackIndexAt(targetTicks);
                SpessaLog.info(
                    `%cInserting setup without a reset on track %c0%c on index %c${index}%c!`,
                    ConsoleColors.recognized,
                    ConsoleColors.value,
                    ConsoleColors.recognized,
                    ConsoleColors.value,
                    ConsoleColors.recognized
                );
                this.midi.tracks[0].addEvents(index, ...output);
            }
        }

        // Step 6: the setup after every meaningful reset
        for (const reset of this.meaningfulResets) {
            const index = this.midi.tracks[reset.track].events.indexOf(
                reset.event
            );
            SpessaLog.info(
                `%cInserting after reset detected on track %c${reset.track}%c on index %c${index}%c!`,
                ConsoleColors.recognized,
                ConsoleColors.value,
                ConsoleColors.recognized,
                ConsoleColors.value,
                ConsoleColors.recognized
            );
            this.midi.tracks[reset.track].addEvents(
                index + 1,
                ...this.generateSetup(reset.event.ticks, reset.system)
            );
        }

        this.midi.flush();
        SpessaLog.groupEnd();
    }

    /**
     * Finds where an inserted reset or setup goes on the first track:
     * after everything before the tick and the meta events at it,
     * so it comes before the first voice message or SysEx at that tick and the track stays sorted.
     * @param ticks The tick of the inserted events.
     * @returns The index to insert at.
     */
    protected firstTrackIndexAt(ticks: number) {
        const events = this.midi.tracks[0].events;
        let index = 0;
        while (
            index < events.length &&
            (events[index].ticks < ticks ||
                (events[index].ticks === ticks &&
                    events[index].statusByte < MIDIMessageTypes.noteOff))
        )
            index++;
        return index;
    }

    /**
     * This function adds the events before the current one IN ORDER they are in the array,
     * So the first event in the array will end up as the first one before the current event.
     * @param events
     */
    protected addEventsBefore(...events: MIDIMessage[]) {
        const track = this.trackNum;
        // After deleting the current event, the index points at the event before it,
        // So the current event's place is one further
        const offset = this.currentEventDeleted ? 1 : 0;
        for (const item of events) {
            this.midi.tracks[track].addEvents(
                this.eventIndexes[track] + offset,
                item
            );
            // Update event indexes
            this.eventIndexes[track]++;
            this.trackInsertedSelection(item);
        }
    }

    /**
     * This function adds the events after the current one IN ORDER they are in the array,
     * So the first event in the array will end up as the first one after the current event.
     * @param events
     */
    protected addEventsAfter(...events: MIDIMessage[]) {
        const track = this.trackNum;
        for (const item of events) {
            this.midi.tracks[track].addEvents(
                this.eventIndexes[track] + 1,
                item
            );
            // Update event indexes
            this.eventIndexes[track]++;
            this.trackInsertedSelection(item);
        }
    }

    /**
     * Tracks the N/RPN selection controllers inserted by the editor.
     * They change the output's selection, which may no longer match what the file selected.
     * Testcase: midi_editor_nrpn_test.ts (Case: inserted RPN before a file's LSB-only NRPN)
     * @param e The inserted event.
     */
    protected trackInsertedSelection(e: MIDIMessage) {
        if ((e.statusByte & 0xf0) !== MIDIMessageTypes.controllerChange) return;
        const cc = e.data[0];
        if (
            // eslint-disable-next-line unicorn/prefer-includes-over-repeated-comparisons -- the comparisons narrow cc to ParameterCC
            cc !== MIDIControllers.registeredParameterMSB &&
            cc !== MIDIControllers.registeredParameterLSB &&
            cc !== MIDIControllers.nonRegisteredParameterMSB &&
            cc !== MIDIControllers.nonRegisteredParameterLSB
        )
            return;
        const portOffset =
            this.ports.offset(this.trackNum) ?? this.channelStatuses.length;
        const ch = this.channelStatuses[(e.statusByte & 0xf) + portOffset];
        if (!ch) return;
        ch.selectionModified[cc] =
            e.data[1] !== ch.param.getParameterSelect(cc).v;
        ch.outputRegistered =
            cc === MIDIControllers.registeredParameterMSB ||
            cc === MIDIControllers.registeredParameterLSB;
    }

    /**
     * Deletes this event, or parameter.
     */
    protected deleteThisEvent() {
        if (this.currentEventDeleted) return;
        this.currentEventDeleted = true;
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
     */
    protected deleteTrackEvent(track: number, index: number) {
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
    }

    protected deleteCurrentEvent() {
        if (this.currentParameterChannel !== -1) {
            this.deleteCurrentParameter();
            return;
        }
        this.deleteThisEvent();
    }

    protected deleteCurrentParameter() {
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
        const [msbCC, lsbCC] = p.paramControllers;
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
        // The output no longer has them, but a later kept data entry may still rely on them.
        if (!ch.clearedParams.selection[msbCC]) {
            // Delete param MSB
            this.deleteTrackEvent(msb.track, msb.event);
            ch.selectionModified[msbCC] = true;

            // Flag MSB as deleted
            ch.clearedParams.selection[msbCC] = true;

            SpessaLog.info(
                `%cClearing Non/Registered Parameter on %c${ch.channel}%c. (Param MSB)`,
                ConsoleColors.info,
                ConsoleColors.recognized,
                ConsoleColors.info
            );
        }

        if (ch.clearedParams.selection[lsbCC]) {
            return;
        }

        // Delete param LSB
        this.deleteTrackEvent(lsb.track, lsb.event);
        ch.selectionModified[lsbCC] = true;

        // Flag LSB as deleted
        ch.clearedParams.selection[lsbCC] = true;

        SpessaLog.info(
            `%cClearing Non/Registered Parameter on %c${ch.channel}%c. (Param LSB)`,
            ConsoleColors.info,
            ConsoleColors.recognized,
            ConsoleColors.info
        );
    }
}
