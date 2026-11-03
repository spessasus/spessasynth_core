// Decay2VolEnv and sustain2VolEnv: a second decay segment from sustain to sustain + sustain2
import { type GeneratorType, GeneratorTypes } from "../../../src";
import {
    check,
    checkStorage,
    finish,
    levelDb,
    makeBank,
    note,
    render,
    renderLeft,
    sineSample
} from "./sfe_test_utils";

const play = async (
    gens: Partial<Record<GeneratorType, number>>,
    length?: number
) => renderLeft(makeBank(sineSample(), gens), note(0, length), 1);

const peak = levelDb(await play({}), 0.05, 0.1);
const at = (b: Float32Array, t: number) => levelDb(b, t, t + 0.005) - peak;

// Decay 1: 0.25 s per 100 dB down to 20 dB, so it takes 0.052 s
// Decay 2: 1 s per 100 dB, 30 dB more, so it takes 0.3125 s
const DECAY1_END = (0.25 * 200) / 960;
const DECAY2_LENGTH = 300 / 960;
const base = {
    [GeneratorTypes.decayVolEnv]: -2400,
    [GeneratorTypes.sustainVolEnv]: 200
};
const twoSegments = {
    ...base,
    [GeneratorTypes.decay2VolEnv]: 0,
    [GeneratorTypes.sustain2VolEnv]: 300
};

console.info("Falling:");
const one = await play(base);
const two = await play(twoSegments);
check(
    Math.abs(at(one, 0.5) + 20) < 0.5,
    `one segment stays at -20 dB (${at(one, 0.5).toFixed(2)})`
);
for (const t of [0.1, 0.2, 0.3]) {
    const expected = -20 - (30 * (t - DECAY1_END)) / DECAY2_LENGTH;
    check(
        Math.abs(at(two, t) - expected) < 1,
        `at ${t} s: ${at(two, t).toFixed(2)} dB, expected ${expected.toFixed(2)}`
    );
}
check(
    Math.abs(at(two, 0.6) + 50) < 0.5,
    `ends at -50 dB (${at(two, 0.6).toFixed(2)})`
);
check(Math.abs(at(two, 0.9) + 50) < 0.5, "and stays there");

console.info("Rising:");
const rising = await play({
    ...base,
    [GeneratorTypes.decay2VolEnv]: 0,
    [GeneratorTypes.sustain2VolEnv]: -150
});
check(
    Math.abs(at(rising, 0.5) + 5) < 0.5,
    `a negative sustain 2 rises to -5 dB (${at(rising, 0.5).toFixed(2)})`
);

console.info("Release:");
// Slow release so the level right after note off can be compared
const released = await play(
    { ...twoSegments, [GeneratorTypes.releaseVolEnv]: 0 },
    0.2
);
const before = levelDb(released, 0.19, 0.2) - peak;
const after = levelDb(released, 0.2, 0.21) - peak;
check(
    Math.abs(after - before) < 1.5 && at(released, 0.5) < at(two, 0.5) - 5,
    `the release starts from the decay 2 level (${before.toFixed(2)} dB before, ${after.toFixed(2)} dB after)`
);

console.info("Silent sustain 2:");
const silent = await render(
    makeBank(sineSample(), {
        ...base,
        [GeneratorTypes.decay2VolEnv]: -2400,
        [GeneratorTypes.sustain2VolEnv]: 1000
    }),
    note(0),
    1
);
check(silent.voicesAtEnd === 0, "a voice that decays to silence ends");

checkStorage(makeBank(sineSample(), twoSegments), [
    GeneratorTypes.decay2VolEnv,
    GeneratorTypes.sustain2VolEnv
]);
finish("decay2_test");
