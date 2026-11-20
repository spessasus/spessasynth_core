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

// 100 + -100 sums to 0, so the response has no peak, but initialFilterQ still lowers the level by 100 / 20 = 5 dB
// (SFe 4.0, section 7.1.1, filterQOffset does not change the gain)
const summed = await play({
    [GeneratorTypes.initialFilterQ]: 100,
    [GeneratorTypes.filterQOffset]: -100
});
const summedDrop = level(summed) - level(plain);
check(
    Math.abs(summedDrop + 5) < 0.2,
    `initialFilterQ 100 and an offset of -100 have no peak and are 5 dB quieter (${summedDrop.toFixed(2)} dB)`
);

// -30 cB is Q 0.5. A negative resonance no longer boosts the level, the gain comes from initialFilterQ alone
const boost =
    level(await play({ [GeneratorTypes.filterQOffset]: -30 })) - level(plain);
check(
    Math.abs(boost) < 0.2,
    `an offset of -30 does not raise the passband (${boost.toFixed(2)} dB)`
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
