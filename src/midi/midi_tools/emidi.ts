import { SpessaLog } from "../../utils/loggin";
import { ConsoleColors } from "../../utils/other";
import type { BasicMIDI } from "../basic_midi";
import { MIDIControllers, MIDIMessageTypes } from "../enums";
import type { MIDITrack } from "../midi_track";

/**
 * EMIDI (Apogee's Extended MIDI) marks each track with one or more Track
 * Designation Include and/or Exclude values, naming the synthesizers this
 * track may either be authored for, or may be excluded for playback on.
 * A song built for several synths carries one copy of its content per
 * target, so a player that ignores the designations plays every copy at once.
 *
 * Apogee's AudioLib numbers the cards (audiolib/_midi.h): 0 General MIDI,
 * 1 Roland Sound Canvas, 2 AWE32, 3 Wave Blaster, 4 Sound Blaster,
 * 5 Pro Audio Spectrum, 6 Sound Man 16, 7 Adlib, 8 Ensoniq Soundscape,
 * 9 Gravis Ultrasound, and 127 as the wildcard meaning every card. Note
 * that 0 is a card like any other, not a second wildcard.
 *
 * We play as card 0, General MIDI, which is the value eduke32 hardcodes.
 * The Sound Canvas is a different card, however GM-compatible it is in
 * practice: counting it as ours too would keep both halves of a Sound
 * Canvas / General MIDI pair and double the part.
 *
 * The two C++ implementations this was ported from — midi_processing
 * (https://github.com/kode54/midi_processing) and libmidi
 * (https://github.com/stuerp/libmidi) — instead keep the set {0, 1, 127}
 * and drop a track on its first designation outside it. That is wrong on
 * both counts, and drops tracks that should sound: Duke Nukem 3D's
 * ALFREDH.MID designates "GS Crystal" for cards 0, 2 and 9, so it plays
 * on ours, but they see card 2 and throw the track away.
 *
 * What AudioLib actually does, in _MIDI_InitEMIDI:
 *
 *   - a track carrying no designations at all plays;
 *   - CC 110 include: any one value naming our card carries the track,
 *     however many other cards it also names. Only if the first
 *     designation seen is not ours does the track drop, and a later
 *     matching one takes it back;
 *   - CC 111 exclude: any value naming our card, or the 127 wildcard,
 *     drops the track.
 */
const EMIDI_INCLUDE_DESIGNATIONS = new Set([0, 127]);
const EMIDI_EXCLUDE_DESIGNATIONS = new Set([0, 127]);

function isEMIDIEvent(statusByte: number, data: Uint8Array) {
    return (
        (statusByte & 0xf0) === MIDIMessageTypes.controllerChange &&
        data[0] >= MIDIControllers.undefinedCC112LSB &&
        data[0] <= MIDIControllers.undefinedCC119LSB
    );
}

function isTrackInclusion(statusByte: number, data: Uint8Array) {
    return (
        (statusByte & 0xf0) === MIDIMessageTypes.controllerChange &&
        data[0] === MIDIControllers.undefinedCC110LSB
    );
}

function isTrackExclusion(statusByte: number, data: Uint8Array) {
    return (
        (statusByte & 0xf0) === MIDIMessageTypes.controllerChange &&
        data[0] === MIDIControllers.undefinedCC111LSB
    );
}

/**
 * Check if any tracks pass EMIDI events. Gates off the filter.
 */
function isEMIDITrack(track: MIDITrack) {
    return track.events.some((e) => isEMIDIEvent(e.statusByte, e.data));
}

/**
 * A track plays unless its designations say otherwise: one inclusion naming
 * our card carries it, an exclusion naming our card drops it, and a track
 * with no designations at all is left alone.
 *
 * This walks the events in order rather than testing inclusions and
 * exclusions separately, because the two interact: an inclusion that names
 * us takes back a track an earlier exclusion dropped, and once any
 * inclusion has had its say a later one naming a different card can no
 * longer drop the track. Transcribed from _MIDI_InitEMIDI, whose
 * `IncludeFound` is the flag below. Only run this on EMIDI files.
 */
function isGMTrack(track: MIDITrack) {
    let include = true;
    let inclusionSeen = false;
    for (const e of track.events) {
        if (isTrackInclusion(e.statusByte, e.data)) {
            if (EMIDI_INCLUDE_DESIGNATIONS.has(e.data[1])) {
                inclusionSeen = true;
                include = true;
            } else if (!inclusionSeen) {
                inclusionSeen = true;
                include = false;
            }
        } else if (
            isTrackExclusion(e.statusByte, e.data) &&
            EMIDI_EXCLUDE_DESIGNATIONS.has(e.data[1])
        ) {
            include = false;
        }
    }
    return include;
}

/**
 * Removes the tracks that EMIDI either fails to designate for General
 * MIDI, or designates for exclusion by General MIDI.
 * @param midi the MIDI to filter, modified in-place.
 * @returns the number of tracks removed.
 */
export function removeEMIDINonGMTracksInternal(midi: BasicMIDI): number {
    if (!midi.tracks.some((t) => isEMIDITrack(t))) {
        return 0;
    }
    const kept = midi.tracks.filter((t) => isGMTrack(t));
    const removed = midi.tracks.length - kept.length;
    if (removed === 0) {
        return 0;
    }
    SpessaLog.info(
        `%cRemoved %c${removed}%c EMIDI tracks not meant for General MIDI devices.`,
        ConsoleColors.info,
        ConsoleColors.recognized,
        ConsoleColors.info
    );
    midi.tracks = kept;
    // Ports, the timeline and the loop points all derive from the track list.
    // Recompute them now that the list has changed.
    midi.flush();
    return removed;
}
