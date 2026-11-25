import { SpessaLog } from "../../../utils/loggin";
import { ConsoleColors } from "../../../utils/other";
import type { MIDIMessage } from "../../midi_message";
import { MIDI_DRUM_CHANNEL } from "../../../synthesizer/audio_engine/synth_constants";
import type { MIDISystem } from "../../../soundbank/types";
import * as MIDIUtils from "../midi_utils";
import {
    DEFAULT_GS_DRUM_MAP,
    DEFAULT_XG_DRUM_MAP,
    MELODIC_MAP
} from "../sysex_data";
import type { EditContext } from "./types";
import { deleteCurrentEvent } from "./delete_event";
import { clearedSelection, unmodifiedSelection } from "./channel_status";

/**
 * Handles a system reset in the file: deletes it when the system is cleared,
 * replaces it in place when another system is requested, then tracks it.
 * @param ctx The edit context.
 * @param system The system the reset switches to.
 * @param e The reset event.
 */
export function handleReset(
    ctx: EditContext,
    system: MIDISystem,
    e: MIDIMessage
) {
    const requested = ctx.options.midiParams?.system;
    if (requested === "clear") {
        // Delete every reset. The locked setup is inserted
        // Before the first note on without any reset.
        SpessaLog.info("%cSystem reset cleared, removing!", ConsoleColors.info);
        deleteCurrentEvent(ctx);
        // Do not track
        return;
    }
    if (requested !== undefined) {
        let toTrack = e;
        // Replace every reset with the desired one, in place.
        if (system !== requested) {
            SpessaLog.info(
                `%cReplacing ${system.toUpperCase()} reset with ${requested.toUpperCase()}!`,
                ConsoleColors.info
            );
            toTrack = MIDIUtils.reset(e.ticks, requested);
            ctx.cursor.replaceCurrent(toTrack);
        }
        // Track with the newly replaced system.
        trackReset(ctx, requested, toTrack);
        return;
    }
    trackReset(ctx, system, e);
}

/**
 * Tracks a system reset: the system that the following setups are written for,
 * the pending reset (meaningful once notes follow it), and the channel state the reset clears.
 * @param ctx The edit context.
 * @param system The system the reset switches to.
 * @param e The reset event (the replacement, if it was replaced).
 */
export function trackReset(
    ctx: EditContext,
    system: MIDISystem,
    e: MIDIMessage
) {
    SpessaLog.info(
        `%c${system.toUpperCase()} system on detected`,
        ConsoleColors.info
    );
    // A GM reset with notes after it gets replaced with the fallback after the loop,
    // So the setups use the fallback already.
    // A GM reset followed by another reset before any note stays GM in the file,
    // So the SysEx between the two is handled as if the synth were in the fallback system.
    // We keep it that way because nothing between them can be heard: GM ignores GS and XG SysEx,
    // There are no notes, and the next reset clears the controllers, effects, user drums and the tracked state.
    const effectiveSystem =
        system === "gm" ? ctx.options.gmReplacement : system;
    ctx.system = effectiveSystem;

    // A new reset makes the previous one meaningless.
    // If it is still present, then it means that that reset had no notes,
    // So it can be safely replaced.
    ctx.resets.pending = {
        event: e,
        track: ctx.cursor.track,
        system
    };
    // A GM reset: if notes follow, it's meaningful
    // And gets pushed to the GM resets on the first note
    // To be replaced with the fallback reset in apply().
    // Track it here.
    ctx.resets.isPendingGM = system === "gm";

    // Reset NRPN (accuracy + prevent deletion before reset)
    // Reset tracked drum maps to defaults as well.
    const defaultMap =
        effectiveSystem === "xg" ? DEFAULT_XG_DRUM_MAP : DEFAULT_GS_DRUM_MAP;
    for (const ch of ctx.channels) {
        ch.param.reset();
        ch.pendingParam = undefined;
        ch.drumMap =
            ch.channel % 16 === MIDI_DRUM_CHANNEL ? defaultMap : MELODIC_MAP;
        ch.clearedParams = {
            selection: clearedSelection(),
            data: true
        };
        // The reset sets the selection to null, both in the file and the output
        ch.selectionModified = unmodifiedSelection();
        ch.outputRegistered = true;
        ch.currentFineTune = 0;
        ch.currentKeyShift = 0;
        // Do not reset noteShifts here, as they will be overwritten by note on when needed
        // Reset means that new "first notes" are here to have the setups inserted
        ch.isFirstNoteOn = true;
        ch.bankMSB = 0;
    }
}
