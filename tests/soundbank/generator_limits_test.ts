import { GeneratorLimits, GeneratorTypes } from "../../src";

// Checks the preset ranges in GeneratorLimits

let failed = false;
const check = (what: string, ok: boolean) => {
    console.info(`${ok ? "PASS" : "FAIL"}: ${what}`);
    if (!ok) failed = true;
};

const pitch = GeneratorLimits[GeneratorTypes.modLfoToPitch];
check(
    "pitch modulation allows twice the instrument range in presets",
    pitch.presetMin === -24_000 && pitch.presetMax === 24_000
);
const q = GeneratorLimits[GeneratorTypes.initialFilterQ];
check(
    "filter Q goes negative in presets and keeps its maximum",
    q.presetMin === -960 && q.presetMax === undefined
);
check(
    "sample offsets have no preset range",
    GeneratorLimits[GeneratorTypes.startAddrsOffset].presetMin === undefined
);
for (const [type, lim] of Object.entries(GeneratorLimits)) {
    const min = lim.presetMin ?? lim.min;
    const max = lim.presetMax ?? lim.max;
    if (min > max) check(`generator ${type} preset range is ordered`, false);
}
check("every preset range is ordered", !failed);

if (failed) {
    console.error("Some checks failed.");
    process.exit(1);
}
console.info("All checks passed.");
