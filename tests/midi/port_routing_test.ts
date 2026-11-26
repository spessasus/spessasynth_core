// Assertion tests for MIDI port routing in BasicMIDI and the sequencer (playback and seeking).
// Usage: npx tsx tests/midi/port_routing_test.ts
import {
    BasicMIDI,
    MIDIBuilder,
    MIDIControllers,
    MIDIMessageTypes,
    MIDIUtils,
    SpessaLog,
    SpessaSynthProcessor,
    SpessaSynthSequencer
} from "../../src";

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

// Plays the file for a second and seeks a fresh sequencer near the end, returns both synths
function run(midi: BasicMIDI) {
    const parsed = BasicMIDI.fromArrayBuffer(midi.writeMIDI());
    const play = new SpessaSynthProcessor(44_100);
    const seq = new SpessaSynthSequencer(play);
    // Real playback from the start, skipping to the first note would seek
    seq.skipToFirstNoteOn = false;
    seq.loadNewSongList([parsed]);
    seq.play();
    const l = new Float32Array(128);
    const r = new Float32Array(128);
    for (let i = 0; i < 400; i++) {
        seq.processTick();
        play.process(l, r, 0, 128);
    }
    const seek = new SpessaSynthProcessor(44_100);
    const seq2 = new SpessaSynthSequencer(seek);
    seq2.loadNewSongList([parsed]);
    seq2.currentTime = parsed.duration * 0.9;
    return { parsed, synths: [play, seek] as const };
}
const port = (m: MIDIBuilder, track: number, ticks: number, p: number) =>
    m.addEvent(ticks, track, MIDIMessageTypes.midiPort, [p]);

// 1. MuseScore: the channel setup is on a track without notes, its port event comes after the setup.
// Testcase: musescore/Undertale_Yellow_OST.mid ("Harpsichord" setup track for port B)
{
    const m = new MIDIBuilder({ name: "ports", format: 1 });
    m.addTrack("A notes", 0);
    m.noteOn(0, 1, 0, 60, 100);
    m.noteOff(240, 1, 0, 60);
    m.addTrack("B setup", 1);
    m.programChange(0, 2, 3, 6);
    // Move the port event after the setup, like MuseScore writes it
    const setup = m.tracks[2];
    const portIndex = setup.events.findIndex(
        (e) => e.statusByte === MIDIMessageTypes.midiPort
    );
    const portEvent = setup.events[portIndex];
    setup.deleteEvent(portIndex);
    setup.pushEvents(portEvent);
    m.addTrack("B notes", 1);
    m.noteOn(0, 3, 3, 60, 100);
    m.noteOff(240, 3, 3, 60);
    m.flush();
    const { parsed, synths } = run(m);
    check(
        "1. the setup track starts on its first port",
        parsed.tracks[2].port === 1,
        `port ${parsed.tracks[2].port}`
    );
    for (const [i, s] of synths.entries()) {
        const label = i === 0 ? "playback" : "seek";
        check(
            `1. the setup reaches port B (${label})`,
            s.midiChannels[16 + 3].patch.program === 6 &&
                s.midiChannels[3].patch.program === 0,
            `B ${s.midiChannels[16 + 3].patch.program}, A ${s.midiChannels[3].patch.program}`
        );
    }
}

