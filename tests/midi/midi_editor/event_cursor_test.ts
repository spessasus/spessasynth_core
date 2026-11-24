// Assertion tests for the MIDI editor's event cursor, without the editor.
// Usage: npx tsx tests/midi/midi_editor/event_cursor_test.ts
import { MIDIBuilder, MIDIMessage, MIDIMessageTypes } from "../../../src";
import { EventCursor } from "../../../src/midi/midi_tools/midi_editor/event_cursor";

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
        console.info(`ok   ${name}`);
    } else {
        failed++;
        console.error(`FAIL ${name}: got ${a}, expected ${e}`);
    }
}

// Every test event is a volume CC, its value names it
const marker = (ticks: number, value: number) =>
    MIDIMessage.controllerChange(ticks, 0, 7, value);
const value = (e: MIDIMessage | undefined) =>
    e && (e.statusByte & 0xf0) === MIDIMessageTypes.controllerChange
        ? e.data[1]
        : undefined;

/**
 * A file with one track per list, a marker every 10 ticks.
 */
function newFile(...tracks: number[][]) {
    const midi = new MIDIBuilder({ name: "cursor", format: 1 });
    for (const [t, values] of tracks.entries()) {
        midi.addTrack(`track ${t}`);
        midi.tracks[t].pushEvents(
            ...values.map((v, i) => marker((i + 1) * 10, v))
        );
    }
    return midi;
}

const values = (midi: MIDIBuilder, track = 0) =>
    midi.tracks[track].events
        .map((e) => value(e))
        .filter((v) => v !== undefined);

/**
 * Runs the cursor over the file, calling the edit for every marker.
 * @returns The visited marker values, the deletes and the inserts the hooks saw.
 */
function run(
    midi: MIDIBuilder,
    edit: (cursor: EventCursor, v: number, track: number) => void
) {
    const visited = new Array<number>();
    const deletes = new Array<[number, number]>();
    const inserts = new Array<[number | undefined, number]>();
    const cursor = new EventCursor(
        midi,
        (track, index) => {
            deletes.push([track, index]);
        },
        (e, track) => {
            inserts.push([value(e), track]);
        }
    );
    midi.iterate((e, track, eventIndexes) => {
        cursor.begin(track, eventIndexes);
        const v = value(e);
        if (v === undefined) return;
        visited.push(v);
        edit(cursor, v, track);
    });
    return { visited, deletes, inserts };
}

// 1. Inserted events land around the current one and are not visited
{
    const midi = newFile([0, 1, 2, 3]);
    const { visited, inserts } = run(midi, (cursor, v) => {
        if (v !== 1) return;
        cursor.insertBefore(marker(20, 100), marker(20, 101));
        cursor.insertAfter(marker(20, 102), marker(20, 103));
    });
    check("1. visited", visited, [0, 1, 2, 3]);
    check("1. order", values(midi), [0, 100, 101, 1, 102, 103, 2, 3]);
    check("1. onInsert", inserts, [
        [100, 0],
        [101, 0],
        [102, 0],
        [103, 0]
    ]);
}

// 2. After deleting the current event, the cursor points at the event before it.
// A second delete does nothing, and inserting before goes where the deleted event was.
{
    const midi = newFile([0, 1, 2, 3]);
    let afterDelete: number | undefined;
    const { visited, deletes } = run(midi, (cursor, v) => {
        if (v !== 2) return;
        const index = cursor.index;
        cursor.deleteCurrent();
        cursor.deleteCurrent();
        afterDelete = value(midi.tracks[0].events[cursor.index]);
        check("2. deleted flag", cursor.deleted, true);
        check("2. index moved back", cursor.index, index - 1);
        cursor.insertBefore(marker(30, 100));
    });
    check("2. visited", visited, [0, 1, 2, 3]);
    check("2. points at the previous event", afterDelete, 1);
    check("2. order", values(midi), [0, 1, 100, 3]);
    check("2. one delete", deletes.length, 1);
}

// 3. Deleting an earlier event moves the current index back, nothing is skipped
{
    const midi = newFile([0, 1, 2, 3]);
    let index1 = -1;
    const { visited, deletes } = run(midi, (cursor, v, track) => {
        if (v === 1) index1 = cursor.index;
        if (v !== 2) return;
        cursor.deleteAt(track, index1);
        check("3. not the current event", cursor.deleted, false);
        check("3. still at the current event", value(cursor.event), 2);
    });
    check("3. visited", visited, [0, 1, 2, 3]);
    check("3. order", values(midi), [0, 2, 3]);
    check("3. onDelete", deletes, [[0, index1]]);
}

// 4. Deleting a later event leaves the current index alone
{
    const midi = newFile([0, 1, 2, 3]);
    const { visited } = run(midi, (cursor, v, track) => {
        if (v === 1) cursor.deleteAt(track, cursor.index + 1);
    });
    check("4. visited", visited, [0, 1, 3]);
    check("4. order", values(midi), [0, 1, 3]);
}

// 5. Replacing the current event
{
    const midi = newFile([0, 1, 2]);
    const { visited } = run(midi, (cursor, v) => {
        if (v === 1) cursor.replaceCurrent(marker(20, 50));
    });
    check("5. visited", visited, [0, 1, 2]);
    check("5. order", values(midi), [0, 50, 2]);
}

// 6. Edits on one track do not move another track's position
{
    const midi = newFile([0, 1, 2], [10, 11, 12]);
    const { visited } = run(midi, (cursor, v) => {
        if (v === 0) cursor.insertAfter(marker(10, 100));
        else if (v === 11) cursor.deleteCurrent();
    });
    check("6. visited", visited, [0, 10, 1, 11, 2, 12]);
    check("6. track 0", values(midi, 0), [0, 100, 1, 2]);
    check("6. track 1", values(midi, 1), [10, 12]);
}

// 7. Each event starts fresh: not deleted, no parameter channel
{
    const midi = newFile([0, 1]);
    const states = new Array<[boolean, number]>();
    run(midi, (cursor, v) => {
        states.push([cursor.deleted, cursor.parameterChannel]);
        if (v !== 0) return;
        cursor.parameterChannel = 3;
        cursor.deleteCurrent();
    });
    check("7. reset per event", states, [
        [false, -1],
        [false, -1]
    ]);
}

// 8. The current event can not be read or replaced after it was deleted
{
    const midi = newFile([0]);
    const errors = new Array<string>();
    run(midi, (cursor) => {
        cursor.deleteCurrent();
        try {
            void cursor.event;
        } catch {
            errors.push("event");
        }
        try {
            cursor.replaceCurrent(marker(10, 1));
        } catch {
            errors.push("replaceCurrent");
        }
    });
    check("8. throws", errors, ["event", "replaceCurrent"]);
}

if (failed > 0) {
    console.error(`${failed} failed.`);
    process.exitCode = 1;
} else {
    console.info("All passed.");
}
