// Torture test for custom curve evaluation.
// The pitch wheel (14-bit) and a CC (7-bit) change every quantum while 32 voices play.
// The same modulators are rendered with SF2 linear curves and with custom curves of the same shape,
// So the output must match and the timing shows the cost of the custom path.
import {
    CustomCurve,
    GeneratorTypes,
    Modulator,
    ModulatorControllerSources,
    ModulatorCurveTypes,
    ModulatorSource,
    SpessaSynthProcessor
} from "../../../src";
import {
    check,
    finish,
    makeBank,
    QUANTUM,
    SAMPLE_RATE,
    sineSample
} from "./sfe_test_utils";

const SECONDS = 20;
const PASSES = 5;
const CC = 16;

// Same output as the SF2 linear curve for every raw value in the positive direction
const identity = new CustomCurve([
    { x: 0, y: 0 },
    { x: 16_384, y: 16_384 }
]);
// A curve with many points, to exercise the segment search off the 7-bit grid
const wiggly = new CustomCurve(
    Array.from({ length: 64 }, (_, i) => ({
        x: Math.round((i / 63) * 16_383),
        y: Math.round(8192 + Math.sin(i / 4) * 8000)
    }))
);

type Mode = "sf2" | "custom" | "wiggly";

function bankFor(mode: Mode) {
    const curve =
        mode === "sf2"
            ? ModulatorCurveTypes.linear
            : mode === "custom"
              ? identity
              : wiggly;
    return makeBank(sineSample(), {}, (zone) => {
        zone.addModulators(
            // CC to tuning and to cutoff, both on the 7-bit grid
            new Modulator(
                new ModulatorSource(CC, curve, true, true),
                new ModulatorSource(),
                GeneratorTypes.fineTune,
                50
            ),
            new Modulator(
                new ModulatorSource(CC, curve, true, false),
                new ModulatorSource(),
                GeneratorTypes.initialFilterFc,
                -2400
            ),
            // Pitch wheel (14-bit, mostly off the grid) to tuning and to volume
            new Modulator(
                new ModulatorSource(
                    ModulatorControllerSources.pitchWheel,
                    curve,
                    false,
                    true
                ),
                new ModulatorSource(),
                GeneratorTypes.fineTune,
                30
            ),
            new Modulator(
                new ModulatorSource(
                    ModulatorControllerSources.pitchWheel,
                    curve,
                    false,
                    false
                ),
                new ModulatorSource(),
                GeneratorTypes.initialAttenuation,
                100
            )
        );
    });
}

async function renderMode(mode: Mode) {
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    synth.soundBankManager.addSoundBank(bankFor(mode), "main");
    await synth.ready;
    const count = SECONDS * SAMPLE_RATE;
    const left = new Float32Array(count);
    const right = new Float32Array(count);
    for (let k = 0; k < 32; k++) synth.noteOn(0, 40 + k, 100);
    // Deterministic, so every mode gets the same events
    let seed = 1;
    const start = performance.now();
    for (let i = 0; i < count; i += QUANTUM) {
        seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
        synth.pitchWheel(0, seed % 16_384);
        synth.controllerChange(0, CC, (seed >> 14) % 128);
        synth.process(left, right, i, Math.min(QUANTUM, count - i));
    }
    return { time: performance.now() - start, left };
}

const times: Record<Mode, number[]> = { sf2: [], custom: [], wiggly: [] };
let sf2Out: Float32Array | undefined;
let customOut: Float32Array | undefined;
let wigglyOut: Float32Array | undefined;
for (let pass = 0; pass < PASSES; pass++) {
    // Alternate the order so warm-up does not favor one mode
    const order: Mode[] =
        pass % 2 === 0
            ? ["sf2", "custom", "wiggly"]
            : ["wiggly", "custom", "sf2"];
    for (const mode of order) {
        const { time, left } = await renderMode(mode);
        times[mode].push(time);
        if (mode === "sf2") sf2Out = left;
        if (mode === "custom") customOut = left;
        if (mode === "wiggly") wigglyOut = left;
    }
}

const median = (t: number[]) => {
    const sorted = [...t];
    sorted.sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
};
const events = Math.ceil((SECONDS * SAMPLE_RATE) / QUANTUM);
console.info(
    `${events} pitch wheel and CC events each, 32 voices, ${SECONDS} s, median of ${PASSES}:`
);
for (const mode of ["sf2", "custom", "wiggly"] as const) {
    console.info(`  ${mode}: ${median(times[mode]).toFixed(0)} ms`);
}

let identical = sf2Out !== undefined && customOut !== undefined;
for (let i = 0; identical && i < (sf2Out?.length ?? 0); i++) {
    if (sf2Out![i] !== customOut![i]) identical = false;
}
check(
    identical,
    "custom identity curve renders the same as the SF2 linear curve"
);
check(
    wigglyOut?.every((s) => Number.isFinite(s)) === true,
    "many-point curve renders finite samples"
);
const ratio = median(times.custom) / median(times.sf2);
check(
    ratio < 1.15,
    `custom curve render time is within 15 % of SF2 curves (${(ratio * 100).toFixed(1)} %)`
);

// Raw lookups, without the synthesizer around them.
// One loop per case, a shared callback would turn megamorphic and favor whichever ran first.
const LOOKUPS = 20_000_000;
const sf2Table = new ModulatorSource(
    ModulatorControllerSources.pitchWheel,
    ModulatorCurveTypes.linear,
    false,
    true
).curve.tables[0b10];
const benchmarks: [string, () => number][] = [
    [
        "SF2 table",
        () => {
            let sum = 0;
            for (let i = 0; i < LOOKUPS; i++)
                sum += sf2Table[(i * 7919) & 16_383];
            return sum;
        }
    ],
    [
        "custom, 7-bit grid",
        () => {
            let sum = 0;
            for (let i = 0; i < LOOKUPS; i++)
                sum += wiggly.getValue((i * 7919) & 16_256, true, false);
            return sum;
        }
    ],
    [
        "custom, 14-bit",
        () => {
            let sum = 0;
            for (let i = 0; i < LOOKUPS; i++)
                sum += wiggly.getValue((i * 7919) & 16_383, true, false);
            return sum;
        }
    ]
];
console.info(`Raw lookups, ${LOOKUPS}:`);
for (const [name, run] of benchmarks) {
    const start = performance.now();
    const sum = run();
    const ns = ((performance.now() - start) * 1e6) / LOOKUPS;
    console.info(
        `  ${name}: ${ns.toFixed(2)} ns per lookup (sum ${sum.toFixed(0)})`
    );
}

finish("curve_torture_test");
