// IgnoreNoteOff: the voice keeps playing after note off and after the sustain pedal is released
import {
    GeneratorTypes,
    MIDIControllers,
    type SpessaSynthProcessor
} from "../../../src";
import {
    check,
    checkStorage,
    finish,
    levelDb,
    makeBank,
    note,
    render,
    sineSample
} from "./sfe_test_utils";

const normal = makeBank(sineSample());
const ignoring = makeBank(sineSample(), {
    [GeneratorTypes.ignoreNoteOff]: 1
});

console.info("Note off:");
const a = await render(normal, note(0, 0.2), 1);
const b = await render(ignoring, note(0, 0.2), 1);
const playing = levelDb(b.left, 0.1, 0.2);
check(levelDb(a.left, 0.5, 1) < -90, "a normal voice is released");
check(
    Math.abs(levelDb(b.left, 0.5, 1) - playing) < 0.1,
    `the voice ignores note off (${levelDb(b.left, 0.5, 1).toFixed(2)} dB, ${playing.toFixed(2)} dB while held)`
);

console.info("Sustain pedal:");
const events = [
    ...note(0, 0.2),
    {
        time: 0.1,
        run: (s: SpessaSynthProcessor) =>
            s.controllerChange(0, MIDIControllers.sustainPedal, 127)
    },
    {
        time: 0.4,
        run: (s: SpessaSynthProcessor) =>
            s.controllerChange(0, MIDIControllers.sustainPedal, 0)
    }
];
const c = await render(normal, events, 1);
const d = await render(ignoring, events, 1);
check(
    Math.abs(levelDb(c.left, 0.3, 0.4) - playing) < 0.1 &&
        levelDb(c.left, 0.6, 1) < -90,
    "a normal voice is held by the pedal, then released"
);
check(
    Math.abs(levelDb(d.left, 0.6, 1) - playing) < 0.1,
    "the voice ignores the pedal release too"
);

console.info("Ending on its own:");
// Decays to silence, so the voice ends even without a release
const decaying = makeBank(sineSample(), {
    [GeneratorTypes.ignoreNoteOff]: 1,
    [GeneratorTypes.sustainVolEnv]: 1440,
    [GeneratorTypes.decayVolEnv]: -1200
});
const e = await render(decaying, note(0, 0.01), 2);
const decayingNormal = makeBank(sineSample(), {
    [GeneratorTypes.sustainVolEnv]: 1440,
    [GeneratorTypes.decayVolEnv]: -1200
});
const eNormal = await render(decayingNormal, note(0, 0.01), 2);
check(e.voicesAtEnd === 0, "the voice ends when its envelope does");
// The decay takes 0.5 s for 100 dB, so it is 20 to 30 dB down at 0.1 s
const decayLevel = levelDb(e.left, 0.1, 0.15) - playing;
check(
    decayLevel > -35 && decayLevel < -15,
    `a zero length note still plays its decay (${decayLevel.toFixed(1)} dB)`
);
check(
    levelDb(eNormal.left, 0.1, 0.15) < -90,
    "a normal zero length note is released"
);

console.info("Stop all:");
const f = await render(
    ignoring,
    [
        ...note(0),
        {
            time: 0.2,
            run: (s: SpessaSynthProcessor) => s.stopAll()
        }
    ],
    1
);
check(levelDb(f.left, 0.5, 1) < -90, "stopping all notes still releases it");

checkStorage(ignoring, [GeneratorTypes.ignoreNoteOff]);
finish("ignore_note_off_test");
