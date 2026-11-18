// Mod envelope hold: -32768 is no hold with key scaling included, other values are raised to -12000 before it
import {
    GeneratorLimits,
    type GeneratorType,
    GeneratorTypes
} from "../../../src";
import {
    MOD_ENV_2_GENERATORS,
    ModulationEnvelope
} from "../../../src/synthesizer/audio_engine/voice/modulation_envelope";
import { check, finish } from "./sfe_test_utils";

const generators = new Int16Array(100);
for (let t = 0; t < 89; t++) {
    const limit = GeneratorLimits[t as GeneratorType];
    if (limit) generators[t] = limit.def;
}
generators[GeneratorTypes.sustainModEnv2] = 1000;
generators[GeneratorTypes.decayModEnv2] = -12_000;
const voice = {
    modulatedGenerators: generators,
    targetKey: 0,
    startTime: 0
} as never;

// Default hold (-32768) with key scaling: still no hold, so the envelope decays right away
generators[GeneratorTypes.keyNumToModEnv2Hold] = 600;
const instant = new ModulationEnvelope(MOD_ENV_2_GENERATORS);
instant.init(voice);
const decayed = instant.process(voice, 0.5);
check(
    decayed < 0.01,
    `-32768 hold with key scaling is no hold (${decayed.toFixed(3)} at 0.5 s)`
);

// -20000 counts as -12000 before key scaling: -12000 + 300 * 60 = 6000 tc, a 32 s hold
generators[GeneratorTypes.holdModEnv2] = -20_000;
generators[GeneratorTypes.keyNumToModEnv2Hold] = 300;
const held = new ModulationEnvelope(MOD_ENV_2_GENERATORS);
held.init(voice);
const holding = held.process(voice, 1);
check(
    holding > 0.99,
    `-20000 hold is raised to -12000 before key scaling (${holding.toFixed(3)} at 1 s)`
);

finish("mod_env_hold_test");
