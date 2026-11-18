// FilterQOffset: added to the clamped initialFilterQ, so the resonance can go below 0
import { type GeneratorType, GeneratorTypes } from "../../../src";
import {
    check,
    checkStorage,
    finish,
    levelDb,
    makeBank,
    maxDifference,
    noiseSample,
    note,
    renderLeft,
    sineSample
} from "./sfe_test_utils";

const play = (gens: Partial<Record<GeneratorType, number>>, noise = false) =>
    renderLeft(
        makeBank(noise ? noiseSample() : sineSample(), gens),
        note(0, 2, noise ? 60 : 69),
        1
    );
const level = (b: Float32Array) => levelDb(b, 0.2, 1);

const plain = await play({});
check(
    maxDifference(await play({ [GeneratorTypes.filterQOffset]: 0 }), plain) ===
        0,
    "an offset of 0 changes nothing"
);

// 100 + -100 sums to 0, so the open filter is still skipped
const summed = await play({
    [GeneratorTypes.initialFilterQ]: 100,
    [GeneratorTypes.filterQOffset]: -100
});
check(
    maxDifference(summed, plain) === 0,
    "initialFilterQ 100 and an offset of -100 sound like no resonance"
);

// -30 cB is Q 0.5: the SF2 gain rule boosts a 440 Hz sine by 1.5 dB under an open filter
const boost =
    level(await play({ [GeneratorTypes.filterQOffset]: -30 })) - level(plain);
check(
    Math.abs(boost - 1.5) < 0.2,
    `an offset of -30 raises the passband by 1.5 dB (${boost.toFixed(2)} dB)`
);

// A low Q rounds off the knee, so noise through a 5000 cent lowpass gets quieter
const knee = { [GeneratorTypes.initialFilterFc]: 5000 };
const butterworth = await play(knee, true);
const soft = await play(
    { ...knee, [GeneratorTypes.filterQOffset]: -100 },
    true
);
// Undo the +5 dB of the gain rule to compare the shapes only
const softer = level(soft) - 5 - level(butterworth);
check(
    softer < -1,
    `a Q below 0.707 lets less through above the cutoff (${softer.toFixed(2)} dB)`
);

checkStorage(makeBank(sineSample(), { [GeneratorTypes.filterQOffset]: -29 }), [
    GeneratorTypes.filterQOffset
]);
finish("filter_q_offset_test");
