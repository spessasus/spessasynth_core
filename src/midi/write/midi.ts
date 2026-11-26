import type { BasicMIDI } from "../basic_midi";
import type { MIDITrack } from "../midi_track";
import { MIDIMessageTypes } from "../enums";
import { SpessaLog } from "../../utils/loggin";
import {
    MAX_VLQ,
    writeVariableLengthQuantity
} from "../../utils/byte_functions/variable_length_quantity";

/**
 * Writes the bytes of a track's events, or only counts them when there is no output.
 * @param track The track to write.
 * @param startTick The tick the track's delta times start from.
 * @param endTick The tick of the End of Track event.
 * @param out The output, undefined to only count the bytes.
 * @param offset Where in the output the track data starts.
 * @returns The number of bytes.
 */
function writeTrackData(
    track: MIDITrack,
    startTick: number,
    endTick: number,
    out: Uint8Array | undefined,
    offset: number
) {
    let index = offset;
    const put = (byte: number) => {
        if (out) out[index] = byte;
        index++;
    };
    const putVLQ = (value: number) => {
        for (const byte of writeVariableLengthQuantity(value)) put(byte);
    };
    const putData = (data: Uint8Array) => {
        if (out) out.set(data, index);
        index += data.length;
    };

    let currentTick = startTick;
    let runningByte: number | undefined;
    // Writes the delta time to a tick. A gap longer than the 4 byte maximum is split with empty text events,
    // So the timing stays exact (a reparse gets those events, a second write is then the same)
    const putDeltaTo = (tick: number) => {
        if (!Number.isFinite(tick)) {
            throw new RangeError(`Can not write an event at tick ${tick}.`);
        }
        let delta = Math.max(0, tick - currentTick);
        if (delta > MAX_VLQ) {
            const fillers = Math.ceil(delta / MAX_VLQ) - 1;
            // Each filler is the 4 byte delta and the empty text event (FF 01 00)
            if (out) {
                for (let f = 0; f < fillers; f++) {
                    putVLQ(MAX_VLQ);
                    put(0xff);
                    put(MIDIMessageTypes.text);
                    put(0);
                }
            } else {
                // Only counting, so a gap too big for a track is rejected before anything is written
                index += fillers * 7;
            }
            // Meta events cancel running status (RP-001)
            runningByte = undefined;
            delta -= fillers * MAX_VLQ;
        }
        putVLQ(delta);
        currentTick = Math.max(currentTick, tick);
    };
    for (const event of track.events) {
        // EndOfTrack is written once at the end, with its own tick.
        // A 0xFF status (System Reset) can't be stored in a file, there it starts a meta event
        if (
            event.statusByte === MIDIMessageTypes.endOfTrack ||
            event.statusByte === MIDIMessageTypes.reset
        )
            continue;
        // Ticks stored in MIDI are absolute, but SMF wants relative. Convert them here
        putDeltaTo(event.ticks);
        if (event.statusByte <= MIDIMessageTypes.sequenceSpecific) {
            // This is a meta-message
            // Syntax is FF<type><length><data>
            put(0xff);
            put(event.statusByte);
            putVLQ(event.data.length);
            putData(event.data);
            // RP-001:
            // Sysex events and meta-events cancel any running status which was in effect.
            runningByte = undefined;
        } else if (
            event.statusByte === MIDIMessageTypes.systemExclusive ||
            event.statusByte === MIDIMessageTypes.systemExclusiveEscape
        ) {
            // This is a system exclusive message (or an escape)
            // Syntax is F0<length><data> or F7<length><data>
            put(event.statusByte);
            putVLQ(event.data.length);
            putData(event.data);
            runningByte = undefined;
        } else if (event.statusByte >= MIDIMessageTypes.systemExclusive) {
            // System common and realtime messages always have their status byte.
            // RP-001: system common messages cancel running status, realtime ones leave it alone.
            // A MIDI file can't hold them, the reader takes no data after one (it would be a stray byte),
            // So their data (song position, song select) is left out
            put(event.statusByte);
            if (event.statusByte < MIDIMessageTypes.clock)
                runningByte = undefined;
        } else {
            // This is a midi message.
            // A data byte of 0x80 or higher (a broken value kept from the file) needs the status byte written,
            // Without it the reader would take that byte for the status
            if (
                runningByte !== event.statusByte ||
                event.data.some((b) => b >= 0x80)
            ) {
                runningByte = event.statusByte;
                put(event.statusByte);
            }
            putData(event.data);
        }
    }
    putDeltaTo(endTick);
    put(0xff);
    put(MIDIMessageTypes.endOfTrack);
    put(0);
    return index - offset;
}

