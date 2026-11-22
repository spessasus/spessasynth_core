// The cutoff sum: initialFilterFc, its modulators and the envelope and LFO excursions are summed with no clamp
// In between, only the final cutoff is limited (SFe 4.0, section 8.1.2)
import {
    type GeneratorType,
    GeneratorTypes,
    Modulator,
    ModulatorSource
} from "../../../src";
import {
    check,
    finish,
    levelDb,
    makeBank,
    noiseSample,
    note,
    renderLeft,
    sfeRoundTrip
} from "./sfe_test_utils";

const play = (gens: Partial<Record<GeneratorType, number>>, plus = 0) =>
    renderLeft(
        makeBank(noiseSample(), gens, (zone) => {
            if (plus !== 0)
                zone.addModulators(
                    // No controller as both sources is a constant 1
                    new Modulator(
                        new ModulatorSource(),
                        new ModulatorSource(),
                        GeneratorTypes.initialFilterFc,
                        plus
                    )
                );
        }),
        note(0, 2, 60),
        1
    );
const level = (b: Float32Array) => levelDb(b, 0.2, 1);

// A held mod env takes 6000 away from 13500 plus a constant 5000
const held = {
    [GeneratorTypes.initialFilterFc]: 13_500,
    [GeneratorTypes.modEnvToFilterFc]: -6000,
    [GeneratorTypes.holdModEnv]: 2000
};
const summed = await play(held, 5000);
const at12500 = await play({ [GeneratorTypes.initialFilterFc]: 12_500 });
const at7500 = await play({ [GeneratorTypes.initialFilterFc]: 7500 });
check(
    Math.abs(level(summed) - level(at12500)) < 0.3,
    `18500 minus 6000 sounds like a cutoff of 12500 (${(level(summed) - level(at12500)).toFixed(2)} dB off)`
);
check(
    level(summed) - level(at7500) > 6,
    "the sum is not clamped to 13500 before the envelope (that would give 7500)"
);

// No floor either: a stored 500 is not raised to 1500 before the envelope adds 6000
const low = await renderLeft(
    sfeRoundTrip(
        makeBank(
            noiseSample(),
            {
                [GeneratorTypes.modEnvToFilterFc]: 6000,
                [GeneratorTypes.holdModEnv]: 2000
            },
            // Unvalidated, the setter would clamp it to 1500
            (zone) =>
                zone.setGenerator(GeneratorTypes.initialFilterFc, 500, false)
        )
    ),
    note(0, 2, 60),
    1
);
const at6500 = await play({ [GeneratorTypes.initialFilterFc]: 6500 });
check(
    Math.abs(level(low) - level(at6500)) < 0.3,
    `500 plus 6000 sounds like a cutoff of 6500 (${(level(low) - level(at6500)).toFixed(2)} dB off)`
);

// A downward modulator still counts when the rest of the sum is above 13500
// Testcase: SC-8820 MG Square converted from Sound Canvas VA, 13299 + 1912 (velocity) - 800 (CC 71)
const downward = await play({ [GeneratorTypes.initialFilterFc]: 13_299 }, 1112);
const open = await play({});
check(
    level(downward) - level(open) > -0.5,
    "13299 + 1112 is still open without an envelope"
);
const downwardEnv = await play(
    {
        [GeneratorTypes.initialFilterFc]: 13_299,
        [GeneratorTypes.modEnvToFilterFc]: -2302,
        [GeneratorTypes.holdModEnv]: 2000
    },
    1112
);
const at12109 = await play({ [GeneratorTypes.initialFilterFc]: 12_109 });
check(
    Math.abs(level(downwardEnv) - level(at12109)) < 0.3,
    `13299 + 1112 - 2302 sounds like a cutoff of 12109 (${(level(downwardEnv) - level(at12109)).toFixed(2)} dB off)`
);

finish("filter_cutoff_sum_test");
