import { SpessaLog } from "../../../utils/loggin";
import { ConsoleColors } from "../../../utils/other";
import type { MIDIMessage } from "../../midi_message";
import { MIDI_DRUM_CHANNEL } from "../../../synthesizer/audio_engine/synth_constants";
import type { MIDISystem } from "../../../soundbank/types";
import { MIDIControllers } from "../../enums";
import * as MIDIUtils from "../midi_utils";
import {
    DEFAULT_GS_DRUM_MAP,
    DEFAULT_XG_DRUM_MAP,
    MELODIC_MAP
} from "../sysex_data";
import type { MIDIEditor } from "./midi_editor";

/**
 * Handles a system reset in the file: deletes it when the system is cleared,
 * replaces it in place when another system is requested, then tracks it.
 * @param system The system the reset switches to.
 * @param e The reset event.
 */
export function handleReset(
    this: MIDIEditor,
    system: MIDISystem,
    e: MIDIMessage
) {
    const requested = this.midiParams?.system;
    if (requested === "clear") {
        // Delete every reset. The locked setup is inserted
        // Before the first note on without any reset.
        SpessaLog.info("%cSystem reset cleared, removing!", ConsoleColors.info);
        this.deleteCurrentEvent();
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
            this.midi.tracks[this.trackNum].events[
                this.eventIndexes[this.trackNum]
            ] = toTrack;
        }
        // Track with the newly replaced system.
        this.trackReset(requested, toTrack);
        return;
    }
    this.trackReset(system, e);
}

/**
 * Tracks a system reset: the system that the following setups are written for,
 * the pending reset (meaningful once notes follow it), and the channel state the reset clears.
 * @param system The system the reset switches to.
 * @param e The reset event (the replacement, if it was replaced).
 */
export function trackReset(
    this: MIDIEditor,
    system: MIDISystem,
    e: MIDIMessage
) {
    SpessaLog.info(
        `%c${system.toUpperCase()} system on detected`,
        ConsoleColors.info
    );
    // A GM reset with notes after it gets replaced with the fallback after the loop
    // (unless GM is requested), so the setups use the fallback already
    const effectiveSystem =
        system === "gm" && this.midiParams?.system === undefined
            ? this.gmReplacement
            : system;
    this.system = effectiveSystem;

    // A new reset makes the previous one meaningless.
    // If it is still present, then it means that that reset had no notes,
    // So it can be safely replaced.
    this.pendingReset = {
        event: e,
        track: this.trackNum,
        system
    };
    // A GM reset: if notes follow, it's meaningful
    // And gets pushed to gmResets on the first note
    // To be replaced with the fallback reset in apply().
    // Track it here.
    this.isPendingResetGM = system === "gm";

    // Reset NRPN (accuracy + prevent deletion before reset)
    // Reset tracked drum maps to defaults as well.
    const defaultMap =
        effectiveSystem === "xg" ? DEFAULT_XG_DRUM_MAP : DEFAULT_GS_DRUM_MAP;
    for (const ch of this.channelStatuses) {
        ch.param.reset();
        ch.pendingParam = undefined;
        ch.drumMap =
            ch.channel % 16 === MIDI_DRUM_CHANNEL ? defaultMap : MELODIC_MAP;
        ch.clearedParams = {
            selection: {
                [MIDIControllers.registeredParameterMSB]: true,
                [MIDIControllers.registeredParameterLSB]: true,
                [MIDIControllers.nonRegisteredParameterMSB]: true,
                [MIDIControllers.nonRegisteredParameterLSB]: true
            },
            data: true
        };
        // The reset sets the selection to null, both in the file and the output
        ch.selectionModified = {
            [MIDIControllers.registeredParameterMSB]: false,
            [MIDIControllers.registeredParameterLSB]: false,
            [MIDIControllers.nonRegisteredParameterMSB]: false,
            [MIDIControllers.nonRegisteredParameterLSB]: false
        };
        ch.outputRegistered = true;
        ch.currentFineTune = 0;
        ch.currentKeyShift = 0;
        // Do not reset noteShifts here, as they will be overwritten by note on when needed
        // Reset means that new "first notes" are here to have the setups inserted
        ch.isFirstNoteOn = true;
        ch.bankMSB = 0;
    }
}
