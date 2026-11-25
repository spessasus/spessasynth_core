// Assertion tests for reading and writing Standard MIDI Files, built from raw bytes (damaged files included).
// Usage: npx tsx tests/midi/smf_read_write_test.ts
import { BasicMIDI, type MIDIMessage, SpessaLog } from "../../src";

SpessaLog.setLogLevel(false, false, false);

let failed = 0;
function check(name: string, condition: boolean, detail = "") {
    if (condition) {
        console.info(`ok   ${name}`);
    } else {
        failed++;
        console.error(`FAIL ${name} ${detail}`);
    }
}

const u32 = (n: number) => [
    (n >>> 24) & 0xff,
    (n >> 16) & 0xff,
    (n >> 8) & 0xff,
    n & 0xff
];

// A file from track bodies. A declared size overrides the real length (a truncated file),
// And the header can promise more tracks than there are. Format 1, 96 ticks per quarter note
function smf(
    tracks: { body: number[]; declared?: number }[],
    trackCount = tracks.length
) {
    const bytes = [
        0x4d,
        0x54,
        0x68,
        0x64,
        ...u32(6),
        0,
        1,
        0,
        trackCount,
        0,
        96
    ];
    for (const t of tracks) {
        bytes.push(
            0x4d,
            0x54,
            0x72,
            0x6b,
            ...u32(t.declared ?? t.body.length),
            ...t.body
        );
    }
    return BasicMIDI.fromArrayBuffer(new Uint8Array(bytes).buffer);
}

// Every event except End of Track (the writer adds one to a track without it)
const events = (midi: BasicMIDI) =>
    midi.tracks.flatMap((t) => t.events).filter((e) => e.statusByte !== 0x2f);
const describe = (e: MIDIMessage) =>
    `${e.ticks}:${e.statusByte}:${[...e.data].join(",")}`;
const sane = (midi: BasicMIDI) =>
    midi.tracks.every((t) =>
        t.events.every(
            (e, i) =>
                e.statusByte !== undefined &&
                e.ticks >= 0 &&
                (i === 0 || e.ticks >= t.events[i - 1].ticks)
        )
    );

const END = [0x00, 0xff, 0x2f, 0x00];

// A truncated track: the chunk declares more bytes than the file has, and the last event is cut in the middle
{
    const body = [
        0x00, 0x90, 0x3c, 0x64, 0x60, 0x80, 0x3c, 0x40, 0x00, 0xf0, 0x81, 0x00,
        0x41
    ];
    const midi = smf([{ body, declared: 4000 }]);
    const evs = events(midi);
    check(
        "a truncated track keeps the complete events and drops the cut one",
        sane(midi) && evs.length === 2 && evs.every((e) => e.data.length <= 2),
        evs.map((e) => describe(e)).join(" ")
    );
    check(
        "a truncated track writes and reads back the same events",
        events(BasicMIDI.fromArrayBuffer(midi.writeMIDI()))
            .map((e) => describe(e))
            .join(" ") === evs.map((e) => describe(e)).join(" ")
    );
}

// A file cut inside its first track keeps that track instead of failing on the missing second one
{
    const body = [0x00, 0x90, 0x3c, 0x64, 0x60, 0x80, 0x3c];
    const midi = smf([{ body, declared: 40 }], 2);
    const evs = events(midi);
    check(
        "a file cut before its last track loads the tracks it has",
        sane(midi) && midi.tracks.length === 1 && evs.length === 2,
        evs.map((e) => describe(e)).join(" ")
    );
    check(
        "a cut voice message is kept with its missing data byte as 0",
        evs[1]?.statusByte === 0x80 &&
            evs[1].data[0] === 0x3c &&
            evs[1].data[1] === 0
    );
}