// 2. A port without notes gets no channels: its voice messages and part SysEx are dropped,
// But a reset there resets the whole device, like on real hardware (verified on 88emu).
// Testcase: KYCMID/43551.KYC.mid (a reset and part setup for an unused port B after port A's)
{
    const m = new MIDIBuilder({ name: "ports", format: 1 });
    // Conductor: port A reset and drum part 11, then the same for port B
    port(m, 0, 0, 0);
    m.tracks[0].pushEvents(
        MIDIUtils.reset(0, "gs"),
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
    port(m, 0, 0, 1);
    m.tracks[0].pushEvents(
        MIDIUtils.reset(0, "gs"),
        ...MIDIUtils.fromAnalyzedMessage(
            {
                type: "Channel MIDI Param",
                channel: 10,
                parameter: "drumMap",
                value: 1
            },
            { ticks: 0, preferredSystem: "gs" }
        )
    );
    port(m, 0, 0, 0);
    m.addTrack("A notes", 0);
    m.noteOn(480, 1, 10, 36, 100);
    m.noteOff(720, 1, 10, 36);
    // A device control track on port 12 (no notes)
    m.addTrack("Effect Control", 12);
    m.programChange(0, 2, 0, 40);
    m.flush();
    const { parsed, synths } = run(m);
    check(
        "2. only the port with notes has channels",
        parsed.getPortOffset(0) === 0 &&
            parsed.getPortOffset(1) === undefined &&
            parsed.getPortOffset(12) === undefined,
        `${parsed.getPortOffset(0)} ${parsed.getPortOffset(1)} ${parsed.getPortOffset(12)}`
    );
    for (const [i, s] of synths.entries()) {
        const label = i === 0 ? "playback" : "seek";
        check(
            `2. port B's reset clears port A's drum part, port B's part SysEx and port 12 don't reach it (${label})`,
            s.midiChannels.length === 16 &&
                s.midiChannels[10].midiParameters.drumMap === 0 &&
                s.midiChannels[0].patch.program === 0,
            `channels ${s.midiChannels.length}, map ${s.midiChannels[10].midiParameters.drumMap}, program ${s.midiChannels[0].patch.program}`
        );
    }
}

// 3. A track switching ports: the lower port gets the first offset, the switch is followed.
{
    const m = new MIDIBuilder({ name: "ports", format: 1 });
    m.addTrack("switch", 0);
    m.programChange(0, 1, 2, 10);
    m.noteOn(0, 1, 2, 60, 100);
    m.noteOff(240, 1, 2, 60);
    port(m, 1, 480, 1);
    m.programChange(480, 1, 2, 20);
    m.noteOn(480, 1, 2, 62, 100);
    m.noteOff(720, 1, 2, 62);
    m.flush();
    const { parsed, synths } = run(m);
    check(
        "3. the first port gets channels 0 to 15",
        parsed.tracks[1].port === 0 &&
            parsed.getPortOffset(0) === 0 &&
            parsed.getPortOffset(1) === 16,
        `port ${parsed.tracks[1].port}, offsets ${parsed.getPortOffset(0)} ${parsed.getPortOffset(1)}`
    );
    for (const [i, s] of synths.entries()) {
        const label = i === 0 ? "playback" : "seek";
        check(
            `3. each port gets its own program (${label})`,
            s.midiChannels[2].patch.program === 10 &&
                s.midiChannels[18].patch.program === 20,
            `${s.midiChannels[2].patch.program} ${s.midiChannels[18].patch.program}`
        );
    }
}

// 4. A MIDI Port event without data is ignored, it does not mute the rest of its track.
{
    const m = new MIDIBuilder({ name: "ports", format: 1 });
    m.addTrack("notes", 0);
    m.noteOn(0, 1, 0, 60, 100);
    m.noteOff(240, 1, 0, 60);
    m.addEvent(300, 1, MIDIMessageTypes.midiPort, []);
    m.programChange(480, 1, 0, 30);
    m.noteOn(480, 1, 0, 62, 100);
    m.noteOff(720, 1, 0, 62);
    m.flush();
    const { synths } = run(m);
    for (const [i, s] of synths.entries()) {
        const label = i === 0 ? "playback" : "seek";
        check(
            `4. the program change after an empty port event still plays (${label})`,
            s.midiChannels[0].patch.program === 30,
            String(s.midiChannels[0].patch.program)
        );
    }
}

// 5. External playback: a port without notes only sends fully global SysEx (like a reset), nothing else.
{
    const m = new MIDIBuilder({ name: "ports", format: 1 });
    port(m, 0, 0, 1);
    m.tracks[0].pushEvents(
        MIDIUtils.reset(0, "gs"),
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
    m.addTrack("A notes", 0);
    m.noteOn(480, 1, 0, 60, 100);
    m.noteOff(720, 1, 0, 60);
    m.addTrack("B controls", 1);
    m.programChange(0, 2, 0, 40);
    m.flush();
    const parsed = BasicMIDI.fromArrayBuffer(m.writeMIDI());
    const seq = new SpessaSynthSequencer(new SpessaSynthProcessor(44_100));
    seq.externalMIDIPlayback = true;
    const sent = new Array<number[]>();
    seq.onEventCall = (e) => {
        if (e.type === "midiMessage") sent.push(e.data.message);
    };
    seq.loadNewSongList([parsed]);
    seq.play();
    for (let i = 0; i < 400; i++) seq.processTick();
    const sysEx = sent.filter((msg) => msg[0] === 0xf0);
    // The song loops, so the reset may go out more than once
    const isReset = (msg: number[]) =>
        MIDIUtils.analyzeSysEx(msg.slice(1)).some(
            (r) => r.type === "Global MIDI Param" && r.parameter === "system"
        );
    const program = sent.some((msg) => (msg[0] & 0xf0) === 0xc0);
    check(
        "5. only the reset goes out from port B, no part SysEx and no program change",
        sysEx.length > 0 && sysEx.every((msg) => isReset(msg)) && !program,
        `SysEx ${sysEx.length}, all resets ${sysEx.every((msg) => isReset(msg))}, program ${program}`
    );
}

// 6. No track with notes names a port: a setup track's port says nothing about routing, its setup reaches the notes.
{
    const m = new MIDIBuilder({ name: "ports", format: 1 });
    m.addTrack("setup", 1);
    m.programChange(0, 1, 0, 40);
    m.addTrack("piano", 0);
    // The note track has no port event at all
    const piano = m.tracks[2];
    piano.deleteEvent(
        piano.events.findIndex(
            (e) => e.statusByte === MIDIMessageTypes.midiPort
        )
    );
    m.noteOn(0, 2, 0, 60, 100);
    m.noteOff(240, 2, 0, 60);
    m.flush();
    const { parsed, synths } = run(m);
    check(
        "6. the file is not multi-port",
        !parsed.isMultiPort,
        `isMultiPort ${parsed.isMultiPort}`
    );
    for (const [i, s] of synths.entries()) {
        const label = i === 0 ? "playback" : "seek";
        check(
            `6. the setup reaches the notes (${label})`,
            s.midiChannels.length === 16 &&
                s.midiChannels[0].patch.program === 40,
            `channels ${s.midiChannels.length}, program ${s.midiChannels[0].patch.program}`
        );
    }
}

// 7. A track without a port event uses the lowest port that plays notes,
// Not a starting port that a track switched away from before its notes.
{
    const m = new MIDIBuilder({ name: "ports", format: 1 });
    m.addTrack("starts on 0, plays on 1", 0);
    port(m, 1, 0, 1);
    m.noteOn(0, 1, 0, 60, 100);
    m.noteOff(240, 1, 0, 60);
    m.addTrack("port 2", 2);
    m.noteOn(0, 2, 1, 62, 100);
    m.noteOff(240, 2, 1, 62);
    m.addTrack("no port", 0);
    const noPort = m.tracks[3];
    noPort.deleteEvent(
        noPort.events.findIndex(
            (e) => e.statusByte === MIDIMessageTypes.midiPort
        )
    );
    m.noteOn(0, 3, 2, 64, 100);
    m.noteOff(240, 3, 2, 64);
    m.flush();
    const parsed = BasicMIDI.fromArrayBuffer(m.writeMIDI());
    check(
        "7. the track without a port uses port 1, and port 0 gets no channels",
        parsed.tracks[3].port === 1 &&
            parsed.getPortOffset(1) !== undefined &&
            parsed.getPortOffset(0) === undefined,
        `port ${parsed.tracks[3].port}, offsets ${parsed.getPortOffset(0)} ${parsed.getPortOffset(1)} ${parsed.getPortOffset(2)}`
    );
}

// 8. A stray port event after the last note reserves no channels.
{
    const m = new MIDIBuilder({ name: "ports", format: 1 });
    m.addTrack("notes", 0);
    m.noteOn(0, 1, 0, 60, 100);
    m.noteOff(240, 1, 0, 60);
    port(m, 1, 480, 1);
    m.flush();
    const { parsed, synths } = run(m);
    check(
        "8. the stray port gets no channels, the file is not multi-port",
        parsed.getPortOffset(1) === undefined &&
            !parsed.isMultiPort &&
            synths.every((s) => s.midiChannels.length === 16),
        `offset ${parsed.getPortOffset(1)}, multi-port ${parsed.isMultiPort}`
    );
}

// 9. usedChannels routes like the sequencer: a track starting on a port without notes counts where it plays.
// Testcase: GEOCITIES_MIDI_ARCHIVE/5/5x.MID (starts on port 9, plays on ports 0 to 3)
{
    const m = new MIDIBuilder({ name: "ports", format: 1 });
    m.addTrack("switching", 9);
    port(m, 1, 0, 0);
    m.noteOn(0, 1, 0, 60, 100);
    m.noteOff(240, 1, 0, 60);
    port(m, 1, 480, 1);
    m.noteOn(480, 1, 2, 62, 100);
    m.noteOff(720, 1, 2, 62);
    m.flush();
    const parsed = BasicMIDI.fromArrayBuffer(m.writeMIDI());
    const used = parsed.usedChannels;
    check(
        "9. the used channels are port 0 channel 1 and port 1 channel 3",
        used.size === 2 &&
            used.has(0) &&
            used.has(18) &&
            parsed.getPortOffset(9) === undefined,
        `used ${[...used].join(",")}, port 9 offset ${parsed.getPortOffset(9)}`
    );

    // 10. A copy keeps the routing
    const copy = BasicMIDI.copyFrom(parsed);
    check(
        "10. a copy routes like the original",
        [0, 1, 9].every(
            (p) => copy.getPortOffset(p) === parsed.getPortOffset(p)
        ),
        [0, 1, 9].map((p) => `${p}:${copy.getPortOffset(p)}`).join(" ")
    );
}

// 11. The editor follows the ports too: clearing port B's channel 4 removes the MuseScore-style setup track's
// Program change (port event after it) and port B's notes, port A's channel 4 stays.
{
    const m = new MIDIBuilder({ name: "ports", format: 1 });
    m.addTrack("A notes", 0);
    m.programChange(0, 1, 3, 10);
    m.noteOn(0, 1, 3, 60, 100);
    m.noteOff(240, 1, 3, 60);
    m.addTrack("B setup", 1);
    m.programChange(0, 2, 3, 6);
    const setup = m.tracks[2];
    const portIndex = setup.events.findIndex(
        (e) => e.statusByte === MIDIMessageTypes.midiPort
    );
    const portEvent = setup.events[portIndex];
    setup.deleteEvent(portIndex);
    setup.pushEvents(portEvent);
    m.addTrack("B notes", 1);
    m.noteOn(0, 3, 3, 62, 100);
    m.noteOff(240, 3, 3, 62);
    m.flush();
    const parsed = BasicMIDI.fromArrayBuffer(m.writeMIDI());
    parsed.modify({ channels: new Map([[16 + 3, "clear"]]) });
    const voice = (t: number) =>
        parsed.tracks[t].events.filter(
            (e) => e.statusByte >= 0x80 && e.statusByte < 0xf0
        ).length;
    check(
        "11. port B's channel is cleared everywhere, port A's channel stays",
        voice(2) === 0 && voice(3) === 0 && voice(1) === 3,
        `A ${voice(1)}, B setup ${voice(2)}, B notes ${voice(3)}`
    );
}

// 12. A soft loop jump puts the tracks back on the ports they have at the loop start.
{
    const m = new MIDIBuilder({ name: "ports", format: 1 });
    m.addTrack("switching", 0);
    // RPG Maker loop start (CC 111 = 0), a soft loop. After the track's port event,
    // So the jump does not replay it
    m.controllerChange(5, 1, 0, 111, 0);
    m.programChange(10, 1, 0, 10);
    m.noteOn(20, 1, 0, 60, 100);
    m.noteOff(500, 1, 0, 60);
    port(m, 1, 960, 1);
    m.programChange(970, 1, 0, 30);
    m.noteOn(980, 1, 0, 62, 100);
    m.noteOff(1440, 1, 0, 62);
    m.flush();
    const parsed = BasicMIDI.fromArrayBuffer(m.writeMIDI());
    const synth = new SpessaSynthProcessor(44_100);
    const seq = new SpessaSynthSequencer(synth);
    seq.loopCount = 10;
    seq.loadNewSongList([parsed]);
    seq.play();
    const l = new Float32Array(128);
    const r = new Float32Array(128);
    // The file is 1.5 s long, stop half a second into the second pass (before the port switch).
    // The loop jump moves currentTime back, so count the rendered time instead
    for (let i = 0; i < (2 * 44_100) / 128; i++) {
        seq.processTick();
        synth.process(l, r, 0, 128);
    }
    check(
        "12. after the loop jump the program change goes to port 0 again, port 1 keeps its program",
        parsed.loop.type === "soft" &&
            synth.midiChannels[0].patch.program === 10 &&
            synth.midiChannels[16].patch.program === 30,
        `loop ${parsed.loop.type}, port 0 ${synth.midiChannels[0].patch.program}, port 1 ${synth.midiChannels[16].patch.program}`
    );
}

// 13. The used channels survive a metadata-only copy (spessasynth_lib's MIDIData has no timeline).
{
    class MetadataOnly extends BasicMIDI {
        public copyMetadata(mid: BasicMIDI) {
            this.copyMetadataFrom(mid);
        }
    }
    const m = new MIDIBuilder({ name: "ports", format: 1 });
    m.addTrack("port 1", 1);
    m.noteOn(0, 1, 2, 60, 100);
    m.noteOff(240, 1, 2, 60);
    m.flush();
    const parsed = BasicMIDI.fromArrayBuffer(m.writeMIDI());
    const copy = new MetadataOnly();
    copy.copyMetadata(parsed);
    const used = copy.usedChannels;
    check(
        "13. the copy reports the used channel without a timeline",
        copy.timeline.length === 0 && used.size === 1 && used.has(2),
        `timeline ${copy.timeline.length}, used ${[...used].join(",")}`
    );
}

// 14. A track whose only notes have velocity 0 does not count as playing:
// The setup track's port still says nothing about routing, its setup reaches the notes.
{
    const m = new MIDIBuilder({ name: "ports", format: 1 });
    m.addTrack("note offs only", 3);
    m.addEvent(240, 1, MIDIMessageTypes.noteOn, [60, 0]);
    m.addTrack("setup", 1);
    m.programChange(0, 2, 0, 40);
    m.addTrack("piano", 0);
    const piano = m.tracks[3];
    piano.deleteEvent(
        piano.events.findIndex(
            (e) => e.statusByte === MIDIMessageTypes.midiPort
        )
    );
    m.noteOn(0, 3, 0, 60, 100);
    m.noteOff(240, 3, 0, 60);
    m.flush();
    const { synths } = run(m);
    for (const [i, s] of synths.entries()) {
        const label = i === 0 ? "playback" : "seek";
        check(
            `14. the setup reaches the notes (${label})`,
            s.midiChannels[0].patch.program === 40,
            `program ${s.midiChannels[0].patch.program}`
        );
    }
}

// 15. Ports map from the set of note ports, never the track order. They keep their device position:
// With port 0 among them ports 0 to 3 are A to D, otherwise ports 1 to 4 are (counted from 1),
// Higher ports follow, and a set with no port up to 4 is packed from A
{
    const offsets = (order: number[]) => {
        const m = new MIDIBuilder({ name: "ports", format: 1 });
        for (const [i, p] of order.entries()) {
            m.addTrack(`port ${p}`, p);
            m.noteOn(0, i + 1, 0, 60, 100);
            m.noteOff(240, i + 1, 0, 60);
        }
        m.flush();
        const parsed = BasicMIDI.fromArrayBuffer(m.writeMIDI());
        return order.map((p) => parsed.getPortOffset(p)).join(",");
    };
    check(
        "15. port 1 before port 0 still gives A and B",
        offsets([1, 0]) === "16,0",
        offsets([1, 0])
    );
    check(
        "15. ports 0 and 2 stay A and C",
        offsets([0, 2]) === "0,32",
        offsets([0, 2])
    );
    check(
        "15. ports 2 and 0 stay C and A",
        offsets([2, 0]) === "32,0",
        offsets([2, 0])
    );
    check(
        "15. ports 1 and 2 (counted from 1) give A and B",
        offsets([1, 2]) === "0,16",
        offsets([1, 2])
    );
    check(
        "15. ports 0 and 15 give A and B",
        offsets([0, 15]) === "0,16",
        offsets([0, 15])
    );
    check(
        "15. ports 9 and 7 give B and A",
        offsets([9, 7]) === "16,0",
        offsets([9, 7])
    );
    check(
        "15. ports 0 and 3 stay A and D",
        offsets([0, 3]) === "0,48",
        offsets([0, 3])
    );
    check(
        "15. a port above D follows D, port 3 stays D",
        offsets([0, 3, 4]) === "0,48,64",
        offsets([0, 3, 4])
    );
    check(
        "15. ports 1 and 3 (counted from 1) stay A and C",
        offsets([1, 3]) === "0,32",
        offsets([1, 3])
    );
    check(
        "15. port 2 alone (counted from 1) is B",
        offsets([2]) === "16",
        offsets([2])
    );
    check(
        "15. a port above port 4 follows the ones counted from 1",
        offsets([1, 5]) === "0,16",
        offsets([1, 5])
    );
}

// 16. The analyzer resolves part channels from the port the message arrives on, like the synth
{
    // GS part 1 (channel 0) volume 100
    const gs = [0x41, 0x10, 0x42, 0x12, 0x40, 0x11, 0x19, 0x64, 0x32, 0xf7];
    const channelOf = (port: number) => {
        const r = MIDIUtils.analyzeSysEx(gs, port)[0];
        return "channel" in r ? r.channel : undefined;
    };
    check(
        "16. a GS part message from port B reaches channel 16, from a port without channels none",
        channelOf(0) === 0 && channelOf(1) === 16 && channelOf(-1) === -1,
        `${channelOf(0)} ${channelOf(1)} ${channelOf(-1)}`
    );
}

// 17. Seeking sends part SysEx controllers to the part, not to the channel number the part receives.
// Part 16 (channel 15) receives channel 2 and gets its own pan, part 3 (channel 2) another pan.
// Testcase: GEORGY.MID
{
    const gs = (addr: number[], value: number) =>
        MIDIUtils.gs(addr[0], addr[1], addr[2], [value]);
    const m = new MIDIBuilder({ name: "rx seek", format: 1 });
    m.addTrack("notes", 0);
    m.addEvent(
        0,
        1,
        MIDIMessageTypes.systemExclusive,
        gs([0x40, 0x1f, 0x02], 0x02)
    );
    m.addEvent(
        10,
        1,
        MIDIMessageTypes.systemExclusive,
        gs([0x40, 0x13, 0x1c], 70)
    );
    m.addEvent(
        20,
        1,
        MIDIMessageTypes.systemExclusive,
        gs([0x40, 0x1f, 0x1c], 100)
    );
    m.noteOn(30, 1, 2, 60, 100);
    m.noteOff(960, 1, 2, 60);
    m.flush();
    const { synths } = run(m);
    for (const [i, s] of synths.entries()) {
        const label = i === 0 ? "playback" : "seek";
        const pan = (c: number) => s.midiChannels[c].midiControllers[10] >> 7;
        check(
            `17. a part SysEx pan stays with its part (${label})`,
            pan(15) === 100 && pan(2) === 70,
            `channel 15 ${pan(15)}, channel 2 ${pan(2)}`
        );
    }
}

// 18. Seeking matches playback when the routing or the state changes on the way:
// A controller sent before a part starts receiving its channel doesn't reach that part,
// A reset clears the controllers sent before it, and a part with Rx OFF misses what is sent meanwhile
{
    const gs = (addr: number[], value: number) =>
        MIDIUtils.gs(addr[0], addr[1], addr[2], [value]);
    const m = new MIDIBuilder({ name: "seek state", format: 1 });
    m.addTrack("notes", 0);
    // Part 16 (channel 15) pan before it listens to channel 2: channel 2 pan 30 must not reach it
    m.controllerChange(0, 1, 2, MIDIControllers.pan, 30);
    m.addEvent(
        10,
        1,
        MIDIMessageTypes.systemExclusive,
        gs([0x40, 0x1f, 0x02], 0x02)
    );
    // Channel 4 volume 30, then a GS reset clears it, then part 16 listens to channel 2 again (the reset restored Rx)
    m.controllerChange(20, 1, 4, MIDIControllers.mainVolume, 30);
    m.addEvent(
        30,
        1,
        MIDIMessageTypes.systemExclusive,
        [0x41, 0x10, 0x42, 0x12, 0x40, 0x00, 0x7f, 0x00, 0x41, 0xf7]
    );
    m.addEvent(
        40,
        1,
        MIDIMessageTypes.systemExclusive,
        gs([0x40, 0x1f, 0x02], 0x02)
    );
    // Part 5 (channel 4) pan 20, Rx OFF, channel 4 pan 100, Rx back on: part 5 keeps 20
    m.addEvent(
        50,
        1,
        MIDIMessageTypes.systemExclusive,
        gs([0x40, 0x15, 0x1c], 20)
    );
    m.addEvent(
        60,
        1,
        MIDIMessageTypes.systemExclusive,
        gs([0x40, 0x15, 0x02], 0x10)
    );
    m.controllerChange(70, 1, 4, MIDIControllers.pan, 100);
    m.addEvent(
        80,
        1,
        MIDIMessageTypes.systemExclusive,
        gs([0x40, 0x15, 0x02], 0x04)
    );
    m.noteOn(90, 1, 2, 60, 100);
    m.noteOff(960, 1, 2, 60);
    m.flush();
    const { synths } = run(m);
    for (const [i, s] of synths.entries()) {
        const label = i === 0 ? "playback" : "seek";
        const cc = (c: number, n: number) =>
            s.midiChannels[c].midiControllers[n] >> 7;
        check(
            `18. routing and resets on the way are followed (${label})`,
            cc(15, MIDIControllers.pan) === 64 &&
                cc(4, MIDIControllers.mainVolume) === 100 &&
                cc(4, MIDIControllers.pan) === 20,
            `ch15 pan ${cc(15, MIDIControllers.pan)}, ch4 volume ${cc(4, MIDIControllers.mainVolume)}, ch4 pan ${cc(4, MIDIControllers.pan)}`
        );
    }
}

// 19. A reset message the synth ignores (GS reset with data 01) doesn't make the seek drop the saved controllers
{
    const m = new MIDIBuilder({ name: "ignored reset", format: 1 });
    m.addTrack("notes", 0);
    m.controllerChange(0, 1, 1, MIDIControllers.mainVolume, 30);
    m.addEvent(
        10,
        1,
        MIDIMessageTypes.systemExclusive,
        MIDIUtils.gs(0x40, 0x00, 0x7f, [0x01])
    );
    m.noteOn(20, 1, 1, 60, 100);
    m.noteOff(960, 1, 1, 60);
    m.flush();
    const { synths } = run(m);
    for (const [i, s] of synths.entries()) {
        const label = i === 0 ? "playback" : "seek";
        const volume =
            s.midiChannels[1].midiControllers[MIDIControllers.mainVolume] >> 7;
        check(
            `19. an ignored reset keeps the controllers (${label})`,
            volume === 30,
            `volume ${volume}`
        );
    }
}

// 22. After an internal seek, the controller events report the values the synth has (a reset in between changed them),
// And a note held at the seek point isn't struck when playback resumes
{
    const m = new MIDIBuilder({ name: "seek events", format: 1 });
    m.addTrack("notes", 0);
    m.controllerChange(0, 1, 0, MIDIControllers.pan, 0);
    m.addEvent(
        10,
        1,
        MIDIMessageTypes.systemExclusive,
        MIDIUtils.gs(0x40, 0x00, 0x7f, [0x00])
    );
    // A long note held over the seek point
    m.noteOn(20, 1, 1, 60, 100);
    m.noteOff(1900, 1, 1, 60);
    m.noteOn(1910, 1, 0, 62, 100);
    m.noteOff(1920, 1, 0, 62);
    m.flush();
    const parsed = BasicMIDI.fromArrayBuffer(m.writeMIDI());
    const synth = new SpessaSynthProcessor(44_100);
    const seq = new SpessaSynthSequencer(synth);
    seq.loadNewSongList([parsed]);
    seq.pause();
    let pan: number | undefined;
    synth.onEventCall = (e) => {
        if (
            e.type === "controllerChange" &&
            e.data.channel === 0 &&
            e.data.controller === MIDIControllers.pan
        )
            pan = e.data.value;
    };
    seq.currentTime = parsed.midiTicksToSeconds(500);
    // Play strikes the notes the sequencer holds as playing (no sound bank here, so it is checked directly)
    const held = (
        seq as unknown as { playingNotes: Map<number, number>[] }
    ).playingNotes.reduce((n, m) => n + m.size, 0);
    seq.play();
    const l = new Float32Array(128);
    const r = new Float32Array(128);
    for (let i = 0; i < 10; i++) {
        seq.processTick();
        synth.process(l, r, 0, 128);
    }
    const struck = held > 0;
    check(
        "22. seek events carry the final values and held notes are not struck again",
        pan === 64 && !struck,
        `pan event ${pan}, note struck ${struck}`
    );
}

console.info(failed === 0 ? "\nAll passed." : `\n${failed} failed.`);
if (failed > 0) process.exit(1);