/**
 * Exports the midi as a standard MIDI file
 * @param midi the MIDI to write
 */
export function writeMIDIInternal(midi: BasicMIDI): ArrayBuffer {
    // The sizes come first, so the whole file goes into one array.
    // Per track: the tick its delta times start from and its End of Track tick
    const startTicks = new Array<number>();
    const endTicks = new Array<number>();
    const sizes = new Array<number>();
    let fileSize = 14;
    for (let i = 0; i < midi.tracks.length; i++) {
        const events = midi.tracks[i].events;
        // Format 2 tracks play one after another and the reader adds the previous track's end to each,
        // So the delta times start from the previous track's end as stored. That keeps a track's leading silence,
        // Also when an earlier track moved later (the reader places each track after the one before it)
        let startTick = midi.format === 2 && i > 0 ? endTicks[i - 1] : 0;
        // A format 2 track that starts before the previous one ends (an edit made the previous track longer)
        // Starts right after it instead, as a whole, so its events keep their spacing.
        // The silence it had before its first event can't be kept, the file never stored where the track started
        if (events.length > 0 && events[0].ticks < startTick) {
            SpessaLog.warn(
                `Format 2 track ${i + 1} overlaps the track before it by ${startTick - events[0].ticks} ticks, it now starts right after it.`
            );
            startTick = events[0].ticks;
        }
        // The End of Track keeps its tick, the silence after the last note is part of the song
        const endTick = Math.max(startTick, events.at(-1)?.ticks ?? 0);
        startTicks.push(startTick);
        endTicks.push(endTick);
        const size = writeTrackData(
            midi.tracks[i],
            startTick,
            endTick,
            undefined,
            0
        );
        // The chunk size is 32 bits, a longer track (a gap of trillions of ticks) can't be written
        if (size > 0xff_ff_ff_ff) {
            throw new RangeError(
                `Track ${i + 1} is too long for a MIDI file (${size} bytes).`
            );
        }
        sizes.push(size);
        fileSize += 8 + size;
    }

    // The header stores both in 16 bits
    if (midi.tracks.length > 0xff_ff || midi.timeDivision > 0xff_ff) {
        throw new RangeError(
            `A MIDI file holds at most 65535 tracks and a time division of 65535, got ${midi.tracks.length} and ${midi.timeDivision}.`
        );
    }
    const out = new Uint8Array(fileSize);
    const view = new DataView(out.buffer);
    // Write header
    out.set([0x4d, 0x54, 0x68, 0x64], 0); // MThd
    view.setUint32(4, 6);
    view.setUint16(8, midi.format);
    view.setUint16(10, midi.tracks.length);
    view.setUint16(12, midi.timeDivision);

    // Write tracks
    let offset = 14;
    for (let i = 0; i < midi.tracks.length; i++) {
        out.set([0x4d, 0x54, 0x72, 0x6b], offset); // MTrk
        view.setUint32(offset + 4, sizes[i]);
        offset += 8;
        offset += writeTrackData(
            midi.tracks[i],
            startTicks[i],
            endTicks[i],
            out,
            offset
        );
    }
    return out.buffer;
}
