// LFO fade in, waveform and start phase, measured on a tremolo (LFO to volume)
import { type GeneratorType, GeneratorTypes } from "../../../src";
import {
    check,
    checkStorage,
    finish,
    levelDb,
    makeBank,
    note,
    renderLeft,
    sineSample
} from "./sfe_test_utils";

const WINDOW = 0.01;

/**
 * The level in dB of each 10 ms window.
 */
function levels(buffer: Float32Array, from: number, to: number) {
    const out = new Array<number>();
    for (let t = from; t + WINDOW <= to; t += WINDOW)
        out.push(levelDb(buffer, t, t + WINDOW));
    return out;
}

const swing = (l: number[]) => Math.max(...l) - Math.min(...l);
const maxStep = (l: number[]) => {
    let step = 0;
    for (let i = 1; i < l.length; i++)
        step = Math.max(step, Math.abs(l[i] - l[i - 1]));
    return step;
};

const lfos = [
    {
        name: "mod LFO",
        freq: GeneratorTypes.freqModLFO,
        toVolume: GeneratorTypes.modLfoToVolume,
        fade: GeneratorTypes.fadeModLFO,
        waveform: GeneratorTypes.modLfoWaveform,
        phase: GeneratorTypes.modLfoStartPhase
    },
    {
        name: "vibrato LFO",
        freq: GeneratorTypes.freqVibLFO,
        toVolume: GeneratorTypes.vibLfoToVolume,
        fade: GeneratorTypes.fadeVibLFO,
        waveform: GeneratorTypes.vibLfoWaveform,
        phase: GeneratorTypes.vibLfoStartPhase
    }
];

const reference = await renderLeft(makeBank(sineSample()), note(0), 0.2);
const referenceLevel = levelDb(reference, 0.05, 0.2);

const play = (gens: Partial<Record<GeneratorType, number>>) =>
    renderLeft(makeBank(sineSample(), gens), note(0), 2);

/**
 * The level in the first 50 ms, relative to a voice without the LFO.
 */
const firstLevel = (b: Float32Array) => levelDb(b, 0.02, 0.05) - referenceLevel;

for (const lfo of lfos) {
    console.info(`${lfo.name}:`);
    // About 4 Hz, 12 dB each way
    const tremolo: Partial<Record<GeneratorType, number>> = {
        [lfo.freq]: -1238,
        [lfo.toVolume]: 120
    };

    // Fade in over one second (0 timecents)
    const plain = await play(tremolo);
    const faded = await play({ ...tremolo, [lfo.fade]: 0 });
    const early = swing(levels(faded, 0, 0.25));
    const full = swing(levels(plain, 0, 0.25));
    const late = swing(levels(faded, 1.25, 1.75));
    check(
        early < 0.4 * full,
        `fade: ${early.toFixed(1)} dB swing in the first 0.25 s, ${full.toFixed(1)} dB without fade`
    );
    check(
        Math.abs(late - swing(levels(plain, 1.25, 1.75))) < 1,
        `fade: full depth after the fade (${late.toFixed(1)} dB)`
    );

    // Sawtooth jumps once per cycle, triangle does not
    const saw = await play({ ...tremolo, [lfo.waveform]: 1 });
    const triangleStep = maxStep(levels(plain, 0.05, 1));
    const sawStep = maxStep(levels(saw, 0.05, 1));
    check(
        triangleStep < 4 && sawStep > 10,
        `waveform: largest 10 ms step ${triangleStep.toFixed(1)} dB (triangle), ${sawStep.toFixed(1)} dB (sawtooth)`
    );
    check(
        Math.abs(swing(levels(saw, 0.05, 1)) - swing(levels(plain, 0.05, 1))) <
            2,
        "waveform: the same depth"
    );

    // Start phase: a positive depth gets louder first by default, 180 degrees gets quieter first, 90 starts at the top
    const opposite = await play({ ...tremolo, [lfo.phase]: 180 });
    const quarter = await play({ ...tremolo, [lfo.phase]: 90 });
    check(
        firstLevel(plain) > 2 && firstLevel(opposite) < -2,
        `phase: ${firstLevel(plain).toFixed(1)} dB (0), ${firstLevel(opposite).toFixed(1)} dB (180)`
    );
    const quarterStart = levelDb(quarter, 0, 0.01) - referenceLevel;
    check(
        quarterStart > 8,
        `phase: 90 degrees starts near the top (${quarterStart.toFixed(1)} dB)`
    );
}

const bank = makeBank(sineSample(), {
    [GeneratorTypes.fadeVibLFO]: 100,
    [GeneratorTypes.fadeModLFO]: -100,
    [GeneratorTypes.vibLfoWaveform]: 1,
    [GeneratorTypes.modLfoWaveform]: 1,
    [GeneratorTypes.vibLfoStartPhase]: 45,
    [GeneratorTypes.modLfoStartPhase]: 300
});
checkStorage(bank, [
    GeneratorTypes.fadeVibLFO,
    GeneratorTypes.fadeModLFO,
    GeneratorTypes.vibLfoWaveform,
    GeneratorTypes.modLfoWaveform,
    GeneratorTypes.vibLfoStartPhase,
    GeneratorTypes.modLfoStartPhase
]);
finish("lfo_test");
