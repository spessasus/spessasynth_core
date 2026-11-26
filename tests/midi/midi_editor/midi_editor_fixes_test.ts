// Assertion tests for MIDI editor bug fixes, one block per fixed bug.
// Usage: npx tsx tests/midi/midi_editor/midi_editor_fixes_test.ts
import {
    BasicMIDI,
    MIDIBuilder,
    MIDIControllers,
    MIDIMessage,
    MIDIMessageTypes,
    MIDIUtils,
    SpessaLog,
    SpessaSynthProcessor,
    SpessaSynthSequencer,
    type UserDrumModification
} from "../../../src";

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

const isCC = (e: MIDIMessage, cc: number) =>
    (e.statusByte & 0xf0) === MIDIMessageTypes.controllerChange &&
    e.data[0] === cc;
const isNoteOn = (e: MIDIMessage) =>
    (e.statusByte & 0xf0) === MIDIMessageTypes.noteOn && e.data[1] > 0;
const sysExResults = (midi: BasicMIDI) =>
    midi.tracks.flatMap((t) =>
        t.events
            .filter((e) => e.statusByte === MIDIMessageTypes.systemExclusive)
            .map((e) => ({ e, results: MIDIUtils.analyzeSysEx(e.data) }))
    );

/**
 * The events of track 0 (where the tests put the part SysEx) with the port each one plays on,
 * following the MIDI Port events from the track's port.
 */
function withPorts(midi: BasicMIDI) {
    let port = midi.tracks[0].port;
    return midi.tracks[0].events.map((e) => {
        if (e.statusByte === MIDIMessageTypes.midiPort) port = e.data[0];
        return { e, port };
    });
}
const isPort = (e: MIDIMessage) => e.statusByte === MIDIMessageTypes.midiPort;

const u32 = (n: number) => [
    n >>> 24,
    (n >> 16) & 0xff,
    (n >> 8) & 0xff,
    n & 0xff
];

/**
 * A format 2 file from raw track bodies, 96 ticks per quarter note.
 */
function formatTwo(tracks: number[][]) {
    const bytes = [
        0x4d,
        0x54,
        0x68,
        0x64,
        ...u32(6),
        0,
        2,
        0,
        tracks.length,
        0,
        96
    ];
    for (const t of tracks)
        bytes.push(0x4d, 0x54, 0x72, 0x6b, ...u32(t.length), ...t);
    return BasicMIDI.fromArrayBuffer(new Uint8Array(bytes).buffer);
}

function newFile() {
    const midi = new MIDIBuilder({ name: "fixes", format: 1 });
    midi.addTrack("track 1");
    midi.tracks[0].pushEvents(MIDIUtils.reset(0, "gs"));
    return midi;
}

// 1. A track switching to a port no track starts on.
// The track starts on its first port (0), so port 0 gets offset 0 and port 1 gets 16.
{
    const midi = newFile();
    midi.noteOn(0, 1, 0, 60, 100);
    midi.noteOff(240, 1, 0, 60);
    midi.addEvent(480, 1, MIDIMessageTypes.midiPort, [1]);
    midi.noteOn(960, 1, 0, 62, 100);
    midi.noteOff(1200, 1, 0, 62);
    midi.flush();
    let error = "";
    try {
        midi.modify({
            channels: new Map([
                [
                    0,
                    { controllers: new Map([[MIDIControllers.mainVolume, 40]]) }
                ],
                [
                    16,
                    { controllers: new Map([[MIDIControllers.mainVolume, 50]]) }
                ]
            ])
        });
    } catch (error_) {
        error = String(error_);
    }
    check("1. mid-track port change does not throw", error === "", error);
    const events = midi.tracks[1].events;
    const volumeBefore = (ticks: number) => {
        const note = events.findIndex((e) => isNoteOn(e) && e.ticks === ticks);
        const previous = events[note - 1];
        return isCC(previous, MIDIControllers.mainVolume)
            ? previous.data[1]
            : undefined;
    };
    check(
        "1. each port's locked controller goes before its first note",
        volumeBefore(0) === 40 && volumeBefore(960) === 50,
        `tick 0: ${volumeBefore(0)}, tick 960: ${volumeBefore(960)}`
    );
}

// 2. The rewritten relative fine tune goes where the file's RPN was.
{
    const midi = newFile();
    midi.noteOn(0, 1, 0, 60, 100);
    midi.noteOff(240, 1, 0, 60);
    // A note on, then a fine tune RPN on the same tick
    midi.noteOn(480, 1, 0, 64, 100);
    midi.registeredParameter(480, 1, 0, 1, 8192 + 2048);
    midi.noteOff(720, 1, 0, 64);
    midi.flush();
    midi.modify({ channels: new Map([[0, { fineTune: 20 }]]) });
    const at480 = midi.tracks[1].events.filter((e) => e.ticks === 480);
    const note = at480.findIndex((e) => isNoteOn(e));
    const rpn = at480.findIndex((e) =>
        isCC(e, MIDIControllers.registeredParameterMSB)
    );
    check(
        "2. replacement RPN stays after the note on the same tick",
        note !== -1 && rpn > note,
        `note ${note}, rpn ${rpn}`
    );
}
{
    // The RPN group is the first thing in its track, so deleting it moves the index to -1
    const midi = newFile();
    midi.noteOn(0, 1, 0, 60, 100);
    midi.noteOff(240, 1, 0, 60);
    midi.addTrack("track 2");
    midi.registeredParameter(480, 2, 0, 1, 8192 + 2048);
    midi.noteOn(480, 2, 0, 67, 100);
    midi.noteOff(720, 2, 0, 67);
    // Remove the track name and port events, so the RPN starts the track
    midi.tracks[2].deleteEvent(0);
    midi.tracks[2].deleteEvent(0);
    midi.flush();
    midi.modify({ channels: new Map([[0, { fineTune: 20 }]]) });
    const ccs = midi.tracks[2].events
        .filter(
            (e) => (e.statusByte & 0xf0) === MIDIMessageTypes.controllerChange
        )
        .map((e) => e.data[0]);
    check(
        "2. replacement RPN at the start of a track keeps its order",
        ccs.join(",") ===
            [
                MIDIControllers.registeredParameterMSB,
                MIDIControllers.registeredParameterLSB,
                MIDIControllers.dataEntryMSB,
                MIDIControllers.dataEntryLSB
            ].join(","),
        `got ${ccs.join(",")}`
    );
    const note = midi.tracks[2].events.find((e) => isNoteOn(e));
    check(
        "2. the event after it is still processed",
        note?.data[0] === 67,
        `note ${note?.data[0]}`
    );
}

// 3. A file whose only reset comes after the notes.
{
    const midi = new MIDIBuilder({ name: "fixes", format: 1 });
    midi.addTrack("track 1");
    midi.noteOn(0, 1, 0, 60, 100);
    midi.noteOff(240, 1, 0, 60);
    midi.tracks[0].pushEvents(MIDIUtils.reset(960, "gs"));
    midi.flush();
    midi.modify({
        gsReverbParams: {
            level: 100,
            character: 1,
            delayFeedback: 45,
            preDelayTime: 76,
            preLowpass: 2,
            time: 64
        }
    });
    const reverb = sysExResults(midi).filter((r) =>
        r.results.some((x) => x.type === "GS Reverb Param")
    );
    check(
        "3. requested reverb is written before the notes",
        reverb.length === 6 && reverb.every((r) => r.e.ticks === 0),
        `${reverb.length} messages`
    );
}

