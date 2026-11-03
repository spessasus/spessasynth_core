// The second modulation envelope: pitch and filter depths
import { type GeneratorType, GeneratorTypes } from "../../../src";
import {
    check,
    checkStorage,
    finish,
    frequency,
    levelDb,
    makeBank,
    note,
    noiseSample,
    renderLeft,
    sineSample
} from "./sfe_test_utils";

// Hold 0.3 s (-2084 timecents) at full level, then drop to 0 right away
const env2 = {
    [GeneratorTypes.holdModEnv2]: -2084,
    [GeneratorTypes.sustainModEnv2]: 1000
};
const cents = (hz: number) => 1200 * Math.log2(hz / 440);
const pitchAt = (b: Float32Array, from: number, to: number) =>
    cents(frequency(b, from, to));

console.info("Pitch:");
const pitched = await renderLeft(
    makeBank(sineSample(), { ...env2, [GeneratorTypes.modEnv2ToPitch]: 1200 }),
    note(0),
    1
);
check(
    Math.abs(pitchAt(pitched, 0.05, 0.25) - 1200) < 5,
    `an octave up while held (${pitchAt(pitched, 0.05, 0.25).toFixed(1)} cents)`
);
check(
    Math.abs(pitchAt(pitched, 0.4, 0.9)) < 5,
    `back to the base pitch after (${pitchAt(pitched, 0.4, 0.9).toFixed(1)} cents)`
);

console.info("Both envelopes:");
// Env 1: +1200 for 0.3 s. Env 2: +700 for 0.6 s (-884 timecents)
const both = await renderLeft(
    makeBank(sineSample(), {
        [GeneratorTypes.holdModEnv]: -2084,
        [GeneratorTypes.sustainModEnv]: 1000,
        [GeneratorTypes.modEnvToPitch]: 1200,
        [GeneratorTypes.holdModEnv2]: -884,
        [GeneratorTypes.sustainModEnv2]: 1000,
        [GeneratorTypes.modEnv2ToPitch]: 700
    }),
    note(0),
    1
);
const segments: [number, number, number][] = [
    [0.05, 0.25, 1900],
    [0.35, 0.55, 700],
    [0.7, 0.95, 0]
];
for (const [from, to, expected] of segments) {
    const got = pitchAt(both, from, to);
    check(
        Math.abs(got - expected) < 5,
        `${from} to ${to} s: ${got.toFixed(1)} cents, expected ${expected}`
    );
}

console.info("Release:");
// Sustains at full level, releases over 1 s (0 timecents) from note off at 0.3 s
const released = await renderLeft(
    makeBank(sineSample(), {
        [GeneratorTypes.releaseModEnv2]: 0,
        [GeneratorTypes.modEnv2ToPitch]: 1200,
        [GeneratorTypes.releaseVolEnv]: 1200
    }),
    note(0, 0.3),
    1
);
const releasing = pitchAt(released, 0.75, 0.85);
check(
    Math.abs(releasing - 1200 * (1 - 0.5)) < 30,
    `the release glides down (${releasing.toFixed(1)} cents halfway)`
);

console.info("Filter:");
const filtered = await renderLeft(
    makeBank(noiseSample(), {
        ...env2,
        [GeneratorTypes.initialFilterFc]: 5000,
        [GeneratorTypes.modEnv2ToFilterFc]: 6000
    }),
    note(0, undefined, 60),
    1
);
const opened = levelDb(filtered, 0.05, 0.25) - levelDb(filtered, 0.5, 0.9);
check(
    opened > 6,
    `the filter is open while held (${opened.toFixed(1)} dB louder)`
);

const all: Partial<Record<GeneratorType, number>> = {
    [GeneratorTypes.delayModEnv2]: -3000,
    [GeneratorTypes.attackModEnv2]: -4000,
    [GeneratorTypes.holdModEnv2]: -2084,
    [GeneratorTypes.decayModEnv2]: -1000,
    [GeneratorTypes.sustainModEnv2]: 300,
    [GeneratorTypes.releaseModEnv2]: -500,
    [GeneratorTypes.keyNumToModEnv2Hold]: 20,
    [GeneratorTypes.keyNumToModEnv2Decay]: -20,
    [GeneratorTypes.modEnv2ToPitch]: 500,
    [GeneratorTypes.modEnv2ToFilterFc]: -500
};
checkStorage(
    makeBank(sineSample(), all),
    Object.keys(all).map((t) => Number(t) as GeneratorType)
);
finish("mod_env2_test");
