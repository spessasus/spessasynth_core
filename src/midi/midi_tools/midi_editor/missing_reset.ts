import { SpessaLog } from "../../../utils/loggin";
import { ConsoleColors } from "../../../utils/other";
import type { BasicMIDI } from "../../basic_midi";
import { MIDIMessageTypes } from "../../enums";
import * as MIDIUtils from "../midi_utils";
import { PortTracker } from "../port_tracker";
import type { EditOptions } from "./types";

/**
 * Adds a reset at the start if the setup needs one and the file has none that will be kept.
 * It goes in before the main loop, so the loop treats it like the file's own:
 * The channel setups after it are written for its system,
 * And the first note makes it meaningful, so the global setup goes after it.
 * @param midi The file being edited.
 * @param options The edit options.
 */
export function addMissingReset(midi: BasicMIDI, options: EditOptions) {
    const requestedSystem = options.midiParams?.system;
    const needsReset =
        // A cleared system never gets a replacement reset.
        requestedSystem !== "clear" &&
        // An explicitly requested system always needs its reset.
        (requestedSystem !== undefined ||
            options.fallbackReset !== undefined ||
            // Locked global parameters are written in the setup after a reset
            Object.entries(options.midiParams ?? {}).some(
                ([param, v]) =>
                    param !== "system" && v !== undefined && v !== "clear"
            ) ||
            // Effects need reset too
            options.hasGSEffects ||
            options.hasXGEffects ||
            // User drum as well, only if something is set (removing needs no reset)
            [...(options.userDrumParams?.values() ?? [])].some(
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
            [...options.channelChanges.values()].some(
                (c) => c.patch && c.patch !== "clear"
            ));
    if (!needsReset) return;

    // Look for a reset that the main loop keeps, using the main loop's rules:
    // - A reset followed by a note on (a meaningful reset),
    // - Or any reset in a file without notes (a setup file keeps its last reset).
    // Notes on cleared channels don't count, they get deleted.
    // To know a note's channel, the track ports are followed like the main loop does.
    const ports = new PortTracker(midi);
    let sawReset = false;
    let sawNote = false;
    let meaningful = false;
    // Not the timeline: the main loop iterates the live tracks, so this must too
    midi.iterate((e, track) => {
        // Done once a meaningful reset is found, port events only move their track
        if (meaningful || ports.update(e, track)) return;
        // The sequencer applies resets from any port, notes only play on ports that have notes
        const portOffset = ports.offset(track);
        if (
            e.statusByte === MIDIMessageTypes.systemExclusive &&
            MIDIUtils.analyzeSysEx(e.data).some(
                (r) =>
                    r.type === "Global MIDI Param" && r.parameter === "system"
            )
        ) {
            sawReset = true;
        } else if (
            portOffset !== undefined &&
            (e.statusByte & 0xf0) === MIDIMessageTypes.noteOn &&
            e.data[1] > 0 &&
            !options.clearedChannels.has((e.statusByte & 0xf) + portOffset)
        ) {
            sawNote = true;
            // A reset followed by a note on
            meaningful = sawReset;
        }
    });
    // A meaningful reset or a setup file is kept, so no reset gets added
    const hasKeptReset = meaningful || (sawReset && !sawNote);
    if (hasKeptReset) return;
    // A requested system, or the GM replacement (the fallback, XG for XG-only effects, otherwise GS)
    const system = requestedSystem ?? options.gmReplacement;
    midi.tracks[0].addEvents(
        firstTrackIndexAt(midi, 0),
        MIDIUtils.reset(0, system)
    );
    SpessaLog.info(
        `%c${system} reset not detected. Adding it.`,
        ConsoleColors.info
    );
}

/**
 * Finds where an inserted reset or setup goes on the first track:
 * after everything before the tick and the meta events at it,
 * so it comes before the first voice message or SysEx at that tick and the track stays sorted.
 * @param midi The file being edited.
 * @param ticks The tick of the inserted events.
 * @returns The index to insert at.
 */
export function firstTrackIndexAt(midi: BasicMIDI, ticks: number) {
    const events = midi.tracks[0].events;
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