// 4. A melodic channel given a GS drum patch tracks the drum map.
{
    const midi = newFile();
    midi.noteOn(0, 1, 3, 38, 100);
    midi.noteOff(240, 1, 3, 38);
    midi.tracks[1].pushEvents(
        ...MIDIUtils.fromAnalyzedMessage(
            {
                type: "Map Drum Setup",
                drumMap: 1,
                key: 38,
                parameter: "pitchCoarse",
                value: 5
            },
            { ticks: 480, preferredSystem: "gs" }
        )
    );
    midi.noteOn(960, 1, 3, 38, 100);
    midi.noteOff(1200, 1, 3, 38);
    midi.flush();
    midi.modify({
        channels: new Map([
            [
                3,
                {
                    patch: {
                        program: 0,
                        bankMSB: 0,
                        bankLSB: 0,
                        isGMGSDrum: true
                    },
                    drumParams: new Map([[38, { pitchCoarse: 2 }]])
                }
            ]
        ])
    });
    const mapEdits = sysExResults(midi).filter((r) =>
        r.results.some((x) => x.type === "Map Drum Setup")
    );
    check(
        "4. map 1 drum edit of a locked parameter is deleted",
        mapEdits.length === 0,
        `${mapEdits.length} left`
    );
}

// 5. A User Drum Set bulk dump with one locked note.
{
    const midi = newFile();
    const levels = Array.from({ length: 40 }, (_, i) => 50 + i);
    // Set 0, level (address 0x01 in the bulk dump), notes 0 to 39
    midi.tracks[0].pushEvents(MIDIUtils.gsMessage(0, 0x29, 0x01, 0, levels));
    midi.noteOn(480, 1, 9, 36, 100);
    midi.noteOff(720, 1, 9, 36);
    midi.flush();
    midi.modify({
        userDrumParams: new Map([[0, new Map([[38, { level: 100 }]])]])
    });
    const all = sysExResults(midi);
    check(
        "5. the bulk dump packet is gone",
        all.every((r) => r.results.length === 1)
    );
    const levelOf = (note: number) =>
        all
            .flatMap((r) => r.results)
            .filter(
                (x) =>
                    x.type === "User Drum Setup" &&
                    x.drumSet === 0 &&
                    x.midiNote === note &&
                    x.parameter === "level"
            )
            .map((x) => (x as { value: number }).value);
    check(
        "5. unlocked notes keep their level",
        levelOf(36).join(",") === "86" && levelOf(0).join(",") === "50",
        `36: ${levelOf(36).join(",")}, 0: ${levelOf(0).join(",")}`
    );
    check(
        "5. the locked note only gets the requested level",
        levelOf(38).join(",") === "100",
        `38: ${levelOf(38).join(",")}`
    );
}

// 6. An oversized bulk dump with one locked note.
{
    const midi = newFile();
    midi.tracks[0].pushEvents(
        MIDIUtils.gsMessage(
            0,
            0x29,
            0x01,
            0,
            Array.from({ length: 140 }, () => 60)
        )
    );
    midi.noteOn(480, 1, 9, 36, 100);
    midi.flush();
    let error = "";
    try {
        midi.modify({
            userDrumParams: new Map([[0, new Map([[38, { level: 100 }]])]])
        });
    } catch (error_) {
        error = String(error_);
    }
    check(
        "6. notes above 127 in a bulk dump do not throw",
        error === "",
        error
    );
}

// 7. A locked drum map is tracked, the deleted file's one is not.
{
    const midi = newFile();
    midi.tracks[1].pushEvents(
        ...MIDIUtils.fromAnalyzedMessage(
            {
                type: "Channel MIDI Param",
                channel: 2,
                parameter: "drumMap",
                value: 0
            },
            { ticks: 0, preferredSystem: "gs" }
        )
    );
    midi.noteOn(0, 1, 2, 36, 100);
    midi.noteOff(240, 1, 2, 36);
    midi.tracks[1].pushEvents(
        ...MIDIUtils.fromAnalyzedMessage(
            {
                type: "Map Drum Setup",
                drumMap: 1,
                key: 36,
                parameter: "level",
                value: 20
            },
            { ticks: 480, preferredSystem: "gs" }
        )
    );
    midi.noteOn(960, 1, 2, 36, 100);
    midi.flush();
    midi.modify({
        channels: new Map([
            [
                2,
                {
                    midiParams: { drumMap: 1 },
                    drumParams: new Map([[36, { level: 120 }]])
                }
            ]
        ])
    });
    const mapEdits = sysExResults(midi).filter((r) =>
        r.results.some((x) => x.type === "Map Drum Setup")
    );
    check(
        "7. map 1 drum edit is checked against a channel locked to map 1",
        mapEdits.length === 0,
        `${mapEdits.length} left`
    );
}

// 8. A file without a reset, with only XG effects requested and a drum patch.
{
    const midi = new MIDIBuilder({ name: "fixes", format: 1 });
    midi.addTrack("track 1");
    midi.noteOn(0, 1, 1, 36, 100);
    midi.noteOff(240, 1, 1, 36);
    midi.flush();
    const snapshot = new SpessaSynthProcessor(44_100).getSnapshot()
        .xgReverbBlock;
    midi.modify({
        xgReverbParams: snapshot,
        channels: new Map([
            [
                1,
                {
                    patch: {
                        program: 0,
                        bankMSB: 0,
                        bankLSB: 0,
                        isGMGSDrum: true
                    }
                }
            ]
        ])
    });
    const bank = midi.tracks[1].events.find((e) =>
        isCC(e, MIDIControllers.bankSelect)
    );
    check(
        "8. channel setup uses XG drums when an XG reset gets added",
        bank?.data[1] === 127,
        `bank MSB ${bank?.data[1]}`
    );
}

// 9. The drum channel made melodic by the file, locked to a drum kit.
{
    const midi = newFile();
    midi.tracks[1].pushEvents(
        ...MIDIUtils.fromAnalyzedMessage(
            {
                type: "Channel MIDI Param",
                channel: 9,
                parameter: "drumMap",
                value: 0
            },
            { ticks: 0, preferredSystem: "gs" }
        )
    );
    midi.noteOn(0, 1, 9, 36, 100);
    midi.noteOff(240, 1, 9, 36);
    midi.flush();
    midi.modify({
        channels: new Map([
            [
                9,
                {
                    patch: {
                        program: 0,
                        bankMSB: 0,
                        bankLSB: 0,
                        isGMGSDrum: true
                    }
                }
            ]
        ])
    });
    // The locked patch owns the drum mode, so the file's drums off goes away
    // And the channel keeps its default drum map
    const drumsOff = sysExResults(midi).some((r) =>
        r.results.some(
            (x) =>
                x.type === "Channel MIDI Param" &&
                x.parameter === "drumMap" &&
                x.value === 0
        )
    );
    check("9. the drum channel stays on drums", !drumsOff);
}

