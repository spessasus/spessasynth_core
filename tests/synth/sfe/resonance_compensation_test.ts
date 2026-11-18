// CC 71 resonance compensation: a default CC 71 to gain modulator, added to SF2 and DLS banks when they are loaded
import {
    BasicSoundBank,
    GeneratorTypes,
    MIDIControllers,
    Modulator,
    ModulatorCurveTypes,
    ModulatorSource,
    SoundBankLoader
} from "../../../src";
import {
    check,
    finish,
    levelDb,
    makeBank,
    note,
    type RenderEvent,
    renderLeft,
    sineSample
} from "./sfe_test_utils";

const cc71ToQ = (amount: number) =>
    new Modulator(
        new ModulatorSource(
            MIDIControllers.filterResonance,
            ModulatorCurveTypes.linear,
            true,
            true
        ),
        new ModulatorSource(),
        GeneratorTypes.initialFilterQ,
        amount,
        0
    );
const isCompensator = (m: Modulator) =>
    m.destination === GeneratorTypes.gain &&
    m.primarySource.isController(MIDIControllers.filterResonance);

console.info("Loading:");
const bank = makeBank(sineSample(), {}, (zone) =>
    zone.addModulators(cc71ToQ(500))
);
const sf2 = bank.writeSF2();
const loaded = SoundBankLoader.fromArrayBuffer(sf2);
const zoneMods = loaded.instruments[0].zones[0].modulators;
const added = zoneMods.filter((m) => isCompensator(m));
check(
    added.length === 1 && added[0].transformAmount === 250,
    "a zone CC 71 to Q of 500 gets a compensator of 250"
);
check(
    loaded.defaultModulators.filter((m) => isCompensator(m)).length === 1,
    "the default modulators keep one compensator"
);

const negative = SoundBankLoader.fromArrayBuffer(
    makeBank(sineSample(), {}, (zone) =>
        zone.addModulators(cc71ToQ(-300))
    ).writeSF2()
).instruments[0].zones[0].modulators.filter((m) => isCompensator(m));
check(
    negative.length === 2 &&
        negative.some(
            (m) => !m.secondarySource.isNegative && m.transformAmount === 0
        ) &&
        negative.some(
            (m) => m.secondarySource.isNegative && m.transformAmount === -150
        ),
    "a negative amount compensates below 64 and turns the default off above 64"
);

console.info("Round trips:");
const again = new Uint8Array(loaded.writeSF2());
const first = new Uint8Array(sf2);
check(
    again.length === first.length && again.every((b, i) => b === first[i]),
    "SF2 written again is the same file (the compensators are dropped)"
);
const sfe = SoundBankLoader.fromArrayBuffer(loaded.writeSFe());
check(
    sfe.instruments[0].zones[0].modulators.filter((m) => isCompensator(m))
        .length === 1,
    "SFe keeps the compensator and adds no second one"
);

console.info("Level:");
const levelAt = async (b: BasicSoundBank, cc: number) => {
    const events: RenderEvent[] = [
        {
            time: 0,
            run: (s) =>
                s.controllerChange(0, MIDIControllers.filterResonance, cc)
        },
        ...note(0.01)
    ];
    return levelDb(await renderLeft(b, events, 0.4), 0.2, 0.4);
};
// An open filter: only the SF2 gain reduction would change the passband level
const plain = makeBank(sineSample());
const at64 = await levelAt(plain, 64);
const at127 = await levelAt(plain, 127);
console.info(`  CC 71 64: ${at64.toFixed(2)} dB, 127: ${at127.toFixed(2)} dB`);
check(
    Math.abs(at127 - at64) < 0.15,
    "the default compensator keeps CC 71 from changing the level"
);
finish("resonance_compensation_test");
