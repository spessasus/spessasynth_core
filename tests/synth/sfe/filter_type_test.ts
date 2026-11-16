// FilterType: the RBJ highpass, bandpass, peak and notch, measured with a sine at, below and above the cutoff
import { type GeneratorType, GeneratorTypes } from "../../../src";
import {
    check,
    checkStorage,
    finish,
    levelDb,
    makeBank,
    maxDifference,
    note,
    renderLeft,
    sineSample
} from "./sfe_test_utils";

// The sine is 440 Hz at key 69, and 6900 cents is 440 Hz, so key 69 sits at the cutoff
const CUTOFF = { [GeneratorTypes.initialFilterFc]: 6900 };
const play = (gens: Partial<Record<GeneratorType, number>>, key = 69) =>
    renderLeft(makeBank(sineSample(), gens), note(0, 2, key), 1);
const level = (b: Float32Array) => levelDb(b, 0.3, 1);

// The unfiltered sine at each key, as the reference
const keys = [45, 69, 93];
const reference = new Map<number, number>();
for (const key of keys) reference.set(key, level(await play({}, key)));

const response = async (
    type: number,
    key: number,
    extra: Partial<Record<GeneratorType, number>> = {}
) =>
    level(
        await play(
            { ...CUTOFF, [GeneratorTypes.filterType]: type, ...extra },
            key
        )
    ) - (reference.get(key) ?? 0);

const near = (value: number, expected: number, tolerance: number) =>
    Math.abs(value - expected) < tolerance;
const show = (v: number) => `${v.toFixed(2)} dB`;

console.info("Lowpass (type 0):");
const lpCut = await response(0, 69);
check(near(lpCut, -3.01, 0.3), `-3 dB at the cutoff (${show(lpCut)})`);
const lpDefault = await play(CUTOFF);
check(
    maxDifference(
        await play({ ...CUTOFF, [GeneratorTypes.filterType]: 0 }),
        lpDefault
    ) === 0,
    "type 0 is the SF2 lowpass"
);

console.info("Highpass (type 1):");
const hpCut = await response(1, 69);
const hpAbove = await response(1, 93);
const hpBelow = await response(1, 45);
check(near(hpCut, -3.01, 0.3), `-3 dB at the cutoff (${show(hpCut)})`);
check(near(hpAbove, 0, 0.3), `passes two octaves above (${show(hpAbove)})`);
check(near(hpBelow, -24, 1), `-24 dB two octaves below (${show(hpBelow)})`);
const hpOpen = await response(1, 69, {
    [GeneratorTypes.initialFilterFc]: 13_500
});
check(hpOpen < -40, `an open highpass is not skipped (${show(hpOpen)})`);

console.info("Bandpass (type 2):");
// Resonance 200 cB is Q 7.07: the peak is Q (+17 dB) less the SF2 reduction of 10 dB
const q200 = { [GeneratorTypes.initialFilterQ]: 200 };
const bpCut = await response(2, 69, q200);
const bpAbove = await response(2, 93, q200);
check(
    near(bpCut, 6.99, 0.3),
    `+7 dB at the cutoff with Q 7.07 (${show(bpCut)})`
);
check(bpAbove < -10, `falls off two octaves above (${show(bpAbove)})`);

console.info("Peak (type 3):");
const pkCut = await response(3, 69, q200);
const pkBelow = await response(3, 45, q200);
const pkAbove = await response(3, 93, q200);
check(near(pkCut, 13, 0.3), `2Q less 10 dB at the cutoff (${show(pkCut)})`);
// Two octaves out the skirt is still 1.08 dB up: |w^2 + w^2/16| / |w^2 - w^2/16 + j * w^2/(4Q)|
check(
    near(pkBelow, -8.92, 0.2),
    `the skirt less 10 dB, two octaves below (${show(pkBelow)})`
);
check(
    near(pkAbove, -8.92, 0.2),
    `the skirt less 10 dB, two octaves above (${show(pkAbove)})`
);

console.info("Notch (type 4):");
const ntCut = await response(4, 69);
const ntAbove = await response(4, 93);
check(ntCut < -30, `a zero at the cutoff (${show(ntCut)})`);
check(near(ntAbove, 0, 0.6), `passes two octaves above (${show(ntAbove)})`);

console.info("Gain:");
const plain = reference.get(69) ?? 0;
const louder = level(await play({ [GeneratorTypes.gain]: 60 })) - plain;
const quieter = level(await play({ [GeneratorTypes.gain]: -60 })) - plain;
check(near(louder, 6, 0.05), `gain 60 cB is +6 dB (${show(louder)})`);
check(near(quieter, -6, 0.05), `gain -60 cB is -6 dB (${show(quieter)})`);

checkStorage(
    makeBank(sineSample(), {
        [GeneratorTypes.filterType]: 3,
        [GeneratorTypes.gain]: 120
    }),
    [GeneratorTypes.filterType, GeneratorTypes.gain]
);
finish("filter_type_test");