// 10. A setup file: a reset and no notes.
{
    const midi = newFile();
    midi.controllerChange(0, 1, 0, MIDIControllers.mainVolume, 100);
    midi.flush();
    midi.modify({
        gsReverbParams: {
            level: 100,
            character: 1,
            delayFeedback: 45,
            preDelayTime: 76,
            preLowpass: 2,
            time: 64
        }
    });
    const all = sysExResults(midi);
    const resets = all.filter((r) =>
        r.results.some(
            (x) => x.type === "Global MIDI Param" && x.parameter === "system"
        )
    );
    const events = midi.tracks[0].events;
    const resetIndex = events.indexOf(resets[0]?.e);
    const firstReverb = events.findIndex((e) =>
        all.some(
            (r) =>
                r.e === e && r.results.some((x) => x.type === "GS Reverb Param")
        )
    );
    check(
        "10. no extra reset is added, the setup goes after the file's reset",
        resets.length === 1 && firstReverb > resetIndex,
        `${resets.length} resets, reset ${resetIndex}, reverb ${firstReverb}`
    );
}

// 11. A drum map edit counts for the channels of every port, like in the synth.
{
    const midi = newFile();
    midi.addTrack("port 1", 1);
    midi.noteOn(0, 1, 9, 38, 100);
    midi.noteOff(240, 1, 9, 38);
    midi.noteOn(0, 2, 0, 38, 100);
    midi.noteOff(240, 2, 0, 38);
    // Map 1 edit sent on port 0
    midi.tracks[1].pushEvents(
        ...MIDIUtils.fromAnalyzedMessage(
            {
                type: "Map Drum Setup",
                drumMap: 1,
                key: 38,
                parameter: "level",
                value: 20
            },
            { ticks: 480, preferredSystem: "gs" }
        )
    );
    midi.flush();
    midi.modify({
        channels: new Map([
            [
                16,
                {
                    patch: {
                        program: 0,
                        bankMSB: 0,
                        bankLSB: 0,
                        isGMGSDrum: true
                    },
                    drumParams: new Map([[38, { level: 120 }]])
                }
            ]
        ])
    });
    const mapEdits = sysExResults(midi).filter((r) =>
        r.results.some((x) => x.type === "Map Drum Setup")
    );
    check(
        "11. a drum lock on port 1 removes port 0's edit of the same map",
        mapEdits.length === 0,
        `${mapEdits.length} left`
    );
}

// 12. A GM reset that gets replaced with an XG fallback.
{
    const midi = new MIDIBuilder({ name: "fixes", format: 1 });
    midi.addTrack("track 1");
    midi.tracks[0].pushEvents(MIDIUtils.reset(0, "gm"));
    midi.noteOn(0, 1, 2, 36, 100);
    midi.noteOff(240, 1, 2, 36);
    midi.flush();
    midi.modify({
        fallbackReset: "xg",
        channels: new Map([
            [
                2,
                {
                    patch: {
                        program: 0,
                        bankMSB: 0,
                        bankLSB: 0,
                        isGMGSDrum: true
                    }
                }
            ]
        ])
    });
    const bank = midi.tracks[1].events.find((e) =>
        isCC(e, MIDIControllers.bankSelect)
    );
    check(
        "12. setups after a replaced GM reset use the fallback system",
        bank?.data[1] === 127,
        `bank MSB ${bank?.data[1]}`
    );
}

// 13. A locked patch owns the drum mode.
{
    const midi = newFile();
    midi.noteOn(0, 1, 2, 36, 100);
    midi.noteOff(240, 1, 2, 36);
    // The file turns the drums off later
    midi.tracks[1].pushEvents(
        ...MIDIUtils.fromAnalyzedMessage(
            {
                type: "Channel MIDI Param",
                channel: 2,
                parameter: "drumMap",
                value: 0
            },
            { ticks: 480, preferredSystem: "gs" }
        )
    );
    midi.noteOn(960, 1, 2, 36, 100);
    midi.flush();
    midi.modify({
        channels: new Map([
            [
                2,
                {
                    patch: {
                        program: 0,
                        bankMSB: 0,
                        bankLSB: 0,
                        isGMGSDrum: true
                    }
                }
            ]
        ])
    });
    const drumMaps = sysExResults(midi).flatMap((r) =>
        r.results.filter(
            (x) => x.type === "Channel MIDI Param" && x.parameter === "drumMap"
        )
    );
    check(
        "13. the file's drum mode change is removed, only the setup's stays",
        drumMaps.length === 1 && (drumMaps[0] as { value: number }).value === 1,
        `${drumMaps.length} drum map messages`
    );
}

// 14. A file without tracks.
{
    const midi = new MIDIBuilder({ name: "fixes", format: 1 });
    midi.tracks.length = 0;
    let error = "";
    try {
        midi.modify({ midiParams: { system: "gs" } });
    } catch (error_) {
        error = String(error_);
    }
    check("14. a file without tracks does not throw", error === "", error);
}

// 15. A GM setup file (a GM reset and no notes) gets its GM reset replaced like a meaningful one.
// The synth ignores GS and XG setups in GM mode.
{
    const midi = new MIDIBuilder({ name: "fixes", format: 1 });
    midi.addTrack("track 1");
    midi.tracks[0].pushEvents(MIDIUtils.reset(0, "gm"));
    midi.controllerChange(0, 1, 0, MIDIControllers.mainVolume, 100);
    midi.flush();
    midi.modify({
        gsReverbParams: {
            level: 100,
            character: 1,
            delayFeedback: 45,
            preDelayTime: 76,
            preLowpass: 2,
            time: 64
        }
    });
    const results = sysExResults(midi).flatMap((r) => r.results);
    const systems = results
        .filter((x) => x.type === "Global MIDI Param")
        .filter((x) => x.parameter === "system")
        .map((x) => x.value);
    const reverb = results.findIndex((x) => x.type === "GS Reverb Param");
    check(
        "15. the GM reset of a setup file becomes GS, followed by the reverb",
        systems.join(",") === "gs" && reverb > 0,
        `${systems.join(",")}, reverb at ${reverb}`
    );
}
{
    const midi = new MIDIBuilder({ name: "fixes", format: 1 });
    midi.addTrack("track 1");
    midi.tracks[0].pushEvents(MIDIUtils.reset(0, "gm"));
    midi.flush();
    // The types exclude GM, this is what a JavaScript caller gets
    let error = "";
    try {
        midi.modify({
            midiParams: { system: "gm" as "gs", volume: 0.5 }
        });
    } catch (error_) {
        error = String(error_);
    }
    check(
        "15b. GM can't be requested as the system",
        error.includes("GM can't be requested"),
        error
    );
}

// 16. patch: "clear" only removes program changes, not the drum mode.
{
    const midi = newFile();
    midi.tracks[1].pushEvents(
        ...MIDIUtils.fromAnalyzedMessage(
            {
                type: "Channel MIDI Param",
                channel: 10,
                parameter: "drumMap",
                value: 2
            },
            { ticks: 0, preferredSystem: "gs" }
        )
    );
    midi.noteOn(0, 1, 10, 36, 100);
    midi.flush();
    midi.modify({ channels: new Map([[10, { patch: "clear" }]]) });
    const drumMaps = sysExResults(midi).filter((r) =>
        r.results.some(
            (x) => x.type === "Channel MIDI Param" && x.parameter === "drumMap"
        )
    );
    check(
        '16. patch "clear" keeps the file\'s drum mode',
        drumMaps.length === 1
    );
}

