// SFe custom curves: storage (CURV, xdta, XMOD) and the source value in the synthesizer
import {
    BasicSoundBank,
    CustomCurve,
    GeneratorTypes,
    Modulator,
    ModulatorCurveTypes,
    ModulatorSource
} from "../../../src";
import {
    check,
    finish,
    levelDb,
    makeBank,
    note,
    type RenderEvent,
    renderLeft,
    sf2RoundTrip,
    sfeRoundTrip,
    sineSample
} from "./sfe_test_utils";

const CC = 20;

// A step at the center: 0 below CC 64, full above
const step = new CustomCurve([
    { x: 0, y: 0 },
    { x: 8191, y: 0 },
    { x: 8192, y: 16_384 },
    { x: 16_383, y: 16_384 }
]);
// A ramp that rises over the lower half only
const halfRamp = new CustomCurve([
    { x: 0, y: 0 },
    { x: 8192, y: 16_384 },
    { x: 16_383, y: 16_384 }
]);

const curveSource = (curve: CustomCurve, isNegative = false) =>
    new ModulatorSource(CC, curve, true, false, isNegative);

console.info("Curve values:");
check(step.getY(8191) === 0 && step.getY(8192) === 16_384, "step is vertical");
check(halfRamp.getY(4096) === 8192, "ramp interpolates (4096 gives 8192)");
check(halfRamp.getY(16_383) === 16_384, "last point holds");

// 20 dB of attenuation through the step
const stepMod = new Modulator(
    curveSource(step),
    new ModulatorSource(),
    GeneratorTypes.initialAttenuation,
    200,
    0
);
// A default modulator with a custom curve (DMOD + XMOD)
const defaultMod = new Modulator(
    curveSource(halfRamp, true),
    new ModulatorSource(),
    GeneratorTypes.fineTune,
    100,
    0
);

const bank = makeBank(sineSample(), {}, (zone, b) => {
    zone.addModulators(stepMod);
    b.defaultModulators = [...b.defaultModulators, defaultMod];
    b.addCustomCurves(step, halfRamp);
});

console.info("Storage:");
const sfe = sfeRoundTrip(bank);
const sf2 = sf2RoundTrip(bank);
const sfeMod = sfe.instruments[0].zones[0].modulators.find(
    (m) => m.primarySource.curveType === ModulatorCurveTypes.custom
);
check(sfeMod !== undefined, "SFe keeps the custom curve modulator");
check(
    sfeMod?.primarySource.curve.isIdentical(step) === true,
    "SFe keeps the curve points"
);
check(
    sfeMod !== undefined && Modulator.isIdentical(sfeMod, stepMod, true),
    "the read modulator is identical to the written one"
);
// The envelope time defaults use custom curves too, so look for this one
const sfeDefault = sfe.defaultModulators.find((m) =>
    m.primarySource.curve.isIdentical(halfRamp)
);
check(
    sfeDefault?.primarySource.isNegative === true,
    "SFe DMOD keeps a custom curve (XMOD)"
);
check(
    sf2.instruments[0].zones[0].modulators.every((m) => !m.usesCustomCurve),
    "SF2 drops custom curve modulators"
);
check(
    sf2.defaultModulators.every(
        (m) => !m.primarySource.curve.isIdentical(halfRamp)
    ),
    "SF2 DMOD drops custom curve modulators"
);

console.info("Bank curve list:");
const named = new CustomCurve(
    [
        { x: 0, y: 16_384 },
        { x: 16_383, y: 0 }
    ],
    "Falling ramp with a long name that is cut at forty"
);
const unused = new CustomCurve(
    [
        { x: 0, y: 0 },
        { x: 16_383, y: 8192 }
    ],
    "Unused"
);
const listBank = makeBank(sineSample(), {}, (zone, b) => {
    zone.addModulators(
        new Modulator(
            curveSource(named),
            new ModulatorSource(),
            GeneratorTypes.pan,
            100,
            0
        ),
        // Shares the curve with the modulator above
        new Modulator(
            curveSource(named, true),
            new ModulatorSource(),
            GeneratorTypes.fineTune,
            10,
            0
        )
    );
    b.addCustomCurves(unused, named);
});
// A new bank starts with its two envelope time curves, the added ones follow in order
const listRead = sfeRoundTrip(listBank);
const fortyChars = "Falling ramp with a long name that is cut at forty".slice(
    0,
    40
);
check(
    listRead.customCurves.map((c) => c.name).join("|") ===
        ["Attack time", "Decay and release time", "Unused", fortyChars].join(
            "|"
        ),
    "the list keeps its order, unused curves and 40 character names"
);
const readNamed = listRead.customCurves[3];
const readMods = listRead.instruments[0].zones[0].modulators;
check(
    readMods.length === 2 &&
        readMods[0].primarySource.curve === readNamed &&
        readMods[1].primarySource.curve === readNamed,
    "modulators share the curve object from the list"
);
check(
    readNamed.useCount === 2 &&
        readNamed.linkedTo.every((u) => u === listRead.instruments[0]),
    "use count counts every source, linked to the instrument"
);
let didDeleteThrow = false;
try {
    listRead.deleteCustomCurve(readNamed);
} catch {
    didDeleteThrow = true;
}
check(didDeleteThrow, "deleting a used curve throws");
listRead.deleteCustomCurve(listRead.customCurves[2]);
check(listRead.customCurves.length === 3, "an unused curve can be deleted");

