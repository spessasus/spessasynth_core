import { SpessaLog } from "../../../utils/loggin";
import { ConsoleColors } from "../../../utils/other";
import { DEFAULT_SYNTH_MODE } from "../../../synthesizer/audio_engine/synth_constants";
import type { BasicMIDI } from "../../basic_midi";
import * as MIDIUtils from "../midi_utils";
import { PortTracker } from "../port_tracker";
import type { EditContext, ModifyMIDIOptions, ResetPosition } from "./types";
import { EventCursor } from "./event_cursor";
import { handleEvent } from "./handle_event";
import { trackInsertedSelection } from "./controller_change";
import { generateSetup } from "./generate_setup";
import { parseEditOptions } from "./edit_options";
import { createChannelStatus } from "./channel_status";
import { addMissingReset, firstTrackIndexAt } from "./missing_reset";

/**
 * A single-use class for editing a MIDI file.
 * It parses the options and runs the steps of {@link apply},
 * the event handlers are plain functions that get the {@link EditContext}.
 * @internal
 */
export class MIDIEditor {
    private readonly midi;
    /**
     * The state shared by all the event handlers.
     */
    private readonly ctx: EditContext;

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
        const options = parseEditOptions(opts);

        // The channel offsets come from the file (BasicMIDI.portChannelOffsetMap), like in the sequencer.
        // Always at least 16 channels, even if the file has no notes
        const channelCount = 16 + Math.max(...midi.portChannelOffsetMap);
        const channelStatuses = Array.from({ length: channelCount }, (_, i) =>
            createChannelStatus(i, options.channelChanges.get(i))
        );

        const ports = new PortTracker(midi);
        const cursor = new EventCursor(
            midi,
            // Keep the cached N/RPN indexes of every channel valid
            (track, index) => {
                for (const channelStatus of channelStatuses) {
                    channelStatus.param.deleteEvent(track, index);
                }
            },
            (e, track) =>
                trackInsertedSelection(ports, channelStatuses, e, track)
        );

        this.ctx = {
            cursor,
            options,
            channels: channelStatuses,
            ports,
            resets: {
                meaningful: new Array<ResetPosition>(),
                gm: new Array<ResetPosition>(),
                pending: undefined,
                isPendingGM: false,
                sawNote: false
            },
            // Before the first reset, the synth is in its default mode (GS), so the editor assumes it too.
            // A reset added by the editor comes before everything,
            // So this matters for notes before the file's own first reset and for a cleared system.
            system: DEFAULT_SYNTH_MODE
        };
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
        const { options, resets } = this.ctx;
        const requestedSystem = options.midiParams?.system;

        // Step 1: add a missing reset
        addMissingReset(this.midi, options);

        // Step 2: go through all events one by one and perform the initial edit
        this.midi.iterate((e, track, eventIndexes) =>
            handleEvent(this.ctx, e, track, eventIndexes)
        );

        // Step 3: a file without notes (a setup file) gets the setup after its last reset.
        // A GM one is handled like a meaningful GM reset,
        // The synth ignores GS and XG setups in GM mode.
        //
        // Note:
        // GM always gets replaced. Even when the setup only has things GM can carry,
        // As this approach is simpler and GS acts like GM with no special messages.
        if (!resets.sawNote && resets.pending !== undefined) {
            if (resets.isPendingGM) resets.gm.push(resets.pending);
            else resets.meaningful.push(resets.pending);
            resets.pending = undefined;
        }

        // Step 4: the meaningful GM resets.
        // With GM requested they stay GM and only get the setup after them,
        // Otherwise they are replaced in place with the GM replacement.
        for (const gmReset of resets.gm) {
            if (requestedSystem === "gm") {
                resets.meaningful.push({ ...gmReset, system: "gm" });
                continue;
            }
            const events = this.midi.tracks[gmReset.track].events;
            const index = events.indexOf(gmReset.event);
            if (index === -1) continue;
            const fallback = options.gmReplacement;
            SpessaLog.info(
                `%cReplacing meaningful GM reset with ${fallback.toUpperCase()}!`,
                ConsoleColors.info
            );
            const replaced = MIDIUtils.reset(gmReset.event.ticks, fallback);
            events[index] = replaced;
            resets.meaningful.push({
                event: replaced,
                track: gmReset.track,
                system: fallback
            });
        }

        // Step 5: cleared system. Every reset was deleted, so there is nothing to add the setup to.
        // Insert the locked setup once on the first track instead, right before the first note.
        if (requestedSystem === "clear") {
            const targetTicks = Math.max(0, this.midi.firstNoteOn);
            const output = generateSetup(options, targetTicks, this.ctx.system);
            if (output.length > 0) {
                const index = firstTrackIndexAt(this.midi, targetTicks);
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
        for (const reset of resets.meaningful) {
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
                ...generateSetup(options, reset.event.ticks, reset.system)
            );
        }

        this.midi.flush();
        SpessaLog.groupEnd();
    }
}