// 17. A file with its own GS reset after the first note, only XG effects requested.
{
    const midi = new MIDIBuilder({ name: "fixes", format: 1 });
    midi.addTrack("track 1");
    midi.noteOn(0, 1, 3, 36, 100);
    midi.noteOff(240, 1, 3, 36);
    midi.tracks[0].pushEvents(MIDIUtils.reset(480, "gs"));
    midi.noteOn(960, 1, 3, 36, 100);
    midi.flush();
    midi.modify({
        xgReverbParams: new SpessaSynthProcessor(44_100).getSnapshot()
            .xgReverbBlock,
        channels: new Map([
            [
                3,
                {
                    patch: {
                        program: 0,
                        bankMSB: 0,
                        bankLSB: 0,
                        isGMGSDrum: true
                    }
                }
            ]
        ])
    });
    const firstBank = midi.tracks[1].events.find((e) =>
        isCC(e, MIDIControllers.bankSelect)
    );
    check(
        "17. setups before the file's GS reset stay GS",
        firstBank?.ticks === 0 && firstBank.data[1] === 0,
        `bank MSB ${firstBank?.data[1]} at ${firstBank?.ticks}`
    );
}

// 18. Only XG effects, and the file's only reset comes after its notes.
{
    const midi = new MIDIBuilder({ name: "fixes", format: 1 });
    midi.addTrack("track 1");
    midi.noteOn(0, 1, 0, 60, 100);
    midi.noteOff(240, 1, 0, 60);
    midi.tracks[0].pushEvents(MIDIUtils.reset(960, "xg"));
    midi.flush();
    midi.modify({
        xgReverbParams: new SpessaSynthProcessor(44_100).getSnapshot()
            .xgReverbBlock
    });
    const all = sysExResults(midi).flatMap((r) => r.results);
    const systems = all
        .filter((x) => x.type === "Global MIDI Param")
        .filter((x) => x.parameter === "system")
        .map((x) => x.value);
    check(
        "18. the added reset is XG and the XG reverb is written",
        systems[0] === "xg" && all.some((x) => x.type === "XG Reverb Param"),
        systems.join(",")
    );
}

// 19. Only clearing user drum sets does not add a reset.
{
    const midi = new MIDIBuilder({ name: "fixes", format: 1 });
    midi.addTrack("track 1");
    midi.noteOn(0, 1, 0, 60, 100);
    midi.noteOff(240, 1, 0, 60);
    midi.flush();
    midi.modify({ userDrumParams: new Map([[0, "clear"]]) });
    check(
        "19. no reset is added for a removal",
        sysExResults(midi).length === 0,
        `${sysExResults(midi).length} SysEx`
    );
}

// 20. Only XG effects, notes after the reset are all on a cleared channel.
{
    const midi = newFile();
    midi.noteOn(0, 1, 1, 60, 100);
    midi.noteOff(240, 1, 1, 60);
    // Move the reset after the first note, then only channel 3 plays
    midi.tracks[0].deleteEvent(midi.tracks[0].events.length - 1);
    midi.tracks[0].pushEvents(MIDIUtils.reset(480, "gs"));
    midi.noteOn(960, 1, 3, 60, 100);
    midi.noteOff(1200, 1, 3, 60);
    midi.flush();
    midi.modify({
        xgReverbParams: new SpessaSynthProcessor(44_100).getSnapshot()
            .xgReverbBlock,
        channels: new Map([[3, "clear"]])
    });
    const all = sysExResults(midi).flatMap((r) => r.results);
    check(
        "20. XG reverb is written when the only notes after the reset get cleared",
        all.some((x) => x.type === "XG Reverb Param")
    );
}

// 21. The flags packet and a dump for another device ID are split too.
// Every entry but the locked one stays, written with the dump's device ID.
{
    // 0x11 sets both Rx flags in the flags packet
    const values = Array.from({ length: 40 }, () => 0x11);
    for (const [name, a2, device, parameters, expected] of [
        ["the flags packet", 0x06, 0x10, ["rxNoteOff", "rxNoteOn"], 79],
        ["for another device ID", 0x01, 0x11, ["level"], 39]
    ] as const) {
        const midi = newFile();
        const dump = MIDIUtils.gsMessage(0, 0x29, a2, 0, values);
        dump.data[1] = device;
        midi.tracks[0].pushEvents(dump);
        midi.noteOn(480, 1, 9, 36, 100);
        midi.flush();
        midi.modify({
            userDrumParams: new Map([
                [0, new Map([[38, { level: 100, rxNoteOff: "clear" }]])]
            ])
        });
        const all = sysExResults(midi);
        // The dump's entries, not the locked level 100 the setup writes
        const fromDump = all
            .filter((r) => r.e.data[1] === device)
            .flatMap((r) => r.results)
            .filter(
                (x) =>
                    x.type === "User Drum Setup" &&
                    (parameters as readonly string[]).includes(x.parameter) &&
                    x.value !== 100
            );
        const lockedLeft = fromDump.filter(
            (x) =>
                x.type === "User Drum Setup" &&
                x.midiNote === 38 &&
                x.parameter !== "rxNoteOn"
        );
        check(
            `21. a bulk dump ${name} keeps all but the locked entry`,
            all.every((r) => r.results.length === 1) &&
                fromDump.length === expected &&
                lockedLeft.length === 0,
            `${fromDump.length} entries, ${lockedLeft.length} locked left`
        );
    }
}

// 22. Only XG effects on a file with a GM reset followed by notes.
{
    const midi = new MIDIBuilder({ name: "fixes", format: 1 });
    midi.addTrack("track 1");
    midi.tracks[0].pushEvents(MIDIUtils.reset(0, "gm"));
    midi.noteOn(0, 1, 0, 60, 100);
    midi.noteOff(240, 1, 0, 60);
    midi.flush();
    midi.modify({
        xgReverbParams: new SpessaSynthProcessor(44_100).getSnapshot()
            .xgReverbBlock
    });
    const all = sysExResults(midi).flatMap((r) => r.results);
    const systems = all
        .filter((x) => x.type === "Global MIDI Param")
        .filter((x) => x.parameter === "system")
        .map((x) => x.value);
    check(
        "22. the GM reset becomes XG and the XG reverb is written",
        systems.join(",") === "xg" &&
            all.some((x) => x.type === "XG Reverb Param"),
        systems.join(",")
    );
}

// 23. Clearing single user drum notes does not add a reset.
{
    const midi = new MIDIBuilder({ name: "fixes", format: 1 });
    midi.addTrack("track 1");
    midi.noteOn(0, 1, 0, 60, 100);
    midi.noteOff(240, 1, 0, 60);
    midi.flush();
    const notes: UserDrumModification = new Map<
        number,
        Parameters<UserDrumModification["set"]>[1]
    >([
        [36, "clear"],
        [38, { level: "clear" }]
    ]);
    midi.modify({ userDrumParams: new Map([[0, notes]]) });
    check(
        "23. no reset is added for note level removals",
        sysExResults(midi).length === 0,
        `${sysExResults(midi).length} SysEx`
    );
}

// 24. A setup file with only XG effects keeps its own reset.
{
    const midi = newFile();
    midi.controllerChange(0, 1, 0, MIDIControllers.mainVolume, 100);
    midi.flush();
    midi.modify({
        xgReverbParams: new SpessaSynthProcessor(44_100).getSnapshot()
            .xgReverbBlock
    });
    const systems = sysExResults(midi)
        .flatMap((r) => r.results)
        .filter((x) => x.type === "Global MIDI Param")
        .filter((x) => x.parameter === "system")
        .map((x) => x.value);
    check(
        "24. no XG reset is added to a GS setup file",
        systems.join(",") === "gs",
        systems.join(",")
    );
}

