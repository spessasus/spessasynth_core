import {
    MIDIMessageTypes,
    MIDIUtils,
    type ModifyMIDIOptions
} from "../../../src";
import { MIDITestMaker } from "../../midi_file/midi_test_maker";
import { runMIDIEditorTest } from "./run_midi_editor_test";

// Patch + reverb locks, shared by most tests
const lockOpts: ModifyMIDIOptions = {
    channels: new Map([
        [
            0,
            {
                patch: {
                    bankMSB: 1,
                    bankLSB: 0,
                    program: 5,
                    isGMGSDrum: false
                }
            }
        ]
    ]),
    reverbParams: {
        level: 100,
        character: 1,
        delayFeedback: 45,
        preDelayTime: 76,
        preLowpass: 2,
        time: 64
    }
};

// 1. Same-tick GS + GS  (constructor adds the first GS reset).
// Expect: both kept. The first is meaningless (no notes between the two),
// So one program and one reverb setup, both after the second reset.
{
    console.info("\n===== 1. duplicate GS =====");
    const midi = new MIDITestMaker("Reset: duplicate GS at the start");
    midi.tracks[0].pushEvents(MIDIUtils.reset(0, "gs"));
    midi.note(60, 100).flush();
    runMIDIEditorTest(midi, lockOpts);
}

// 2. Same-tick mixed GS -> XG.
// Expect: both kept in order. The GS is meaningless,
// So one program and one reverb setup, both after XG.
{
    console.info("\n===== 2. mixed GS + XG =====");
    const midi = new MIDITestMaker("Reset: mixed GS -> XG at the start");
    midi.tracks[0].pushEvents(MIDIUtils.reset(0, "xg"));
    midi.note(60, 100).flush();
    runMIDIEditorTest(midi, lockOpts);
}

// 3. Same-tick mixed XG -> GS.
// Expect: both kept in order. The XG is meaningless,
// So one program and one reverb setup, both after GS.
{
    console.info("\n===== 3. mixed XG + GS =====");
    const midi = new MIDITestMaker("Reset: mixed XG -> GS at the start", {
        system: "xg"
    });
    midi.tracks[0].pushEvents(MIDIUtils.reset(0, "gs"));
    midi.note(60, 100).flush();
    runMIDIEditorTest(midi, lockOpts);
}

// 4. Mid-file duplicate GS reset.
// Expect: both kept and both meaningful (notes come after each),
// So program and reverb setup are re-applied after every reset.
{
    console.info("\n===== 4. mid-file duplicate GS =====");
    const midi = new MIDITestMaker("Reset: mid-file duplicate GS");
    midi.note(60, 100).reset("gs").note(62, 100).flush();
    runMIDIEditorTest(midi, lockOpts);
}

// 5. Mid-file GM reset (notes come after it, so it's considered as meaningful).
// Expect: GM replaced with GS in place, so GS -> GS
// With two programs and two reverb setups (one after each reset).
{
    console.info("\n===== 5. mid-file GM =====");
    const midi = new MIDITestMaker("Reset: mid-file GM");
    midi.note(60, 100).reset("gm").note(62, 100).flush();
    runMIDIEditorTest(midi, lockOpts);
}

// 6. Trailing GM2 reset.
// Expect: GM2 is valid like GS/XG, so GS -> GM2
// With two programs and two reverb setups (one after each reset).
{
    console.info("\n===== 6. trailing GM2 =====");
    const midi = new MIDITestMaker("Reset: trailing GM2");
    midi.note(60, 100).reset("gm2").note(62, 100).flush();
    runMIDIEditorTest(midi, lockOpts);
}

// 7. Mid-file GS -> XG.
// Expect: both kept and both meaningful,
// So program and reverb setup are re-applied after every reset.
{
    console.info("\n===== 7. mid-file GS + XG =====");
    const midi = new MIDITestMaker("Reset: mid-file GS -> XG");
    midi.note(60, 100).reset("xg").note(62, 100).flush();
    runMIDIEditorTest(midi, lockOpts);
}