// Editing a zone keeps the links right
const zone = listRead.instruments[0].zones[0];
const deleted = readMods[0];
zone.deleteModulator(deleted);
check(readNamed.useCount === 1, "deleting a modulator unlinks its curve");
const other = listRead.customCurves[0];
const otherUses = other.useCount;
deleted.primarySource.curve = other;
check(
    other.useCount === otherUses,
    "a deleted modulator no longer links a curve set on it"
);
zone.modulators[0].primarySource.curve = other;
check(
    readNamed.useCount === 0 && other.useCount === otherUses + 1,
    "setting a curve on a zone's modulator moves the link"
);
let sharedThrew = false;
try {
    listRead.instruments[0].globalZone.addModulators(zone.modulators[0]);
} catch {
    sharedThrew = true;
}
check(sharedThrew, "a modulator can only be in one zone");
listRead.deletePreset(listRead.presets[0]);
listRead.deleteInstrument(listRead.instruments[0]);
check(
    other.useCount === otherUses,
    "deleting the instrument unlinks its curves"
);

let frozen = false;
try {
    (named.points as { x: number; y: number }[])[0].y = 0;
} catch {
    frozen = true;
}
check(frozen && named.points[0].y === 16_384, "points are frozen");
const copied = BasicSoundBank.copyFrom(listBank);
check(
    copied.customCurves.length === 4 &&
        copied.customCurves[3] !== named &&
        copied.customCurves[3].name === named.name &&
        copied.instruments[0].zones[0].modulators[0].primarySource.curve ===
            copied.customCurves[3],
    "a copied bank gets its own curves"
);
const unusedOnly = BasicSoundBank.copyFrom(listBank);
unusedOnly.removeUnusedElements();
check(
    unusedOnly.customCurves.length === 3 &&
        unusedOnly.customCurves.every((c) => c.name !== "Unused"),
    "removeUnusedElements drops unused curves"
);
const orphan = new CustomCurve([
    { x: 0, y: 0 },
    { x: 16_383, y: 16_384 }
]);
const orphanBank = makeBank(sineSample(), {}, (zone) => {
    zone.addModulators(
        new Modulator(
            curveSource(orphan),
            new ModulatorSource(),
            GeneratorTypes.pan,
            100,
            0
        )
    );
});
check(orphan.useCount === 1, "a curve outside the list is still linked");
let orphanThrew = false;
try {
    orphanBank.writeSFe();
} catch {
    orphanThrew = true;
}
check(orphanThrew, "writing a used curve missing from the list throws");

console.info("Synthesizer:");
const levelAt = async (value: number) => {
    const events: RenderEvent[] = [
        {
            time: 0,
            run: (s) => s.controllerChange(0, CC, value)
        },
        ...note(0.01)
    ];
    const left = await renderLeft(sfe, events, 0.3);
    return levelDb(left, 0.1, 0.3);
};
const low = await levelAt(63);
const high = await levelAt(64);
console.info(`  CC 63: ${low.toFixed(2)} dB, CC 64: ${high.toFixed(2)} dB`);
check(
    Math.abs(high - low + 20) < 0.5,
    "the step attenuates 20 dB from CC 64 on"
);

// Editing the curve in place reaches the modulator that uses it
const readStep = sfeMod?.primarySource.curve;
if (!(readStep instanceof CustomCurve)) throw new TypeError("No step curve");
readStep.setPoints([
    { x: 0, y: 0 },
    { x: 16_383, y: 0 }
]);
const edited = await levelAt(64);
console.info(`  CC 64 after setPoints: ${edited.toFixed(2)} dB`);
check(Math.abs(edited - low) < 0.5, "setPoints changes the sound");

finish("custom_curve_test");