// 25. A user drum change that only sets pitchFine (not a GS parameter) adds no reset.
{
    const midi = new MIDIBuilder({ name: "fixes", format: 1 });
    midi.addTrack("track 1");
    midi.noteOn(0, 1, 0, 60, 100);
    midi.noteOff(240, 1, 0, 60);
    midi.flush();
    midi.modify({
        userDrumParams: new Map([[0, new Map([[36, { pitchFine: 10 }]])]])
    });
    check(
        "25. no reset is added when nothing can be written",
        sysExResults(midi).length === 0,
        `${sysExResults(midi).length} SysEx`
    );
}

// 26. A locked global parameter on a file without a reset adds one, so it is written.
{
    const midi = new MIDIBuilder({ name: "fixes", format: 1 });
    midi.addTrack("track 1");
    midi.noteOn(0, 1, 0, 60, 100);
    midi.noteOff(240, 1, 0, 60);
    midi.flush();
    midi.modify({ midiParams: { keyShift: 2 } });
    const results = sysExResults(midi).flatMap((r) => r.results);
    const reset = results.findIndex(
        (x) => x.type === "Global MIDI Param" && x.parameter === "system"
    );
    const keyShift = results.findIndex(
        (x) => x.type === "Global MIDI Param" && x.parameter === "keyShift"
    );
    check(
        "26. a reset is added and the key shift follows it",
        reset !== -1 && keyShift > reset,
        `reset ${reset}, key shift ${keyShift}`
    );
}

// 27. Without a reset the synth stays in GS, so a cleared system writes everything for GS.
// A locked drum patch uses the GS drum part message, not the XG drum bank, even with only XG effects.
{
    const midi = newFile();
    midi.noteOn(0, 1, 3, 38, 100);
    midi.noteOff(240, 1, 3, 38);
    midi.flush();
    midi.modify({
        midiParams: { system: "clear" },
        xgReverbParams: new SpessaSynthProcessor(44_100).getSnapshot()
            .xgReverbBlock,
        channels: new Map([
            [
                3,
                {
                    patch: {
                        program: 0,
                        bankMSB: 0,
                        bankLSB: 0,
                        isGMGSDrum: true
                    }
                }
            ]
        ])
    });
    const results = sysExResults(midi).flatMap((r) => r.results);
    const gsDrumPart = results.some(
        (x) => x.type === "Channel MIDI Param" && x.parameter === "drumMap"
    );
    const xgDrumBank = midi.tracks[1].events.some(
        (e) => isCC(e, MIDIControllers.bankSelect) && e.data[1] === 127
    );
    const xgReverb = results.some((x) => x.type === "XG Reverb Param");
    check(
        "27. a cleared system writes a locked drum patch for GS, no XG setup",
        gsDrumPart && !xgDrumBank && !xgReverb,
        `GS drum part ${gsDrumPart}, XG drum bank ${xgDrumBank}, XG reverb ${xgReverb}`
    );
}

// 28. User Drum Set bulk dump decoding (verified on hardware), in the analyzer and the synth.
{
    // A level dump starting at key 16
    const levels = Array.from({ length: 4 }, (_, i) => 90 + i);
    const dump = MIDIUtils.gsMessage(0, 0x29, 0x01, 16, levels);
    const keys = MIDIUtils.analyzeSysEx(dump.data)
        .filter((x) => x.type === "User Drum Setup")
        .map((x) => `${x.midiNote}:${String(x.value)}`);
    check(
        "28. a dump starting at key 16 is decoded onto keys 16 and up",
        keys.join(",") === "16:90,17:91,18:92,19:93",
        keys.join(",")
    );
    // Flags: bit 0 Rx NOTE OFF, bit 4 Rx NOTE ON, bit 3 internal
    const flags = MIDIUtils.analyzeSysEx(
        MIDIUtils.gsMessage(0, 0x29, 0x06, 0, [0x19, 0x08]).data
    ).map((x) =>
        x.type === "User Drum Setup" ? `${x.parameter}=${String(x.value)}` : ""
    );
    check(
        "28. flags with the internal bit set decode both Rx flags",
        flags.join(",") ===
            "rxNoteOff=true,rxNoteOn=true,rxNoteOff=false,rxNoteOn=false",
        flags.join(",")
    );
    const name = MIDIUtils.analyzeSysEx(
        MIDIUtils.gsMessage(0, 0x29, 0x0b, 0, [
            ...Array.from("USER DRUMS  ", (c) => c.charCodeAt(0)),
            0,
            0,
            0,
            0
        ]).data
    );
    check(
        "28. the name packet is a single message, not per key",
        name.length === 1 && name[0].type === "Other With Data",
        JSON.stringify(name)
    );

    // The synth decodes the same way
    const synth = new SpessaSynthProcessor(44_100);
    const changes = new Array<string>();
    synth.onEventCall = (e) => {
        if (e.type !== "userDrumSetChange") return;
        changes.push(
            `${e.data.midiNote}:${e.data.parameter}=${String(e.data.value)}`
        );
    };
    synth.systemExclusive(dump.data);
    synth.systemExclusive(MIDIUtils.gsMessage(0, 0x29, 0x06, 40, [0x09]).data);
    check(
        "28. the synth decodes the start key and the flag bits",
        changes.includes("16:level=90") &&
            changes.includes("19:level=93") &&
            !changes.includes("0:level=90") &&
            // 0x09: bit 0 set (Rx NOTE OFF on) with the internal bit 3, bit 4 clear
            changes.includes("40:rxNoteOff=true") &&
            changes.includes("40:rxNoteOn=false"),
        changes.join(",")
    );
}

// 29. XG: a part switched to drums with bank 127 uses Drum Setup 2 (verified on hardware).
// The file's later Drum Setup 2 edits for a key locked on that channel get removed.
for (const lockPatch of [false, true]) {
    const midi = new MIDIBuilder({ name: "fixes", format: 1 });
    midi.addTrack("track 1");
    midi.tracks[0].pushEvents(MIDIUtils.reset(0, "xg"));
    midi.controllerChange(0, 1, 1, MIDIControllers.bankSelect, 127);
    midi.programChange(0, 1, 1, 0);
    midi.noteOn(480, 1, 1, 38, 100);
    midi.noteOff(720, 1, 1, 38);
    // Drum Setup 2, key 38 pitch coarse, after the first note (where a locked patch is written)
    midi.tracks[0].pushEvents(
        MIDIMessage.systemExclusive(
            600,
            [0x43, 0x10, 0x4c, 0x31, 38, 0x00, 0x45, 0xf7]
        )
    );
    midi.flush();
    midi.modify({
        channels: new Map([
            [
                1,
                {
                    ...(lockPatch && {
                        patch: {
                            program: 0,
                            bankMSB: 0,
                            bankLSB: 0,
                            isGMGSDrum: true
                        }
                    }),
                    drumParams: new Map([[38, { pitchCoarse: 2 }]])
                }
            ]
        ])
    });
    const setup2 = sysExResults(midi).filter((r) =>
        r.results.some((x) => x.type === "Map Drum Setup" && x.drumMap === 3)
    );
    check(
        `29. the file's Drum Setup 2 edit is removed (${lockPatch ? "locked patch" : "the file's bank 127"})`,
        setup2.length === 0,
        `${setup2.length} left`
    );
}