// A track cut after a meta type, inside a length or after a SysEx status adds no empty event (an empty tempo would be infinite)
{
    const cutLength = smf([
        { body: [0x00, 0x90, 0x3c, 0x64, 0x00, 0xff, 0x51, 0x80] }
    ]);
    check(
        "a track cut inside a meta length drops the event",
        events(cutLength).length === 1 &&
            cutLength.tempoChanges.every((t) => Number.isFinite(t.tempo))
    );
    // A damaged meta type that looks like a note on, with a length past the end
    const fakeVoice = smf([
        {
            body: [
                0x00, 0x90, 0x3c, 0x64, 0x00, 0xff, 0x90, 0x8f, 0xff, 0xff, 0x7f
            ]
        }
    ]);
    check(
        "a cut meta event with a voice-like type is dropped, not padded",
        events(fakeVoice).length === 1
    );
    // A cut pitch bend would bend everything down
    const bend = smf([{ body: [0x00, 0x90, 0x3c, 0x64, 0x60, 0xe0, 0x00] }]);
    check("a cut pitch bend is dropped", events(bend).length === 1);
    // Junk after the last track, shorter than a chunk header
    // The declared size leaves the last 3 bytes (a cut "MTr") outside the chunk
    const junk = smf(
        [
            {
                body: [0x00, 0x90, 0x3c, 0x64, ...END, 0x4d, 0x54, 0x72],
                declared: 8
            }
        ],
        2
    );
    check(
        "a few bytes after the last track don't fail the file",
        junk.tracks.length === 1
    );
    let threw = false;
    try {
        smf([], 1);
    } catch {
        threw = true;
    }
    check("a file that ends right after its header throws", threw);

    const tempo = smf([{ body: [0x00, 0x90, 0x3c, 0x64, 0x00, 0xff, 0x51] }]);
    const sysex = smf([{ body: [0x00, 0x90, 0x3c, 0x64, 0x00, 0xf0] }]);
    check(
        "a track cut inside a meta or SysEx event header drops it",
        events(tempo).length === 1 && events(sysex).length === 1,
        [...events(tempo), ...events(sysex)].map((e) => describe(e)).join(" ")
    );
}

// A track that ends right after a delta time has no event without a status byte
{
    const midi = smf([{ body: [0x00, 0x90, 0x3c, 0x64, 0x60] }]);
    check(
        "a track ending after a delta time adds no event",
        sane(midi) && events(midi).length === 1
    );
}

// A delta time longer than 4 bytes (a damaged file) doesn't make ticks negative or desync the reader
{
    const body = [
        0x00,
        0x90,
        0x3c,
        0x64,
        0x8f,
        0xff,
        0xff,
        0xff,
        0x7f,
        0xff,
        0x51,
        0x03,
        0x07,
        0xa1,
        0x20,
        0x10,
        0x80,
        0x3c,
        0x40,
        ...END
    ];
    const midi = smf([{ body }]);
    const evs = events(midi);
    check(
        "a 5 byte delta time keeps ticks positive and the following events intact",
        sane(midi) &&
            evs.length === 3 &&
            evs[1].statusByte === 0x51 &&
            evs[2].statusByte === 0x80 &&
            evs[1].ticks === 0x0f_ff_ff_ff,
        evs.map((e) => describe(e)).join(" ")
    );
}

// A SysEx length past the end of the track is dropped instead of reading the next track's bytes
{
    const body = [
        0x00, 0x90, 0x3c, 0x64, 0x00, 0xf0, 0xff, 0xff, 0xff, 0x7f, 0x41, 0x10
    ];
    const midi = smf([{ body }, { body: [0x00, 0x91, 0x3c, 0x64, ...END] }]);
    check(
        "a SysEx longer than its track is dropped and the next track still parses",
        sane(midi) &&
            midi.tracks[0].events.length === 1 &&
            (midi.tracks[1].events[0]?.statusByte as number) === 0x91,
        events(midi)
            .map((e) => describe(e))
            .join(" ")
    );
}

if (failed > 0) {
    console.error(`${failed} check(s) failed!`);
    process.exit(1);
}
console.info("smf_read_write_test: all checks passed!");
