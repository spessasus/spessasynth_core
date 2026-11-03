// MaxFilterFc: the summed cutoff can not go above the ceiling
import { type GeneratorType, GeneratorTypes } from "../../../src";
import {
    check,
    checkStorage,
    finish,
    levelDb,
    makeBank,
    maxDifference,
    note,
    noiseSample,
    renderLeft
} from "./sfe_test_utils";

const play = (gens: Partial<Record<GeneratorType, number>>) =>
    renderLeft(makeBank(noiseSample(), gens), note(0, 2, 60), 1);

const open = await play({});
const at8000 = await play({ [GeneratorTypes.initialFilterFc]: 8000 });
const ceiling = await play({ [GeneratorTypes.maxFilterFc]: 8000 });
const level = (b: Float32Array) => levelDb(b, 0.2, 1);

check(
    level(open) - level(ceiling) > 6,
    `an open filter is closed down to the ceiling (${(level(open) - level(ceiling)).toFixed(1)} dB quieter)`
);
check(
    maxDifference(ceiling, at8000) < 1e-6,
    "a ceiling at 8000 sounds like a cutoff of 8000"
);

// Mod env pushes 5000 up to 11000 and stays there
const sweep = {
    [GeneratorTypes.initialFilterFc]: 5000,
    [GeneratorTypes.modEnvToFilterFc]: 6000,
    [GeneratorTypes.holdModEnv]: 2000
};
const swept = await play(sweep);
const sweptCeiling = await play({
    ...sweep,
    [GeneratorTypes.maxFilterFc]: 8000
});
check(
    level(swept) - level(at8000) > 3,
    "without the ceiling the mod env opens the filter past 8000"
);
check(
    Math.abs(level(sweptCeiling) - level(at8000)) < 0.3,
    `the mod env stops at the ceiling (${(level(sweptCeiling) - level(at8000)).toFixed(2)} dB from a cutoff of 8000)`
);

// A ceiling above the cutoff, or the default, changes nothing
const above = await play({
    [GeneratorTypes.initialFilterFc]: 8000,
    [GeneratorTypes.maxFilterFc]: 12_000
});
check(
    maxDifference(above, at8000) === 0,
    "a ceiling above the cutoff changes nothing"
);
const defaultCeiling = await play({ [GeneratorTypes.maxFilterFc]: 13_500 });
check(maxDifference(defaultCeiling, open) === 0, "13500 means no ceiling");

checkStorage(makeBank(noiseSample(), { [GeneratorTypes.maxFilterFc]: 7000 }), [
    GeneratorTypes.maxFilterFc
]);
finish("max_filter_fc_test");