// 30. A locked drum map stays locked on XG, even when the file switches the part to a drum bank later.
{
    const midi = new MIDIBuilder({ name: "fixes", format: 1 });
    midi.addTrack("track 1");
    midi.tracks[0].pushEvents(MIDIUtils.reset(0, "xg"));
    midi.noteOn(0, 1, 3, 60, 100);
    midi.noteOff(240, 1, 3, 60);
    midi.controllerChange(480, 1, 3, MIDIControllers.bankSelect, 127);
    midi.programChange(480, 1, 3, 0);
    midi.noteOn(600, 1, 3, 38, 100);
    midi.noteOff(720, 1, 3, 38);
    midi.flush();
    midi.modify({
        channels: new Map([[3, { midiParams: { drumMap: 0 } }]])
    });
    const synth = new SpessaSynthProcessor(44_100);
    const seq = new SpessaSynthSequencer(synth);
    seq.loadNewSongList([midi]);
    seq.play();
    const l = new Float32Array(128);
    const r = new Float32Array(128);
    // Play past the drum bank program change (about 0.6 s)
    for (let i = 0; i < 230; i++) {
        seq.processTick();
        synth.process(l, r, 0, 128);
    }
    check(
        "30. the synth keeps the locked melodic map after the file's bank 127 program change",
        synth.midiChannels[3].midiParameters.drumMap === 0,
        `map ${synth.midiChannels[3].midiParameters.drumMap}`
    );
}

// 31. A locked receive channel on the second port is written relative to the port, like the channel.
// The synth adds the port offset to the received channel, so channel 20 receiving on 20 is written as 4.
{
    const midi = newFile();
    midi.noteOn(480, 1, 4, 60, 100);
    midi.noteOff(720, 1, 4, 60);
    midi.addTrack("port 1", 1);
    midi.noteOn(480, 2, 4, 60, 100);
    midi.noteOff(720, 2, 4, 60);
    midi.flush();
    midi.modify({
        channels: new Map([[20, { midiParams: { rxChannel: 20 } }]])
    });
    const rx = sysExResults(midi)
        .flatMap(({ results }) => results)
        .filter(
            (r) =>
                r.type === "Channel MIDI Param" && r.parameter === "rxChannel"
        );
    check(
        "31. the locked receive channel is written once, relative to the port",
        rx.length === 1 &&
            rx[0].type === "Channel MIDI Param" &&
            rx[0].value === 4,
        JSON.stringify(rx)
    );
}

// 32. A GS tone number (bank select + program change) with only the bank select locked.
// The program change stays, written as a standard one.
{
    const midi = newFile();
    // Part 1 is channel 0
    midi.tracks[0].pushEvents(
        MIDIUtils.gsMessage(10, 0x40, 0x11, 0x00, [5, 33])
    );
    midi.noteOn(480, 1, 0, 60, 100);
    midi.noteOff(720, 1, 0, 60);
    midi.flush();
    midi.modify({
        channels: new Map([
            [0, { controllers: new Map([[MIDIControllers.bankSelect, 8]]) }]
        ])
    });
    const events = midi.tracks.flatMap((t) => t.events);
    const program = events.filter(
        (e) =>
            e.statusByte === MIDIMessageTypes.programChange && e.data[0] === 33
    );
    const fileBank = events.filter(
        (e) => isCC(e, MIDIControllers.bankSelect) && e.data[1] === 5
    );
    check(
        "32. the tone number keeps its program change without the locked bank select",
        program.length === 1 &&
            program[0].ticks === 10 &&
            fileBank.length === 0 &&
            sysExResults(midi).every((r) =>
                r.results.every((x) => x.type !== "Program Change")
            ),
        `${program.length} programs at ${program[0]?.ticks}, ${fileBank.length} file banks`
    );
}

// 33. The same on block B (channel 16), which a channel message on this track can't reach.
// The program change goes to port B, wrapped in MIDI Port events.
// Track 0 has no port event, so its own port goes first and it still starts on port A.
{
    const midi = newFile();
    midi.tracks[0].pushEvents(
        MIDIUtils.gsMessage(10, 0x50, 0x11, 0x00, [5, 33])
    );
    midi.tracks[0].events = midi.tracks[0].events.filter((e) => !isPort(e));
    midi.noteOn(480, 1, 0, 60, 100);
    midi.noteOff(720, 1, 0, 60);
    midi.addTrack("port B", 1);
    midi.noteOn(480, 2, 0, 62, 100);
    midi.noteOff(720, 2, 0, 62);
    midi.flush();
    let error = "";
    try {
        midi.modify({
            channels: new Map([
                [
                    16,
                    { controllers: new Map([[MIDIControllers.bankSelect, 8]]) }
                ]
            ])
        });
    } catch (error_) {
        error = String(error_);
    }
    const toneNumbers = sysExResults(midi).filter((r) =>
        r.results.some((x) => x.type === "Program Change")
    );
    const track0 = withPorts(midi);
    const program = track0.filter(
        ({ e }) => e.statusByte === MIDIMessageTypes.programChange
    );
    const ports = track0.filter(({ e }) => isPort(e)).map(({ e }) => e.data[0]);
    check(
        "33. a block B tone number with a locked bank select keeps its program change on port B",
        error === "" &&
            toneNumbers.length === 0 &&
            program.length === 1 &&
            program[0].e.data[0] === 33 &&
            program[0].e.ticks === 10 &&
            midi.getPortOffset(program[0].port) === 16 &&
            ports.join(",") === "0,1,0" &&
            track0.find(({ e }) => isPort(e))?.e.ticks === 10 &&
            midi.tracks[0].port === 0 &&
            midi.getPortOffset(1) === 16,
        error ||
            `${program.length} programs on port ${program[0]?.port}, ports ${ports.join(",")}, track port ${midi.tracks[0].port}`
    );
}

// 34. A relative fine tune replaces the file's fine tune RPN with a corrected one.
// The next data entry uses the same RPN MSB, it must not get a redundant MSB restore,
// The corrected RPN already put the selection back.
{
    const midi = newFile();
    const cc = (ticks: number, controller: number, value: number) =>
        midi.addEvent(ticks, 1, MIDIMessageTypes.controllerChange, [
            controller,
            value
        ]);
    midi.noteOn(0, 1, 0, 60, 100);
    midi.noteOff(120, 1, 0, 60);
    cc(240, MIDIControllers.registeredParameterMSB, 0);
    cc(240, MIDIControllers.registeredParameterLSB, 1);
    cc(240, MIDIControllers.dataEntryMSB, 70);
    cc(360, MIDIControllers.registeredParameterLSB, 0);
    cc(360, MIDIControllers.dataEntryMSB, 12);
    midi.noteOn(480, 1, 0, 60, 100);
    midi.noteOff(600, 1, 0, 60);
    midi.flush();
    midi.modify({ channels: new Map([[0, { fineTune: -56 }]]) });
    const events = midi.tracks[1].events;
    const range = events.findIndex(
        (e) => isCC(e, MIDIControllers.dataEntryMSB) && e.data[1] === 12
    );
    const before = events[range - 1];
    check(
        "34. no redundant RPN MSB before the data entry after a corrected fine tune",
        range > 0 && isCC(before, MIDIControllers.registeredParameterLSB),
        `before the range: CC ${before?.data[0]}`
    );
}

