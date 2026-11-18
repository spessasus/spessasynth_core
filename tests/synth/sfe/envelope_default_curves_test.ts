// The CC 72, 73 and 75 default modulators use custom curves the bank owns, like any other curves.
// SFe always writes them, SF2 drops them and restores them on load.
import {
    BasicSoundBank,
    CustomCurve,
    GeneratorTypes,
    type MIDIController,
    MIDIControllers,
    Modulator,
    ModulatorCurveTypes,
    ModulatorSource
} from "../../../src";
import {
    check,
    finish,
    makeBank,
    sf2RoundTrip,
    sfeRoundTrip,
    sineSample
} from "./sfe_test_utils";

const bank = makeBank(sineSample());
const envelope = (cc: number) =>
    bank.defaultModulators.filter((m) =>
        m.primarySource.isController(cc as MIDIController)
    );

// One modulator per CC, each to its own stage (CC 75 used to leak a term into release)
for (const [cc, destination] of [
    [MIDIControllers.attackTime, GeneratorTypes.attackVolEnv],
    [MIDIControllers.decayTime, GeneratorTypes.decayVolEnv],
    [MIDIControllers.releaseTime, GeneratorTypes.releaseVolEnv]
] as const) {
    const mods = envelope(cc);
    check(mods.length === 1, `CC ${cc} has one default modulator`);
    check(
        mods[0]?.destination === destination,
        `CC ${cc} goes to its own stage`
    );
}

// Response in timecents per CC value
const response = (cc: number, value: number) => {
    const m = envelope(cc)[0];
    return (
        (m.primarySource.curve as CustomCurve).getValue(
            value << 7,
            true,
            false
        ) * m.transformAmount
    );
};
for (const cc of [
    MIDIControllers.attackTime,
    MIDIControllers.decayTime,
    MIDIControllers.releaseTime
]) {
    check(Math.abs(response(cc, 0) + 9600) < 1, `CC ${cc} at 0 is -9600 tc`);
    check(Math.abs(response(cc, 48) + 2400) < 1, `CC ${cc} at 48 is -2400 tc`);
    check(Math.abs(response(cc, 64)) < 1, `CC ${cc} at 64 is neutral`);
    let monotonic = true;
    for (let v = 1; v < 128; v++) {
        if (response(cc, v) < response(cc, v - 1) - 0.01) monotonic = false;
    }
    check(monotonic, `CC ${cc} never shortens the time as it goes up`);
}

// Every bank owns its copies of the two curves, linked to the bank like any other curve
const attackCurve = envelope(MIDIControllers.attackTime)[0].primarySource
    .curve as CustomCurve;
check(bank.customCurves.length === 2, "a new bank holds the two curves");
check(
    bank.customCurves.includes(attackCurve) &&
        attackCurve.useCount === 1 &&
        attackCurve.linkedTo[0] === bank,
    "the attack curve is linked to the bank once"
);
check(
    bank.customCurves[1].useCount === 2,
    "decay and release share the other curve"
);
check(
    new BasicSoundBank().customCurves[0] !== attackCurve,
    "another bank has its own copies"
);
const copy = BasicSoundBank.copyFrom(bank);
check(
    copy.customCurves.length === 2 &&
        copy.customCurves[0] !== attackCurve &&
        copy.customCurves[0].name === attackCurve.name &&
        copy.customCurves[0].useCount === 1,
    "a copy has its own linked copies, with the same names"
);

const attackCount = (mods: readonly Modulator[]) =>
    mods.filter((m) => m.primarySource.isController(MIDIControllers.attackTime))
        .length;

// Unchanged defaults: SF2 writes no DMOD, SFe always writes it with the curves
const sf2Unchanged = sf2RoundTrip(bank);
check(
    sf2Unchanged.customCurves.length === 2,
    "SF2: the loaded bank holds only its default curves"
);
check(
    attackCount(sf2Unchanged.defaultModulators) === 1,
    "SF2: envelope defaults present"
);
const sfeUnchanged = sfeRoundTrip(bank);
check(sfeUnchanged.customCurves.length === 2, "SFe: two curves written");
check(
    sfeUnchanged.defaultModulators.length === bank.defaultModulators.length,
    "SFe: the whole list is kept"
);

// Changed defaults: SFe keeps the envelope modulators with their curves
// Without the soft pedal modulator
bank.defaultModulators = bank.defaultModulators.filter(
    (m) => m.primarySource.index !== MIDIControllers.softPedal
);
const sfe = sfeRoundTrip(bank);
const sfeAttack = sfe.defaultModulators.filter((m) =>
    m.primarySource.isController(MIDIControllers.attackTime)
);
check(sfeAttack.length === 1, "SFe: attack modulator kept");
check(
    sfeAttack[0]?.primarySource.curve.isIdentical(
        envelope(MIDIControllers.attackTime)[0].primarySource.curve
    ) ?? false,
    "SFe: attack curve kept"
);
check(
    sfe.defaultModulators.length === bank.defaultModulators.length,
    "SFe: the removed modulator stays removed"
);

// SF2 drops them from the written DMOD, and they come back on load
const sf2 = sf2RoundTrip(bank);
check(
    sf2.customCurves.length === 2 &&
        sf2.customCurves.every((c) => c.useCount > 0),
    "SF2: the restored modulators use the loaded bank's curves"
);
check(
    attackCount(sf2.defaultModulators) === 1,
    "SF2: envelope modulators restored"
);
check(
    sf2.defaultModulators.length === bank.defaultModulators.length,
    "SF2: the same number of default modulators"
);

// A CC 73 modulator with amount 0 keeps them out
bank.defaultModulators = bank.defaultModulators.filter(
    (m) => !(m.primarySource.curve instanceof CustomCurve)
);
bank.defaultModulators = [
    ...bank.defaultModulators,
    new Modulator(
        new ModulatorSource(
            MIDIControllers.attackTime,
            ModulatorCurveTypes.linear,
            true,
            true
        ),
        new ModulatorSource(),
        GeneratorTypes.attackVolEnv,
        0
    )
];
check(
    attackCurve.useCount === 0,
    "removing the modulators unlinks their curves"
);
const removed = sf2RoundTrip(bank);
check(
    attackCount(removed.defaultModulators) === 1 &&
        !removed.defaultModulators.some(
            (m) =>
                (m.primarySource.isCC &&
                    m.primarySource.index === MIDIControllers.releaseTime) ||
                m.primarySource.curve instanceof CustomCurve
        ),
    "SF2: a CC 73 placeholder keeps the envelope modulators out"
);

finish("envelope default curves");
