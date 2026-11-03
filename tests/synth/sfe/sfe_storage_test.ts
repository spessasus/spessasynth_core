// Generators and modulator destinations above endOper are written and read in SFE banks only
import {
    type GeneratorType,
    GeneratorTypes,
    Modulator,
    ModulatorControllerSources,
    ModulatorSource,
    SoundBankLoader
} from "../../../src";
import {
    check,
    checkStorage,
    finish,
    makeBank,
    sf2RoundTrip,
    sfeRoundTrip,
    sineSample
} from "./sfe_test_utils";

const values: Partial<Record<GeneratorType, number>> = {
    [GeneratorTypes.amplitude]: -300,
    [GeneratorTypes.vibLfoRate]: 250,
    [GeneratorTypes.vibLfoAmplitudeDepth]: 400,
    [GeneratorTypes.vibLfoToFilterFc]: -2000,
    [GeneratorTypes.vibLfoToVolume]: 60,
    [GeneratorTypes.modLfoRate]: -150,
    [GeneratorTypes.modLfoAmplitudeDepth]: 700,
    [GeneratorTypes.ignoreNoteOff]: 1,
    [GeneratorTypes.delayVoice]: -1200,
    [GeneratorTypes.fadeVibLFO]: -2400,
    [GeneratorTypes.fadeModLFO]: 0,
    [GeneratorTypes.vibLfoWaveform]: 1,
    [GeneratorTypes.modLfoWaveform]: 1,
    [GeneratorTypes.vibLfoStartPhase]: 90,
    [GeneratorTypes.modLfoStartPhase]: 270,
    [GeneratorTypes.maxFilterFc]: 9000,
    [GeneratorTypes.decay2VolEnv]: 1200,
    [GeneratorTypes.sustain2VolEnv]: -200,
    [GeneratorTypes.delayModEnv2]: -6000,
    [GeneratorTypes.attackModEnv2]: -5000,
    [GeneratorTypes.holdModEnv2]: -4000,
    [GeneratorTypes.decayModEnv2]: -3000,
    [GeneratorTypes.sustainModEnv2]: 500,
    [GeneratorTypes.releaseModEnv2]: -2000,
    [GeneratorTypes.keyNumToModEnv2Hold]: 50,
    [GeneratorTypes.keyNumToModEnv2Decay]: -50,
    [GeneratorTypes.modEnv2ToPitch]: 1200,
    [GeneratorTypes.modEnv2ToFilterFc]: -3000
};

const types = Object.keys(values).map((t) => Number(t) as GeneratorType);
check(
    types.length === GeneratorTypes.modEnv2ToFilterFc - GeneratorTypes.endOper,
    "every generator above endOper is tested"
);

// Zone modulators: one to an SFE destination
const sfeDestination = new Modulator(
    new ModulatorSource(ModulatorControllerSources.noteOnVelocity),
    new ModulatorSource(),
    GeneratorTypes.modEnv2ToPitch,
    100,
    0
);

const bank = makeBank(sineSample(), values, (zone, b) => {
    zone.addModulators(sfeDestination);
    // A default modulator with an SFE destination, so DMOD is written
    b.defaultModulators.push(
        new Modulator(
            new ModulatorSource(ModulatorControllerSources.noteOnKeyNum),
            new ModulatorSource(),
            GeneratorTypes.maxFilterFc,
            -500,
            0
        )
    );
});

console.info("Generators:");
checkStorage(bank, types);

console.info("Modulators:");
const hasMod = (mods: Modulator[], mod: Modulator) =>
    mods.some((m) => Modulator.isIdentical(m, mod, true));
const sfe = sfeRoundTrip(bank);
const sf2 = sf2RoundTrip(bank);
const sfeMods = sfe.instruments[0].zones[0].modulators;
const sf2Mods = sf2.instruments[0].zones[0].modulators;
check(
    hasMod(sfeMods, sfeDestination),
    "SFE keeps a modulator to modEnv2ToPitch"
);
check(
    !hasMod(sf2Mods, sfeDestination),
    "SF2 drops a modulator to modEnv2ToPitch"
);
check(
    sfe.defaultModulators.some(
        (m) => m.destination === GeneratorTypes.maxFilterFc
    ),
    "SFE DMOD keeps an SFE destination"
);
check(
    !sf2.defaultModulators.some((m) => m.destination > GeneratorTypes.endOper),
    "SF2 DMOD drops SFE destinations"
);

// A file that says sfbk but carries SFE generators (written by an older SpessaSynth for example)
console.info("Reading:");
const sfeFile = new Uint8Array(bank.writeSFE({ rf64: false }));
const typeOffset = 8;
const fourCC = String.fromCodePoint(
    ...sfeFile.slice(typeOffset, typeOffset + 4)
);
check(fourCC === "sfen", `the SFE file type is sfen (${fourCC})`);
sfeFile.set([0x73, 0x66, 0x62, 0x6b], typeOffset); // "sfbk"
const relabeled = SoundBankLoader.fromArrayBuffer(sfeFile.buffer);
const zone = relabeled.instruments[0].zones[0];
check(
    !zone.generators.some((g) => g.type > GeneratorTypes.endOper),
    "an sfbk bank ignores generators above endOper"
);
check(
    !zone.generators.some((g) => g.type === GeneratorTypes.invalid),
    "the ignored generators are not added to the zone"
);
check(
    zone.getGenerator(GeneratorTypes.sampleModes, 0) === 1,
    "standard generators of the zone are still read"
);
check(
    !zone.modulators.some((m) => m.destination > GeneratorTypes.endOper),
    "an sfbk bank ignores modulator destinations above endOper"
);

finish("sfe_storage_test");