// 35. A GS tone number with a single data byte only sets the bank, its next byte is the checksum.
// With the bank select locked, nothing is left, no program change is made up from the checksum.
{
    const midi = newFile();
    midi.tracks[0].pushEvents(MIDIUtils.gsMessage(10, 0x40, 0x11, 0x00, [5]));
    midi.noteOn(480, 1, 0, 60, 100);
    midi.noteOff(720, 1, 0, 60);
    midi.flush();
    midi.modify({
        channels: new Map([
            [0, { controllers: new Map([[MIDIControllers.bankSelect, 8]]) }]
        ])
    });
    const programs = midi.tracks.flatMap((t) =>
        t.events.filter((e) => e.statusByte === MIDIMessageTypes.programChange)
    );
    check(
        "35. a one-byte tone number does not turn its checksum into a program change",
        programs.length === 0,
        programs.map((e) => e.data[0]).join(",")
    );
}

// 36. A synth locked to GM counts as not locked when applying its snapshot.
// The editor can't write GM, so the file's GM reset gets the usual GS fallback instead of throwing.
{
    const midi = new MIDIBuilder({ name: "fixes", format: 1 });
    midi.addTrack("track 1");
    midi.tracks[0].pushEvents(MIDIUtils.reset(0, "gm"));
    midi.noteOn(480, 1, 0, 60, 100);
    midi.noteOff(720, 1, 0, 60);
    midi.flush();
    const synth = new SpessaSynthProcessor(44_100);
    synth.processMessage(MIDIUtils.reset(0, "gm"));
    synth.lockMIDIParameter("system", true);
    let error = "";
    try {
        midi.applySnapshot(synth.getSnapshot());
    } catch (error_) {
        error = String(error_);
    }
    const systems = sysExResults(midi)
        .flatMap((r) => r.results)
        .filter((x) => x.type === "Global MIDI Param")
        .filter((x) => x.parameter === "system")
        .map((x) => x.value);
    check(
        "36. a snapshot locked to GM applies, the GM reset gets the GS fallback",
        error === "" &&
            synth.midiParameters.system === "gm" &&
            systems.join(",") === "gs",
        error || `${synth.midiParameters.system}: ${systems.join(",")}`
    );
}

// 37. A relative fine tune on block B: the file's GS part fine tune is replaced by a corrected RPN on port B.
// The RPN changes the output's selection of that channel, so the file's next NRPN data entry gets its selection back.
{
    const midi = newFile();
    midi.addTrack("port B", 1);
    const cc = (ticks: number, controller: number, value: number) =>
        midi.addEvent(ticks, 2, MIDIMessageTypes.controllerChange, [
            controller,
            value
        ]);
    midi.noteOn(480, 1, 0, 60, 100);
    midi.noteOff(720, 1, 0, 60);
    midi.noteOn(480, 2, 0, 62, 100);
    midi.noteOff(720, 2, 0, 62);
    cc(800, MIDIControllers.nonRegisteredParameterMSB, 1);
    cc(800, MIDIControllers.nonRegisteredParameterLSB, 8);
    cc(800, MIDIControllers.dataEntryMSB, 64);
    // Part 1 of block B is channel 16, fine tune 0 cents
    midi.addEvent(
        900,
        0,
        MIDIMessageTypes.systemExclusive,
        MIDIUtils.gs(0x50, 0x11, 0x2a, [0x40, 0x00])
    );
    cc(1000, MIDIControllers.dataEntryMSB, 70);
    midi.noteOn(1100, 2, 0, 62, 100);
    midi.noteOff(1200, 2, 0, 62);
    midi.flush();
    midi.modify({ channels: new Map([[16, { fineTune: -56 }]]) });
    const track0 = withPorts(midi);
    const rpn = track0.filter(
        ({ e }) =>
            e.ticks === 900 &&
            (e.statusByte & 0xf0) === MIDIMessageTypes.controllerChange
    );
    const fineTunes = sysExResults(midi).filter((r) =>
        r.results.some(
            (x) => x.type === "Channel MIDI Param" && x.parameter === "fineTune"
        )
    );
    const events = midi.tracks[2].events;
    const data = events.findIndex(
        (e) => isCC(e, MIDIControllers.dataEntryMSB) && e.data[1] === 70
    );
    check(
        "37. a block B fine tune is replaced by a corrected RPN on port B",
        fineTunes.length === 0 &&
            rpn.length === 4 &&
            rpn.every(({ port }) => midi.getPortOffset(port) === 16) &&
            isCC(rpn[0].e, MIDIControllers.registeredParameterMSB),
        `${fineTunes.length} fine tunes, RPN ${rpn.map(({ e, port }) => `${e.data[0]}@${port}`).join(" ")}`
    );
    check(
        "37. the NRPN data entry after it gets its selection back",
        data > 1 &&
            isCC(events[data - 2], MIDIControllers.nonRegisteredParameterMSB) &&
            isCC(events[data - 1], MIDIControllers.nonRegisteredParameterLSB),
        `before the data entry: CC ${events[data - 2]?.data[0]}, ${events[data - 1]?.data[0]}`
    );
}

// 38. Consecutive wraps for the same port join, also across ticks: one MIDI Port pair around both program changes.
{
    const midi = newFile();
    // Parts 1 and 2 of block B are channels 16 and 17
    midi.tracks[0].pushEvents(
        MIDIUtils.gsMessage(10, 0x50, 0x11, 0x00, [5, 33]),
        MIDIUtils.gsMessage(20, 0x50, 0x12, 0x00, [5, 34])
    );
    midi.noteOn(480, 1, 0, 60, 100);
    midi.noteOff(720, 1, 0, 60);
    midi.addTrack("port B", 1);
    midi.noteOn(480, 2, 0, 62, 100);
    midi.noteOn(480, 2, 1, 62, 100);
    midi.noteOff(720, 2, 0, 62);
    midi.noteOff(720, 2, 1, 62);
    midi.flush();
    const bank = { controllers: new Map([[MIDIControllers.bankSelect, 8]]) };
    midi.modify({
        channels: new Map([
            [16, bank],
            [17, bank]
        ])
    });
    const wrapped = withPorts(midi).filter(
        ({ e }) =>
            isPort(e) ||
            (e.statusByte & 0xf0) === MIDIMessageTypes.programChange
    );
    const summary = wrapped
        .map(({ e }) =>
            isPort(e)
                ? `port ${e.data[0]}@${e.ticks}`
                : `PC ${e.data[0]}@${e.ticks}`
        )
        .join(", ");
    check(
        "38. two block B program changes share one wrap",
        summary === "port 0@0, port 1@10, PC 33@10, PC 34@20, port 0@20",
        summary
    );
}