// 8. Explicit system lock replaces the file's reset.
// Expect: single XG reset.
{
    console.info("\n===== 8. explicit system lock to XG =====");
    const midi = new MIDITestMaker("Reset: explicit system lock");
    midi.note(60, 100).flush();
    runMIDIEditorTest(midi, {
        channels: new Map([
            [
                0,
                {
                    patch: {
                        bankMSB: 0,
                        bankLSB: 0,
                        program: 5,
                        isGMGSDrum: false
                    }
                }
            ]
        ]),
        midiParams: { system: "xg" }
    });
}

// 9. GM followed by GS before any notes.
// Expect: GM is meaningless here (a reset comes before any notes),
// So it's left as is: GM -> GS, with the setup after GS only.
{
    console.info("\n===== 9. GM + GS at the start =====");
    const midi = new MIDITestMaker("Reset: GM -> GS at the start", {
        system: "gm"
    });
    midi.tracks[0].pushEvents(MIDIUtils.reset(0, "gs"));
    midi.note(60, 100).flush();
    runMIDIEditorTest(midi, lockOpts);
}

// 10. GS followed by GM before any notes.
// Expect: GS is meaningless, GM is meaningful (notes come after it),
// So GM is replaced with GS in place: GS -> GS,
// With the setup after the replaced reset only.
{
    console.info("\n===== 10. GS + GM at the start =====");
    const midi = new MIDITestMaker("GS -> GM at the start");
    midi.tracks[0].pushEvents(MIDIUtils.reset(0, "gm"));
    midi.note(60, 100).flush();
    runMIDIEditorTest(midi, lockOpts);
}

// 11. Sole GM before the first note on.
// Expect: replaced with GS in place at the same tick time,
// With the setup inserted right after it.
{
    console.info("\n===== 11. sole GM replaced with GS =====");
    const midi = new MIDITestMaker("Sole GM replaced", {
        system: "gm"
    });
    for (const e of midi.tracks[0].events) {
        if (e.statusByte === MIDIMessageTypes.systemExclusive) {
            e.ticks = 240;
        }
    }
    midi.note(60, 100).flush();
    runMIDIEditorTest(midi, lockOpts);
}

// 12. GM, then notes, then GS.
// Expect: GM replaced with GS in place, so GS -> GS
// With two programs and two reverb setups (one after each reset).
{
    console.info("\n===== 12. GM, notes, then GS =====");
    const midi = new MIDITestMaker("GM -> notes -> GS", { system: "gm" });
    midi.note(60, 100).reset("gs").note(62, 100).flush();
    runMIDIEditorTest(midi, lockOpts);
}

// 13. Relative tuning across a mid-file reset.
// Expect: the RPN fine-tuning group inserted twice with identical values.
{
    console.info("\n===== 13. relative tuning added once =====");
    const midi = new MIDITestMaker("Tuning applied once");
    midi.note(60, 100).reset("gs").note(62, 100).flush();
    runMIDIEditorTest(midi, {
        channels: new Map([[0, { fineTune: 60, midiParams: { fineTune: 10 } }]])
    });
}

// 14. System cleared: every reset is deleted,
// Locked setup is inserted before the first note on without any reset.
{
    console.info("\n===== 14. system cleared =====");
    const midi = new MIDITestMaker("System cleared");
    midi.note(60, 100).reset("xg").note(62, 100).flush();
    runMIDIEditorTest(midi, {
        channels: lockOpts.channels,
        reverbParams: lockOpts.reverbParams,
        midiParams: { system: "clear" }
    });
}

// 15. System locked to a value: every reset is replaced with it in place.
// Expect: XG -> XG, programs and reverb setups re-applied after every reset.
{
    console.info("\n===== 15. system locked to XG =====");
    const midi = new MIDITestMaker("System locked");
    midi.note(60, 100).reset("xg").note(62, 100).flush();
    runMIDIEditorTest(midi, {
        channels: lockOpts.channels,
        reverbParams: lockOpts.reverbParams,
        midiParams: { system: "xg" }
    });
}

// 16. Trailing GM reset (no notes come after it, so it's considered as meaningless).
// Expect: left as is: GS -> GM, setups only after the meaningful GS reset.
{
    console.info("\n===== 16. trailing GM =====");
    const midi = new MIDITestMaker("reset: trailing GM");
    midi.note(60, 100).reset("gm").flush();
    runMIDIEditorTest(midi, lockOpts);
}
