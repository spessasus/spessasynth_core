// -32768 timecents is zero time: with no delay and no attack the voice starts at its peak
import { GeneratorTypes } from "../../../src";
import {
    check,
    finish,
    makeBank,
    maxDifference,
    note,
    renderLeft,
    sineSample
} from "./sfe_test_utils";

const play = (attack: number) =>
    renderLeft(
        makeBank(sineSample(), {
            [GeneratorTypes.attackVolEnv]: attack,
            [GeneratorTypes.delayVolEnv]: -32_768
        }),
        note(0, 0.5),
        0.1
    );

// The peak of the first 32 samples against the steady level later on
const peak = (b: Float32Array, from: number, to: number) => {
    let max = 0;
    for (let i = from; i < to; i++) max = Math.max(max, Math.abs(b[i]));
    return max;
};

const instant = await play(-32_768);
const steady = peak(instant, 2000, 4000);
const firstInstant = peak(instant, 0, 32);
check(
    firstInstant > steady * 0.95,
    `-32768 starts at the peak (${(firstInstant / steady).toFixed(3)} of the steady level in the first 32 samples)`
);

const oneMs = await play(-12_000);
const firstOneMs = peak(oneMs, 0, 32);
check(
    firstOneMs < steady * 0.8,
    `-12000 still fades in over about 1 ms (${(firstOneMs / steady).toFixed(3)})`
);

// The SF2 default (-12000 delay and attack) is unchanged by the lower minimum
const sf2Default = await renderLeft(makeBank(sineSample()), note(0, 0.5), 0.1);
const explicitDefault = await renderLeft(
    makeBank(sineSample(), {
        [GeneratorTypes.attackVolEnv]: -12_000,
        [GeneratorTypes.delayVolEnv]: -12_000
    }),
    note(0, 0.5),
    0.1
);
check(
    maxDifference(sf2Default, explicitDefault) === 0,
    "the SF2 defaults still mean 1 ms"
);
// Only -32768 is instant, the SF2 times below -12000 count as -12000
const between = await play(-20_000);
check(
    maxDifference(between, oneMs) === 0,
    "an attack of -20000 sounds like -12000"
);
finish("instant_time_test");