// 39. A block B part switched to a drum kit by an XG part program change gets its locked drum map back,
// As a part SysEx that addresses part 17 from this track like the file's message.
{
    const midi = new MIDIBuilder({ name: "fixes", format: 1 });
    midi.addTrack("track 1");
    midi.tracks[0].pushEvents(
        MIDIUtils.reset(0, "xg"),
        // Part 17 (channel 16): drum kit bank, then the program change
        MIDIUtils.xgMessage(10, 0x08, 16, 0x01, [127]),
        MIDIUtils.xgMessage(20, 0x08, 16, 0x03, [0])
    );
    midi.noteOn(480, 1, 0, 60, 100);
    midi.noteOff(720, 1, 0, 60);
    midi.addTrack("port B", 1);
    midi.noteOn(480, 2, 0, 62, 100);
    midi.noteOff(720, 2, 0, 62);
    midi.flush();
    midi.modify({ channels: new Map([[16, { midiParams: { drumMap: 2 } }]]) });
    const relock = sysExResults(midi)
        .filter(({ e }) => e.ticks === 20)
        .flatMap(({ results }) => results)
        .filter(
            (x) => x.type === "Channel MIDI Param" && x.parameter === "drumMap"
        );
    check(
        "39. the locked drum map of a block B part is written again for that part",
        relock.length === 1 &&
            relock[0].type === "Channel MIDI Param" &&
            relock[0].channel === 16 &&
            relock[0].value === 2,
        JSON.stringify(relock)
    );
}

// 40. A note track without any port event can't get a port wrap.
// Its first port event would change how the file's ports get their channels.
// The kept block B program change is dropped, the routing stays the same.
{
    const midi = newFile();
    midi.tracks[1].events = midi.tracks[1].events.filter((e) => !isPort(e));
    midi.noteOn(0, 1, 0, 60, 100);
    midi.addEvent(
        10,
        1,
        MIDIMessageTypes.systemExclusive,
        MIDIUtils.gs(0x50, 0x11, 0x00, [5, 33])
    );
    midi.noteOff(720, 1, 0, 60);
    // Port A comes first, so the portless track 1 joins it (the lowest port with notes)
    midi.addTrack("port A", 0);
    midi.noteOn(480, 2, 1, 62, 100);
    midi.noteOff(720, 2, 1, 62);
    midi.addTrack("port B", 1);
    midi.noteOn(480, 3, 0, 62, 100);
    midi.noteOff(720, 3, 0, 62);
    midi.flush();
    const offsetsBefore = midi.tracks.map((t) => midi.getPortOffset(t.port));
    midi.modify({
        channels: new Map([
            [16, { controllers: new Map([[MIDIControllers.bankSelect, 8]]) }]
        ])
    });
    const track1 = midi.tracks[1].events;
    const offsetsAfter = midi.tracks.map((t) => midi.getPortOffset(t.port));
    check(
        "40. no port wrap on a note track without a port event, the entry is dropped",
        !track1.some((e) => isPort(e)) &&
            !track1.some(
                (e) => (e.statusByte & 0xf0) === MIDIMessageTypes.programChange
            ) &&
            sysExResults(midi).every((r) =>
                r.results.every((x) => x.type !== "Program Change")
            ) &&
            offsetsBefore.join(",") === offsetsAfter.join(","),
        `ports ${track1.filter((e) => isPort(e)).length}, offsets ${offsetsBefore.join(",")} -> ${offsetsAfter.join(",")}`
    );
}

// 41. Wraps with a kept event between them don't join, the event stays on the track's own port.
{
    const midi = newFile();
    midi.tracks[0].pushEvents(
        MIDIUtils.gsMessage(10, 0x50, 0x11, 0x00, [5, 33]),
        // Master volume, kept as it is
        MIDIUtils.gsMessage(15, 0x40, 0x00, 0x04, [100]),
        MIDIUtils.gsMessage(20, 0x50, 0x12, 0x00, [5, 34])
    );
    midi.noteOn(480, 1, 0, 60, 100);
    midi.noteOff(720, 1, 0, 60);
    midi.addTrack("port B", 1);
    midi.noteOn(480, 2, 0, 62, 100);
    midi.noteOn(480, 2, 1, 62, 100);
    midi.noteOff(720, 2, 0, 62);
    midi.noteOff(720, 2, 1, 62);
    midi.flush();
    const bank = { controllers: new Map([[MIDIControllers.bankSelect, 8]]) };
    midi.modify({
        channels: new Map([
            [16, bank],
            [17, bank]
        ])
    });
    const summary = withPorts(midi)
        .filter(
            ({ e }) =>
                isPort(e) ||
                (e.statusByte & 0xf0) === MIDIMessageTypes.programChange ||
                (e.statusByte === MIDIMessageTypes.systemExclusive &&
                    e.ticks === 15)
        )
        .map(({ e, port }) =>
            isPort(e)
                ? `port ${e.data[0]}@${e.ticks}`
                : e.statusByte === MIDIMessageTypes.systemExclusive
                  ? `volume@${e.ticks} on ${port}`
                  : `PC ${e.data[0]}@${e.ticks}`
        )
        .join(", ");
    check(
        "41. an event between two wraps keeps them apart",
        summary ===
            "port 0@0, port 1@10, PC 33@10, port 0@10, volume@15 on 0, port 1@20, PC 34@20, port 0@20",
        summary
    );
}

// 42. Format 2: with the system cleared, the setup goes on the track of the first note, not after the first track's end.
// The tracks play one after another, so a setup on track 0 at the first note's tick would make track 0 longer
// And move every later track on write
{
    const conductor = [
        0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, 0x60, 0xff, 0x2f, 0x00
    ];
    const notes = [
        0x10, 0x90, 0x3c, 0x64, 0x60, 0x80, 0x3c, 0x40, 0x00, 0xff, 0x2f, 0x00
    ];
    const midi = formatTwo([conductor, notes]);
    const noteTicks = (m: BasicMIDI) =>
        m.tracks
            .flatMap((t) =>
                t.events.filter((e) => isNoteOn(e)).map((e) => e.ticks)
            )
            .join(",");
    const before = noteTicks(midi);
    midi.modify({ midiParams: { system: "clear", volume: 100 } });
    const conductorEnd = midi.tracks[0].events.at(-1)?.ticks;
    const back = BasicMIDI.fromArrayBuffer(midi.writeMIDI());
    check(
        "42. a format 2 setup goes on the first note's track and the timing survives a write",
        conductorEnd === 96 && noteTicks(back) === before && before === "112",
        `conductor end ${conductorEnd}, notes ${before} -> ${noteTicks(back)}`
    );
}

// 43. Format 2 with the system cleared: a velocity 0 note on doesn't count as the first note,
// The setup still goes on the track of the first sounding note
{
    // Track 0 has a velocity 0 note on at tick 0 and ends at 96
    const conductor = [0x00, 0x90, 0x3c, 0x00, 0x60, 0xff, 0x2f, 0x00];
    const notes = [
        0x10, 0x90, 0x3c, 0x64, 0x60, 0x80, 0x3c, 0x40, 0x00, 0xff, 0x2f, 0x00
    ];
    const midi = formatTwo([conductor, notes]);
    midi.modify({ midiParams: { system: "clear", volume: 100 } });
    const setupTrack = midi.tracks.findIndex((t) =>
        t.events.some((e) => e.statusByte === MIDIMessageTypes.systemExclusive)
    );
    check(
        "43. a velocity 0 note on doesn't decide where a format 2 setup goes",
        setupTrack === 1 && midi.tracks[0].events.at(-1)?.ticks === 96,
        `setup on track ${setupTrack}, track 0 ends at ${midi.tracks[0].events.at(-1)?.ticks}`
    );
}

console.info(failed === 0 ? "\nAll passed." : `\n${failed} failed.`);
if (failed > 0) process.exit(1);
