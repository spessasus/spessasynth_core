/**
 * Tests the EMIDI non-General-MIDI track filter against a real EMIDI file.
 *
 * Duke Nukem 3D's ALFREDH.MID is the sharpest fixture available for the
 * inclusion side of the filter: a track designated for all cards (127), a
 * track designated for a list of cards that includes General MIDI but is
 * mostly other cards ("GS Crystal", CC 110 = 0/2/9), tracks designated only
 * for other cards, and an undesignated conductor track carrying the tempo
 * map.
 *
 * The expected verdicts are what Apogee's own AudioLib does, read out of
 * _MIDI_InitEMIDI in eduke32's midi.c:
 *
 *   - the player is EMIDI_GeneralMIDI (0); 127 is the all-cards wildcard
 *   - a track with no CC 110 at all starts included and stays included
 *   - CC 110 include: any single value naming our card carries the track,
 *     however many other cards it also names
 *   - CC 111 exclude: any value naming our card, or 127, drops the track
 *
 * The exclusion rule is NOT covered here. ALFREDH.MID does carry CC 111,
 * on four tracks, but every value names a card that is not ours (4/5/6/7
 * on "Tremelo", "PizzStrings" and "Glass", 1/3/8 on "GS Effects"), so no
 * exclusion fires and the expected verdicts below would be unchanged if
 * the rule were dropped altogether. That holds for every EMIDI file to
 * hand: across the 32 in this collection, CC 111 only ever names cards
 * 1 through 9, never card 0 and never the 127 wildcard. A fixture that
 * exercises exclusion still needs finding.
 *
 * Usage:
 *   tsx tests/midi/emidi_filter_test.ts [midi path]
 *
 * Defaults to tests/files/ALFREDH.MID. That file is Duke Nukem 3D game
 * content and is not redistributable, so it is not in the repo — drop your
 * own copy into tests/files/, which is ignored.
 */

import { BasicMIDI } from "../../src";
import { MIDIControllers, MIDIMessageTypes } from "../../src/midi/enums";
import type { MIDITrack } from "../../src/midi/midi_track";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const DEFAULT_MIDI = path.join(
    import.meta.dirname,
    "..",
    "files",
    "ALFREDH.MID"
);

/**
 * The tracks of ALFREDH.MID that AudioLib plays, by their index in the
 * unfiltered file. Track 0 is the unnamed conductor track: it carries no
 * designation, so it is included by default — and it holds the tempo map,
 * the time signatures and the markers.
 */
const ALFREDH_EXPECTED_KEPT = [0, 1, 3, 6, 7, 9, 10, 11, 13, 14];

function ccValues(track: MIDITrack, controller: number): number[] {
    const values = track.events
        .filter(
            (e) =>
                (e.statusByte & 0xf0) === MIDIMessageTypes.controllerChange &&
                e.data[0] === controller
        )
        .map((e) => e.data[1]);
    return [...new Set(values)];
}

const midPath = process.argv[2] ?? DEFAULT_MIDI;

let file: Buffer;
try {
    file = await fs.readFile(midPath);
} catch {
    console.error(`Cannot read ${midPath}.`);
    console.error(
        "Pass a path to an EMIDI file, or place ALFREDH.MID in tests/files/."
    );
    process.exit(1);
}

const mid = BasicMIDI.fromArrayBuffer(
    file.buffer.slice(
        file.byteOffset,
        file.byteOffset + file.byteLength
    ) as ArrayBuffer
);

// Track identity has to be captured by reference: filtering renumbers the
// list, and the names do not survive the flush that follows it.
const original = [...mid.tracks];
const described = original.map((t) => ({
    name: t.name || "(conductor)",
    include: ccValues(t, MIDIControllers.undefinedCC110LSB),
    exclude: ccValues(t, MIDIControllers.undefinedCC111LSB)
}));
const tempoChangesBefore = mid.tempoChanges.length;

console.info(`${path.basename(midPath)}: ${original.length} tracks\n`);

const removed = mid.removeEMIDINonGMTracks();
const keptIndices = original
    .map((t, i) => (mid.tracks.includes(t) ? i : -1))
    .filter((i) => i >= 0);

for (const [i, d] of described.entries()) {
    const verdict = keptIndices.includes(i) ? "keep" : "DROP";
    const inc = d.include.length ? `CC110=[${d.include.join(" ")}]` : "";
    const exc = d.exclude.length ? `CC111=[${d.exclude.join(" ")}]` : "";
    console.info(
        `  ${String(i).padStart(2)}  ${verdict}  ${d.name.padEnd(16)} ${inc.padEnd(18)} ${exc}`
    );
}
console.info(
    `\nremoved ${removed}, kept ${mid.tracks.length}` +
        `, tempo map ${tempoChangesBefore} -> ${mid.tempoChanges.length} entries`
);

const failures: string[] = [];

// The filter must never cost the file its tempo map. Dropping an
// undesignated conductor track silently resets the song to 120 BPM.
if (mid.tempoChanges.length < tempoChangesBefore) {
    failures.push(
        `tempo map lost entries: ${tempoChangesBefore} -> ${mid.tempoChanges.length}`
    );
}

if (path.basename(midPath).toUpperCase() === "ALFREDH.MID") {
    const expected = ALFREDH_EXPECTED_KEPT.join(",");
    const actual = keptIndices.join(",");
    if (expected !== actual) {
        failures.push(`kept tracks [${actual}], AudioLib keeps [${expected}]`);
        for (const i of ALFREDH_EXPECTED_KEPT) {
            if (!keptIndices.includes(i)) {
                failures.push(
                    `  track ${i} "${described[i].name}" dropped but should play`
                );
            }
        }
        for (const i of keptIndices) {
            if (!ALFREDH_EXPECTED_KEPT.includes(i)) {
                failures.push(
                    `  track ${i} "${described[i].name}" played but should drop`
                );
            }
        }
    }
} else {
    console.info("\nNo expected track selection for this file; reported only.");
}

if (failures.length === 0) {
    console.info("\nPASS");
    process.exit(0);
}

console.error("\nFAIL");
for (const f of failures) {
    console.error(`  ${f}`);
}
process.exit(1);
