// MIDI behavior tests
// Covers the Modulation Depth Range source and the SF2 conversion of the mod wheel vibrato
// Also preset modulators to instrument-only generators, CC 10 of 0 and start on release with ignoreNoteOff
// Also the GM mode, GM2 channel 10, the XG drum part protect and All Notes Off with the pedal
// Also the XG and GS alias fixes, the XG MW LFO PMOD DEPTH cap and the default controller values
// Also the part mode messages, XG channel 10 with the bank MSB 126, the GS system mode set and the depth aliases
import { readFileSync } from "node:fs";
import {
    BasicInstrument,
    BasicPreset,
    BasicSoundBank,
    type GeneratorType,
    GeneratorTypes,
    MIDIControllers,
    Modulator,
    ModulatorControllerSources,
    ModulatorSource,
    SoundBankLoader,
    SpessaLog,
    SPESSASYNTH_DEFAULT_MODULATORS,
    SpessaSynthProcessor
} from "../../../src";
import {
    check,
    finish,
    levelDb,
    makeBank,
    note,
    QUANTUM,
    render,
    sf2RoundTrip,
    sfeRoundTrip,
    sineSample
} from "./sfe_test_utils";

const SAMPLE_RATE = 44_100;

const vibrato = (setup: (synth: SpessaSynthProcessor) => void) => {
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    return (async () => {
        synth.soundBankManager.addSoundBank(makeBank(sineSample()), "main");
        await synth.ready;
        synth.noteOn(0, 69, 100);
        // Full mod wheel, both bytes
        synth.controllerChange(0, MIDIControllers.modulationWheel, 127);
        synth.controllerChange(0, MIDIControllers.modulationWheelLSB, 127);
        setup(synth);
        const left = new Float32Array(QUANTUM);
        const right = new Float32Array(QUANTUM);
        synth.process(left, right, 0, QUANTUM);
        const voice = synth.voices.find((v) => v.isActive);
        return voice?.modulatedGenerators[GeneratorTypes.vibLfoToPitch] ?? NaN;
    })();
};

const rpn5 = (synth: SpessaSynthProcessor, msb: number) => {
    synth.controllerChange(0, MIDIControllers.registeredParameterMSB, 0);
    synth.controllerChange(0, MIDIControllers.registeredParameterLSB, 5);
    synth.controllerChange(0, MIDIControllers.dataEntryMSB, msb);
    synth.controllerChange(0, MIDIControllers.dataEntryLSB, 0);
};

console.info("Modulation Depth Range source:");
const def = await vibrato(() => undefined);
check(
    Math.abs(def - 50) <= 1,
    `the default range gives 50 cents at full mod wheel (${def})`
);
const rpn1 = await vibrato((s) => rpn5(s, 1));
check(
    Math.abs(rpn1 - 100) <= 1,
    `RPN 5 of 1 semitone gives 100 cents (${rpn1})`
);
const rpn16 = await vibrato((s) => rpn5(s, 16));
check(
    Math.abs(rpn16 - 1600) <= 2,
    `RPN 5 of 16 semitones is full, 1600 cents (${rpn16})`
);
const rpn24 = await vibrato((s) => rpn5(s, 24));
check(
    Math.abs(rpn24 - 1600) <= 2,
    `RPN 5 above 16 semitones is clamped (${rpn24})`
);
const rpn0 = await vibrato((s) => rpn5(s, 0));
check(rpn0 === 0, `RPN 5 of 0 gives no vibrato (${rpn0})`);
// A sounding voice follows the change
const live = await vibrato(() => undefined);
check(Math.abs(live - 50) <= 1, "sanity");
{
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    synth.soundBankManager.addSoundBank(makeBank(sineSample()), "main");
    await synth.ready;
    synth.noteOn(0, 69, 100);
    synth.controllerChange(0, MIDIControllers.modulationWheel, 127);
    const left = new Float32Array(QUANTUM);
    const right = new Float32Array(QUANTUM);
    synth.process(left, right, 0, QUANTUM);
    rpn5(synth, 2);
    synth.process(left, right, 0, QUANTUM);
    const v =
        synth.voices.find((x) => x.isActive)?.modulatedGenerators[
            GeneratorTypes.vibLfoToPitch
        ] ?? NaN;
    check(
        Math.abs(v - 198) <= 2,
        `a sounding voice follows RPN 5 (${v}, 200 cents at wheel 127/128)`
    );
}

const defaultVib = SPESSASYNTH_DEFAULT_MODULATORS.find((m) =>
    m.primarySource.isController(MIDIControllers.modulationWheel)
);
check(
    defaultVib?.secondarySource.index ===
        ModulatorControllerSources.modulationDepthRange &&
        defaultVib.transformAmount === 1600 &&
        defaultVib.destination === GeneratorTypes.vibLfoToPitch,
    "the default modulator is CC 1 to vibLfoToPitch, amount source 17, amount 1600"
);

console.info("SF2 conversion:");
const ccOne = (
    amount: number,
    depth: boolean,
    dest: GeneratorType = GeneratorTypes.vibLfoToPitch
) =>
    new Modulator(
        new ModulatorSource(MIDIControllers.modulationWheel, 0, true),
        depth
            ? new ModulatorSource(
                  ModulatorControllerSources.modulationDepthRange
              )
            : new ModulatorSource(),
        dest,
        amount
    );
const zoneMods = (bank: BasicSoundBank) =>
    bank.instruments[0].zones[0].modulators;
const zoneBank = (mods: Modulator[]) => {
    const bank = makeBank(sineSample());
    bank.instruments[0].zones[0].setModulators(mods);
    return bank;
};

// A plain SF2 style modulator is written as it is and gets the source when read
const plain = sf2RoundTrip(zoneBank([ccOne(50, false)]));
const readPlain = zoneMods(plain)[0];
check(
    zoneMods(plain).length === 1 &&
        readPlain.secondarySource.index ===
            ModulatorControllerSources.modulationDepthRange &&
        !readPlain.secondarySource.isCC &&
        readPlain.transformAmount === 1600,
    "an SF2 CC 1 vibrato of 50 reads as amount source 17 and amount 1600"
);
const readModLfo = zoneMods(
    sf2RoundTrip(zoneBank([ccOne(-1023, false, GeneratorTypes.modLfoToPitch)]))
)[0];
check(
    readModLfo.transformAmount === -1023 * 32 &&
        readModLfo.secondarySource.index ===
            ModulatorControllerSources.modulationDepthRange,
    "modLfoToPitch with the limit amount -1023 is converted too"
);
const readTooBig = zoneMods(sf2RoundTrip(zoneBank([ccOne(1100, false)])))[0];
check(
    readTooBig.transformAmount === 1100 &&
        readTooBig.secondarySource.index ===
            ModulatorControllerSources.noController,
    "an amount above 1023 is left alone"
);
const readOther = zoneMods(
    sf2RoundTrip(zoneBank([ccOne(50, false, GeneratorTypes.fineTune)]))
)[0];
check(
    readOther.transformAmount === 50 &&
        readOther.secondarySource.index ===
            ModulatorControllerSources.noController,
    "another destination is left alone"
);

// Writing
const depthBank = zoneBank([ccOne(1600, true)]);
const losses = depthBank.getSF2Losses();
const written = zoneMods(sf2RoundTrip(depthBank))[0];
check(
    written.transformAmount === 1600 &&
        written.secondarySource.index ===
            ModulatorControllerSources.modulationDepthRange,
    "CC 1 with the range at 1600 round trips through SF2"
);
check(
    losses.modulators === 0,
    `the loss report counts nothing for it (${losses.modulators})`
);
const rounded = zoneMods(sf2RoundTrip(zoneBank([ccOne(1650, true)])))[0];
check(
    rounded.transformAmount === 52 * 32,
    `an amount of 1650 is written as 52 (${rounded.transformAmount / 32})`
);
check(
    zoneBank([ccOne(1650, true)]).getSF2Losses().modulators === 1,
    "an amount that does not read back is counted as lost"
);
const rangePrimary = new Modulator(
    new ModulatorSource(ModulatorControllerSources.modulationDepthRange),
    new ModulatorSource(),
    GeneratorTypes.vibLfoToPitch,
    1600
);
const rangeOther = new Modulator(
    new ModulatorSource(MIDIControllers.expression, 0, true),
    new ModulatorSource(ModulatorControllerSources.modulationDepthRange),
    GeneratorTypes.vibLfoToPitch,
    1600
);
const dropBank = zoneBank([rangePrimary, rangeOther]);
check(
    dropBank.getSF2Losses().modulators === 2,
    "the loss report counts the two that SF2 can not store"
);
check(
    zoneMods(sf2RoundTrip(dropBank)).length === 0,
    "a modulator with the range as its source or with another primary is dropped"
);
check(
    zoneBank([ccOne(1600, true)]).getSF2Losses().defaultModulators === 0,
    "the unchanged default list loses nothing"
);

// The default list
const unchanged = sf2RoundTrip(makeBank(sineSample()));
const vib = unchanged.defaultModulators.find((m) =>
    m.primarySource.isController(MIDIControllers.modulationWheel)
);
check(
    unchanged.defaultModulators.length ===
        SPESSASYNTH_DEFAULT_MODULATORS.length &&
        vib?.transformAmount === 1600 &&
        vib.secondarySource.index ===
            ModulatorControllerSources.modulationDepthRange,
    "an unchanged default list is not written and reads back whole"
);
const changed = makeBank(sineSample());
changed.defaultModulators = changed.defaultModulators.filter(
    (m) => m.destination !== GeneratorTypes.pan
);
const changedBack = sf2RoundTrip(changed);
const vib2 = changedBack.defaultModulators.find((m) =>
    m.primarySource.isController(MIDIControllers.modulationWheel)
);
// The pan modulator removed, and CC 71 to filterQOffset is SFe only (SF2 drops it, the reader does not add it back)
check(
    changedBack.defaultModulators.length ===
        SPESSASYNTH_DEFAULT_MODULATORS.length - 2 &&
        vib2?.transformAmount === 1600,
    "a changed default list keeps the mod wheel vibrato at 1600"
);

console.info("Preset modulators to instrument-only generators:");
const lateNote = note(0, 0.2);
const ignoreMod = () =>
    new Modulator(
        new ModulatorSource(),
        new ModulatorSource(),
        GeneratorTypes.ignoreNoteOff,
        // The source is just under 1 and the result is truncated, so 2 gives 1
        2
    );
const presetBank = makeBank(sineSample());
presetBank.presets[0].zones[0].addModulators(ignoreMod());
presetBank.flush();
const presetGlobalBank = makeBank(sineSample());
presetGlobalBank.presets[0].globalZone.addModulators(ignoreMod());
presetGlobalBank.flush();
const instrumentBank = makeBank(sineSample(), {}, (zone) =>
    zone.addModulators(ignoreMod())
);
const ignoredLevelRender = await render(presetBank, lateNote, 1);
const ignoredLevel = levelDb(ignoredLevelRender.left, 0.5, 1);
const ignoredGlobalLevelRender = await render(presetGlobalBank, lateNote, 1);
const ignoredGlobalLevel = levelDb(ignoredGlobalLevelRender.left, 0.5, 1);
const appliedLevelRender = await render(instrumentBank, lateNote, 1);
const appliedLevel = levelDb(appliedLevelRender.left, 0.5, 1);
check(
    appliedLevel > -30,
    `the same modulator in an instrument zone applies (${appliedLevel.toFixed(1)} dB)`
);
check(
    ignoredLevel < -90,
    `a preset zone modulator to ignoreNoteOff is ignored (${ignoredLevel.toFixed(1)} dB)`
);
check(
    ignoredGlobalLevel < -90,
    `a global preset zone modulator is ignored too (${ignoredGlobalLevel.toFixed(1)} dB)`
);
const flat = presetBank.presets[0].toFlattenedInstrument();
check(
    flat.zones.every((z) =>
        z.modulators.every(
            (m) => m.destination !== GeneratorTypes.ignoreNoteOff
        )
    ),
    "flattening a preset leaves the modulator out"
);

console.info("CC 10:");
const panValue = async (value: number) => {
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    synth.soundBankManager.addSoundBank(makeBank(sineSample()), "main");
    await synth.ready;
    synth.controllerChange(0, MIDIControllers.pan, value);
    return synth.midiChannels[0].midiControllers[MIDIControllers.pan] >> 7;
};
check((await panValue(0)) === 0, "CC 10 of 0 is stored as 0 (no 0 as 1 rule)");
check((await panValue(1)) === 1, "CC 10 of 1 is 1");
check((await panValue(100)) === 100, "CC 10 of 100 is 100");
{
    // GS PART PANPOT 0 stays random pan
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    await synth.ready;
    // F0 41 10 42 12 40 11 1C 00 cs F7 (channel 1 is part 2 in GS addressing)
    const body = [0x40, 0x11, 0x1c, 0x00];
    const sum = body.reduce((a, b) => a + b, 0);
    const cs = (128 - (sum % 128)) % 128;
    synth.systemExclusive([0x41, 0x10, 0x42, 0x12, ...body, cs, 0xf7], 0);
    check(
        synth.midiChannels[1].midiParameters.randomPan === true ||
            synth.midiChannels[0].midiParameters.randomPan === true,
        "GS PART PANPOT of 0 still means random pan"
    );
}

console.info("Start on release with ignoreNoteOff:");
const startOnRelease = makeBank(sineSample(), {
    [GeneratorTypes.sampleModes]: 2,
    [GeneratorTypes.ignoreNoteOff]: 1
});
const sor = await render(startOnRelease, note(0, 0.1), 0.5);
check(
    levelDb(sor.left, 0.15, 0.5) < -90,
    "the sample never starts after the note off"
);
check(sor.voicesAtEnd === 0, `the voice ends (${sor.voicesAtEnd} left)`);
const plainSor = makeBank(sineSample(), {
    [GeneratorTypes.sampleModes]: 2,
    [GeneratorTypes.releaseVolEnv]: 0
});
const sorPlain = await render(plainSor, note(0, 0.1), 0.5);
check(
    levelDb(sorPlain.left, 0.1, 0.2) > -40,
    "without ignoreNoteOff the sample starts at the note off"
);

console.info("SFe default modulators:");
const noDefaults = makeBank(sineSample());
noDefaults.defaultModulators = [];
check(
    sfeRoundTrip(noDefaults).defaultModulators.length === 0,
    "an SFe DMOD with only the terminal record means no default modulators"
);

console.info("Default controller values and modulators:");
{
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    const bank = makeBank(sineSample(), {
        [GeneratorTypes.initialFilterFc]: 6000
    });
    synth.soundBankManager.addSoundBank(bank, "main");
    await synth.ready;
    const channel = synth.midiChannels[0];
    check(
        channel.midiControllers[MIDIControllers.brightness] >> 7 === 64,
        "CC 74 starts at 64"
    );
    check(
        channel.midiControllers[MIDIControllers.reverbDepth] >> 7 === 40,
        "CC 91 starts at 40"
    );
    const brightness = SPESSASYNTH_DEFAULT_MODULATORS.find((m) =>
        m.primarySource.isController(MIDIControllers.brightness)
    );
    check(
        brightness?.transformAmount === 4800 &&
            brightness.destination === GeneratorTypes.initialFilterFc,
        "the default CC 74 modulator has the amount 4800"
    );
    const reverb = SPESSASYNTH_DEFAULT_MODULATORS.find((m) =>
        m.primarySource.isController(MIDIControllers.reverbDepth)
    );
    check(
        reverb?.transformAmount === 1000 &&
            reverb.destination === GeneratorTypes.reverbEffectsSend,
        "the default CC 91 modulator has the amount 1000"
    );
    const generator = (type: GeneratorType) =>
        synth.voices.find((v) => v.isActive)?.modulatedGenerators[type] ?? NaN;
    const left = new Float32Array(QUANTUM);
    const right = new Float32Array(QUANTUM);
    synth.noteOn(0, 69, 100);
    synth.process(left, right, 0, QUANTUM);
    check(
        Math.abs(generator(GeneratorTypes.initialFilterFc) - 6000) <= 1,
        `the cutoff is untouched at CC 74 of 64 (${generator(GeneratorTypes.initialFilterFc)})`
    );
    check(
        Math.abs(generator(GeneratorTypes.reverbEffectsSend) - 312) <= 1,
        `the default CC 91 of 40 sends 312 (${generator(GeneratorTypes.reverbEffectsSend)})`
    );
    synth.controllerChange(0, MIDIControllers.brightness, 127);
    synth.process(left, right, 0, QUANTUM);
    check(
        Math.abs(generator(GeneratorTypes.initialFilterFc) - 10_800) <= 2,
        `CC 74 of 127 raises the cutoff by the full 4800 cents, 127 is the end (${generator(GeneratorTypes.initialFilterFc)})`
    );
    synth.controllerChange(0, MIDIControllers.brightness, 0);
    synth.process(left, right, 0, QUANTUM);
    check(
        generator(GeneratorTypes.initialFilterFc) === 1500,
        `CC 74 of 0 lowers it to the 1500 limit (${generator(GeneratorTypes.initialFilterFc)})`
    );
}

console.info("XG alias fixes:");
{
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    const sf = readFileSync("tests/files/sound_bank/gm.sf2");
    synth.soundBankManager.addSoundBank(
        SoundBankLoader.fromArrayBuffer(
            sf.buffer.slice(sf.byteOffset, sf.byteOffset + sf.byteLength)
        ),
        "main"
    );
    await synth.ready;
    const channel = synth.midiChannels[0];
    synth.systemExclusive([0x43, 0x10, 0x4c, 0x08, 0x00, 0x14, 77, 0xf7], 0);
    check(
        channel.midiControllers[MIDIControllers.variationDepth] >> 7 === 77,
        "XG 08 pp 14 sets CC 94"
    );
    // MW LFO PMOD DEPTH: a range of 5 * value cents, at most 200
    const pmod = (value: number) => {
        synth.systemExclusive(
            [0x43, 0x10, 0x4c, 0x08, 0x00, 0x20, value, 0xf7],
            0
        );
        return channel.midiParameters.modulationDepth;
    };
    check(pmod(10) === 50, `MW LFO PMOD DEPTH 10 is 50 cents (${pmod(10)})`);
    check(pmod(40) === 200, `MW LFO PMOD DEPTH 40 is 200 cents (${pmod(40)})`);
    check(
        pmod(100) === 200,
        `MW LFO PMOD DEPTH 100 is capped at 200 cents (${pmod(100)})`
    );
    check(
        pmod(127) === 200,
        `MW LFO PMOD DEPTH 127 is capped at 200 cents (${pmod(127)})`
    );
}

console.info("GS and RP-015 fixes:");
{
    const synth = new SpessaSynthProcessor(SAMPLE_RATE);
    const sf = readFileSync("tests/files/sound_bank/gm.sf2");
    synth.soundBankManager.addSoundBank(
        SoundBankLoader.fromArrayBuffer(
            sf.buffer.slice(sf.byteOffset, sf.byteOffset + sf.byteLength)
        ),
        "main"
    );
    await synth.ready;
    const channel = synth.midiChannels[0];
    synth.systemExclusive(
        [0x41, 0x10, 0x42, 0x12, 0x40, 0x00, 0x06, 0x00, 0x3a, 0xf7],
        0
    );
    check(
        synth.midiParameters.pan === -1,
        `GS master pan 0 is -1 (${synth.midiParameters.pan})`
    );
    // Reset All Controllers clears the LSB too
    channel.controllerChange(MIDIControllers.modulationWheel, 100);
    channel.controllerChange(33, 50);
    channel.controllerChange(MIDIControllers.expression, 90);
    channel.controllerChange(43, 30);
    channel.controllerChange(MIDIControllers.resetAllControllers, 0);
    check(
        channel.midiControllers[1] === 0,
        `CC 121 puts CC 1 to 0 with its LSB (${channel.midiControllers[1]})`
    );
    check(
        channel.midiControllers[11] === 127 << 7,
        `CC 121 puts CC 11 to 127 with LSB 0 (${channel.midiControllers[11]})`
    );
    // RPN 0 reaches a sounding voice
    channel.noteOn(60, 100);
    channel.pitchWheel(16_383);
    const voice = synth.voices.find((v) => v.isActive && v.channel === 0);
    const before = voice?.modulatedGenerators[GeneratorTypes.fineTune];
    channel.controllerChange(MIDIControllers.registeredParameterMSB, 0);
    channel.controllerChange(MIDIControllers.registeredParameterLSB, 0);
    channel.controllerChange(MIDIControllers.dataEntryMSB, 12);
    const after = voice?.modulatedGenerators[GeneratorTypes.fineTune];
    check(
        before !== undefined &&
            after !== undefined &&
            after > 1100 &&
            before < 250,
        `a sounding voice follows RPN 0 (${before} to ${after})`
    );
}

console.info(
    "GM mode, GM2 channel 10, XG drum part protect and All Notes Off:"
);
{
    const synth = new SpessaSynthProcessor(SAMPLE_RATE);
    const sf = readFileSync("tests/files/sound_bank/gm.sf2");
    synth.soundBankManager.addSoundBank(
        SoundBankLoader.fromArrayBuffer(
            sf.buffer.slice(sf.byteOffset, sf.byteOffset + sf.byteLength)
        ),
        "main"
    );
    await synth.ready;
    const gs = (address: number[], data: number[]) => {
        const body = [...address, ...data];
        const checksum = (128 - (body.reduce((x, y) => x + y, 0) % 128)) % 128;
        synth.systemExclusive(
            [0x41, 0x10, 0x42, 0x12, ...body, checksum, 0xf7],
            0
        );
    };
    const xg = (address: number[], data: number[]) =>
        synth.systemExclusive([0x43, 0x10, 0x4c, ...address, ...data, 0xf7], 0);
    const channel = synth.midiChannels[0];
    const render = (quanta: number) => {
        for (let i = 0; i < quanta; i++)
            synth.process(new Float32Array(128), new Float32Array(128));
    };

    // GM mode
    synth.systemExclusive([0x7e, 0x7f, 0x09, 0x01, 0xf7], 0);
    check(synth.midiParameters.system === "gm", "GM1 on sets the GM mode");
    channel.controllerChange(MIDIControllers.bankSelect, 8);
    channel.controllerChange(MIDIControllers.bankSelectLSB, 3);
    channel.programChange(5);
    check(
        channel.patch.bankMSB === 0 && channel.patch.bankLSB === 0,
        `GM ignores bank selects (${channel.patch.bankMSB}:${channel.patch.bankLSB})`
    );
    channel.controllerChange(MIDIControllers.nonRegisteredParameterMSB, 1);
    channel.controllerChange(MIDIControllers.nonRegisteredParameterLSB, 0x20);
    channel.controllerChange(MIDIControllers.dataEntryMSB, 100);
    check(
        channel.midiControllers[MIDIControllers.brightness] >> 7 === 64,
        "GM ignores NRPN"
    );
    channel.controllerChange(MIDIControllers.registeredParameterMSB, 0);
    channel.controllerChange(MIDIControllers.registeredParameterLSB, 0);
    channel.controllerChange(MIDIControllers.dataEntryMSB, 7);
    check(
        channel.midiParameters.pitchWheelRange === 7,
        `GM keeps RPN (${channel.midiParameters.pitchWheelRange})`
    );
    gs([0x40, 0x11, 0x19], [33]);
    check(
        channel.midiControllers[MIDIControllers.mainVolume] >> 7 === 100,
        "GM ignores the GS part level"
    );
    xg([0x08, 0x00, 0x0b], [33]);
    check(
        channel.midiControllers[MIDIControllers.mainVolume] >> 7 === 100,
        "GM ignores the XG volume"
    );
    synth.systemExclusive([0x7f, 0x7f, 0x04, 0x01, 0x00, 0x40, 0xf7], 0);
    check(
        Math.abs(synth.midiParameters.volume - 8192 / 16_383) < 0.001,
        "GM keeps the universal master volume"
    );
    gs([0x40, 0x00, 0x7f], [0x00]);
    check(synth.midiParameters.system === "gs", "a GS reset leaves GM");
    synth.systemExclusive([0x7e, 0x7f, 0x09, 0x01, 0xf7], 0);
    xg([0x00, 0x00, 0x7e], [0x00]);
    check(synth.midiParameters.system === "xg", "XG system on leaves GM");

    // XG drum part protect
    const ten = synth.midiChannels[9];
    ten.controllerChange(MIDIControllers.bankSelect, 0);
    check(
        ten.patch.bankMSB === 127,
        `XG channel 10 ignores the bank MSB 0 (${ten.patch.bankMSB})`
    );
    ten.controllerChange(MIDIControllers.bankSelect, 126);
    check(
        ten.patch.bankMSB === 126,
        `XG channel 10 receives the bank MSB 126 (${ten.patch.bankMSB})`
    );

    // GM2 channel 10
    synth.systemExclusive([0x7e, 0x7f, 0x09, 0x03, 0xf7], 0);
    check(
        ten.patch.bankMSB === 120 && ten.drumChannel,
        `GM2 channel 10 starts at 120 as drums (${ten.patch.bankMSB})`
    );
    ten.controllerChange(MIDIControllers.bankSelect, 121);
    ten.programChange(0);
    check(
        ten.patch.bankMSB === 121 && !ten.drumChannel,
        `GM2 channel 10 turns melodic with 121 (${ten.patch.bankMSB})`
    );

    // All Notes Off with the pedal
    gs([0x40, 0x00, 0x7f], [0x00]);
    const first = synth.midiChannels[0];
    first.controllerChange(MIDIControllers.sustainPedal, 127);
    first.noteOn(60, 100);
    render(20);
    first.controllerChange(MIDIControllers.allNotesOff, 0);
    render(20);
    const held = synth.voices.filter((v) => v.isActive && v.channel === 0);
    check(
        held.length > 0 && held.every((v) => v.isHeld && !v.isInRelease),
        `All Notes Off with the pedal down holds the voices (${held.length})`
    );
    first.controllerChange(MIDIControllers.sustainPedal, 0);
    render(20);
    check(
        synth.voices
            .filter((v) => v.isActive && v.channel === 0)
            .every((v) => v.isInRelease),
        "the pedal going up releases them"
    );
    first.noteOn(62, 100);
    render(5);
    first.controllerChange(MIDIControllers.allNotesOff, 0);
    render(20);
    check(
        synth.voices
            .filter((v) => v.isActive && v.channel === 0 && v.midiNote === 62)
            .every((v) => v.isInRelease),
        "All Notes Off without the pedal releases"
    );
}

console.info("Part mode, bank MSB 126, system mode set and depth aliases:");
{
    const synth = new SpessaSynthProcessor(SAMPLE_RATE);
    const sf = readFileSync("tests/files/sound_bank/gm.sf2");
    synth.soundBankManager.addSoundBank(
        SoundBankLoader.fromArrayBuffer(
            sf.buffer.slice(sf.byteOffset, sf.byteOffset + sf.byteLength)
        ),
        "main"
    );
    await synth.ready;
    const gs = (address: number[], data: number[]) => {
        const body = [...address, ...data];
        const checksum = (128 - (body.reduce((x, y) => x + y, 0) % 128)) % 128;
        synth.systemExclusive(
            [0x41, 0x10, 0x42, 0x12, ...body, checksum, 0xf7],
            0
        );
    };
    const xg = (address: number[], data: number[]) =>
        synth.systemExclusive([0x43, 0x10, 0x4c, ...address, ...data, 0xf7], 0);
    const ten = synth.midiChannels[9];

    // XG channel 10 with the bank MSB 126 stays on drums
    xg([0x00, 0x00, 0x7e], [0x00]);
    ten.controllerChange(MIDIControllers.bankSelect, 126);
    ten.programChange(0);
    check(
        ten.drumChannel && ten.preset?.isDrum === true,
        `XG channel 10 with the bank MSB 126 stays a drum channel (${ten.preset?.name})`
    );
    const first = synth.midiChannels[0];
    first.controllerChange(MIDIControllers.bankSelect, 126);
    first.programChange(0);
    check(!first.drumChannel, "XG channel 1 with the bank MSB 126 is melodic");
    // GM2 has no such rule
    synth.systemExclusive([0x7e, 0x7f, 0x09, 0x03, 0xf7], 0);
    ten.controllerChange(MIDIControllers.bankSelect, 126);
    ten.programChange(0);
    check(
        !ten.drumChannel,
        "GM2 channel 10 with the bank MSB 126 and no match is melodic"
    );

    // Part mode value after a reset
    xg([0x00, 0x00, 0x7e], [0x00]);
    check(
        ten.midiParameters.drumMap === 2 &&
            synth.midiChannels[0].midiParameters.drumMap === 0,
        `the part mode value after an XG reset is 2 on channel 10 and 0 elsewhere (${ten.midiParameters.drumMap})`
    );
    synth.systemExclusive([0x7e, 0x7f, 0x09, 0x03, 0xf7], 0);
    check(
        ten.midiParameters.drumMap === 1,
        `the part mode value after a GM2 reset is 1 on channel 10 (${ten.midiParameters.drumMap})`
    );
    gs([0x40, 0x00, 0x7f], [0x00]);
    check(
        ten.midiParameters.drumMap === 1,
        `the part mode value after a GS reset is 1 on channel 10 (${ten.midiParameters.drumMap})`
    );

    // USE FOR RHYTHM PART in XG
    xg([0x00, 0x00, 0x7e], [0x00]);
    gs([0x40, 0x10, 0x15], [0x00]);
    check(
        ten.drumChannel && ten.patch.bankMSB === 127,
        "USE FOR RHYTHM PART 0 cannot make XG channel 10 melodic"
    );
    check(
        ten.midiParameters.drumMap === 2,
        `the refused value is not stored (${ten.midiParameters.drumMap})`
    );
    gs([0x40, 0x12, 0x15], [0x01]);
    const two = synth.midiChannels[1];
    check(
        two.drumChannel && two.patch.bankMSB === 127,
        `USE FOR RHYTHM PART 1 makes an XG channel a drum channel (${two.patch.bankMSB})`
    );
    gs([0x40, 0x12, 0x15], [0x00]);
    check(
        !two.drumChannel && two.patch.bankMSB === 0,
        "USE FOR RHYTHM PART 0 makes it melodic again"
    );

    // USE FOR RHYTHM PART in GM2
    synth.systemExclusive([0x7e, 0x7f, 0x09, 0x03, 0xf7], 0);
    gs([0x40, 0x12, 0x15], [0x01]);
    check(
        two.drumChannel && two.patch.bankMSB === 120 && !two.patch.isGMGSDrum,
        `USE FOR RHYTHM PART 1 in GM2 sets the bank MSB 120 (${two.patch.bankMSB})`
    );
    two.controllerChange(MIDIControllers.bankSelect, 121);
    two.programChange(0);
    check(
        !two.drumChannel && two.patch.bankMSB === 121,
        "GM2 CC 0 of 121 then a Program Change is melodic, the drum flag does not stay"
    );

    // PART MODE keeps the kit bank 120 in XG
    xg([0x00, 0x00, 0x7e], [0x00]);
    const three = synth.midiChannels[2];
    three.controllerChange(MIDIControllers.bankSelect, 120);
    three.programChange(0);
    xg([0x08, 0x02, 0x07], [0x01]);
    check(
        three.patch.bankMSB === 120 && three.drumChannel,
        `XG PART MODE keeps the bank MSB 120 (${three.patch.bankMSB})`
    );

    // Coarse tuning of an XG drum channel is a pitch shift, the fine tuning is ignored
    const tuning = () =>
        (ten as unknown as { currentTuning: number }).currentTuning;
    const rpn = (lsb: number, msb: number) => {
        ten.controllerChange(MIDIControllers.registeredParameterMSB, 0);
        ten.controllerChange(MIDIControllers.registeredParameterLSB, lsb);
        ten.controllerChange(MIDIControllers.dataEntryMSB, msb);
        ten.controllerChange(MIDIControllers.dataEntryLSB, 0);
    };
    rpn(2, 66);
    check(
        tuning() === 200,
        `XG drum channel plays the coarse tuning as a pitch shift (${tuning()} cents)`
    );
    rpn(2, 64);
    rpn(1, 100);
    check(
        tuning() === 0,
        `XG drum channel ignores the fine tuning (${tuning()} cents)`
    );
    synth.systemExclusive([0x7e, 0x7f, 0x09, 0x03, 0xf7], 0);
    rpn(2, 66);
    check(
        tuning() === 0,
        `a GM2 drum channel ignores the coarse tuning (${tuning()} cents)`
    );

    // SYSTEM MODE SET
    xg([0x00, 0x00, 0x7e], [0x00]);
    first.controllerChange(MIDIControllers.mainVolume, 30);
    synth.systemExclusive(
        [0x41, 0x10, 0x42, 0x12, 0x00, 0x00, 0x7f, 0x02, 0x7f, 0xf7],
        0
    );
    check(
        synth.midiParameters.system === "xg" &&
            first.midiControllers[MIDIControllers.mainVolume] >> 7 === 30,
        "SYSTEM MODE SET 02 does not reset"
    );
    synth.systemExclusive(
        [0x41, 0x10, 0x42, 0x12, 0x00, 0x00, 0x7f, 0x00, 0x01, 0xf7],
        0
    );
    check(
        synth.midiParameters.system === "gs" &&
            first.midiControllers[MIDIControllers.mainVolume] >> 7 === 100,
        "SYSTEM MODE SET 00 resets to GS"
    );
    xg([0x00, 0x00, 0x7e], [0x00]);
    first.controllerChange(MIDIControllers.mainVolume, 30);
    synth.systemExclusive(
        [0x41, 0x10, 0x42, 0x12, 0x00, 0x00, 0x7f, 0x01, 0x00, 0xf7],
        0
    );
    check(
        synth.midiParameters.system === "gs" &&
            first.midiControllers[MIDIControllers.mainVolume] >> 7 === 100,
        "SYSTEM MODE SET 01 resets to GS"
    );

    // The depth aliases store what RPN 5 stores for v = round(6.4 * value)
    const reference = synth.midiChannels[3];
    const viaRPN = (v: number) => {
        reference.controllerChange(MIDIControllers.registeredParameterMSB, 0);
        reference.controllerChange(MIDIControllers.registeredParameterLSB, 5);
        reference.controllerChange(MIDIControllers.dataEntryMSB, v >> 7);
        reference.controllerChange(MIDIControllers.dataEntryLSB, v & 127);
        return reference.midiParameters.modulationDepth;
    };
    let wrong = 0;
    for (let value = 0; value < 128; value++) {
        gs([0x40, 0x21, 0x04], [value]);
        if (
            first.midiParameters.modulationDepth !==
            viaRPN(Math.round(6.4 * value))
        )
            wrong++;
    }
    check(
        wrong === 0,
        `GS MOD LFO1 PITCH DEPTH stores what RPN 5 stores for round(6.4 * value) (${wrong} wrong)`
    );
    wrong = 0;
    xg([0x00, 0x00, 0x7e], [0x00]);
    for (let value = 0; value < 128; value++) {
        xg([0x08, 0x00, 0x20], [value]);
        if (
            first.midiParameters.modulationDepth !==
            viaRPN(Math.round(6.4 * Math.min(value, 40)))
        )
            wrong++;
    }
    check(
        wrong === 0,
        `XG MW LFO PMOD DEPTH stores what RPN 5 stores for round(6.4 * min(value, 40)) (${wrong} wrong)`
    );
    xg([0x08, 0x00, 0x20], [127]);
    check(
        first.midiParameters.modulationDepth === viaRPN(256),
        `XG MW LFO PMOD DEPTH is capped at v = 256 (${first.midiParameters.modulationDepth})`
    );
}

console.info(
    "GM part mode, GS unchanged part mode, user drum sets and snapshots:"
);
{
    SpessaLog.warnEnabled = false;
    const sample = sineSample();
    // A bank with programs 0 and 1 melodic and, when asked, GM/GS and XG drum presets
    const bankWith = (drums: boolean, ownKit64 = false) => {
        const bank = new BasicSoundBank();
        bank.addSamples(sample);
        const instrument = new BasicInstrument();
        instrument.name = "i";
        instrument.createZone(sample);
        bank.addInstruments(instrument);
        const add = (
            name: string,
            program: number,
            bankMSB: number,
            isGMGSDrum: boolean
        ) => {
            const preset = new BasicPreset(bank);
            preset.name = name;
            preset.program = program;
            preset.bankMSB = bankMSB;
            preset.isGMGSDrum = isGMGSDrum;
            preset.createZone(instrument);
            bank.addPresets(preset);
        };
        add("M0", 0, 0, false);
        add("M1", 1, 0, false);
        add("M0_126", 0, 126, false);
        if (drums) {
            add("GMD0", 0, 0, true);
            add("GMD1", 1, 0, true);
            add("XGD0", 0, 127, false);
        }
        if (ownKit64) add("OWN64", 64, 0, true);
        bank.flush();
        return bank;
    };
    const create = async (bank: BasicSoundBank) => {
        const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
            effectsEnabled: false,
            eventsEnabled: false
        });
        synth.soundBankManager.addSoundBank(bank, "main");
        await synth.ready;
        return synth;
    };
    const modes = {
        gm: [0x7e, 0x7f, 0x09, 0x01, 0xf7],
        gs: [0x41, 0x10, 0x42, 0x12, 0x40, 0x00, 0x7f, 0x00, 0x41, 0xf7],
        gm2: [0x7e, 0x7f, 0x09, 0x03, 0xf7],
        xg: [0x43, 0x10, 0x4c, 0x00, 0x00, 0x7e, 0x00, 0xf7]
    };
    // Part index 0 is channel 10
    // eslint-disable-next-line unicorn/no-unnecessary-parameters -- Keeps the channel to part address mapping readable, mirrors xgPart
    const gsPart = (channel: number, value: number) => [
        0x41,
        0x10,
        0x42,
        0x12,
        0x40,
        0x10 | (channel === 9 ? 0 : channel < 9 ? channel + 1 : channel),
        0x15,
        value,
        0,
        0xf7
    ];
    const xgPart = (channel: number, value: number) => [
        0x43,
        0x10,
        0x4c,
        0x08,
        channel,
        0x07,
        value,
        0xf7
    ];

    // GM ignores both part mode messages
    {
        const synth = await create(bankWith(true));
        synth.systemExclusive(modes.gm, 0);
        const channel = synth.midiChannels[2];
        channel.programChange(1);
        synth.systemExclusive(gsPart(2, 1), 0);
        synth.systemExclusive(xgPart(2, 1), 0);
        check(
            !channel.drumChannel &&
                channel.preset?.name === "M1" &&
                channel.midiParameters.drumMap === 0,
            `GM ignores USE FOR RHYTHM PART and PART MODE (${channel.preset?.name})`
        );
    }

    // GS, an unchanged part mode value selects nothing
    {
        const synth = await create(bankWith(true));
        synth.systemExclusive(modes.gs, 0);
        const channel = synth.midiChannels[2];
        synth.systemExclusive(gsPart(2, 1), 0);
        channel.programChange(1);
        synth.systemExclusive(gsPart(2, 1), 0);
        check(
            channel.drumChannel && channel.preset?.name === "GMD1",
            `an unchanged GS part mode value keeps the program (${channel.preset?.name})`
        );
        synth.systemExclusive(gsPart(2, 2), 0);
        check(
            channel.preset?.name === "GMD0",
            `a changed value selects program 0 (${channel.preset?.name})`
        );
    }

    // User drum sets
    {
        const synth = await create(bankWith(true, true));
        synth.systemExclusive(modes.gs, 0);
        const drums = synth.midiChannels[9];
        drums.programChange(64);
        check(
            drums.preset?.name === "OWN64",
            `a preset of the bank at program 64 hides the user drum set (${drums.preset?.name})`
        );
    }
    {
        const synth = await create(bankWith(true));
        synth.systemExclusive(modes.gs, 0);
        const drums = synth.midiChannels[9];
        drums.programChange(64);
        check(
            drums.preset?.name === "User Drum Set 1",
            `program 64 on a GS drum channel gives the user drum set (${drums.preset?.name})`
        );
        drums.controllerChange(MIDIControllers.bankSelectLSB, 1);
        drums.programChange(64);
        check(
            drums.preset?.name !== "User Drum Set 1",
            `the SC-55 map (bank LSB 1) has no user drum set (${drums.preset?.name})`
        );
        // The SC-88 and SC-88Pro maps have them (measured on 88emu), testcase: FADED88.mid
        for (const lsb of [2, 3]) {
            drums.controllerChange(MIDIControllers.bankSelectLSB, lsb);
            drums.programChange(64);
            check(
                drums.preset?.name === "User Drum Set 1",
                `bank LSB ${lsb} gives the user drum set (${drums.preset?.name})`
            );
        }
        drums.controllerChange(MIDIControllers.bankSelectLSB, 0);
        // Drum parts ignore the bank MSB
        drums.controllerChange(MIDIControllers.bankSelect, 1);
        drums.programChange(65);
        check(
            drums.preset?.name === "User Drum Set 2",
            `bank MSB 1 still gives the user drum set (${drums.preset?.name})`
        );
        drums.controllerChange(MIDIControllers.bankSelect, 0);
        synth.systemExclusive(modes.xg, 0);
        drums.programChange(64);
        check(
            !drums.preset?.name.startsWith("User"),
            `XG never gets a user drum set (${drums.preset?.name})`
        );
        synth.systemExclusive(modes.gm2, 0);
        drums.programChange(64);
        check(
            !drums.preset?.name.startsWith("User"),
            `GM2 never gets a user drum set (${drums.preset?.name})`
        );
    }

    // SFe revision: 14-bit controllers, Mono/Poly On, XG channel 10 bank 120 and the drum fallback below 49
    {
        const bank = bankWith(true);
        for (const [name, program, bankMSB] of [
            ["XGD40", 40, 127],
            ["XGD56", 56, 127],
            ["GM2D58", 58, 120]
        ] as const) {
            const preset = new BasicPreset(bank);
            preset.name = name;
            preset.program = program;
            preset.bankMSB = bankMSB;
            preset.isGMGSDrum = false;
            preset.createZone(bank.instruments[0]);
            bank.addPresets(preset);
        }
        bank.flush();
        const synth = await create(bank);
        synth.systemExclusive(modes.gs, 0);
        const ch = synth.midiChannels[0];

        // CC 1 to 31 and CC 33 to 63 are independent controllers (11.3)
        ch.controllerChange(MIDIControllers.modulationWheelLSB, 5);
        ch.controllerChange(MIDIControllers.modulationWheel, 10);
        check(
            ch.midiControllers[MIDIControllers.modulationWheel] === 10 << 7 &&
                ch.midiControllers[MIDIControllers.modulationWheelLSB] ===
                    5 << 7,
            `CC 1 leaves CC 33 alone (${ch.midiControllers[MIDIControllers.modulationWheel]}, ${ch.midiControllers[MIDIControllers.modulationWheelLSB]})`
        );
        ch.controllerChange(MIDIControllers.modulationWheelLSB, 7);
        check(
            ch.midiControllers[MIDIControllers.modulationWheel] === 10 << 7,
            `CC 33 does not change CC 1 (${ch.midiControllers[MIDIControllers.modulationWheel]})`
        );

        // Mono and Poly On act as All Notes Off, so the sustain pedal holds the notes (11.5)
        ch.programChange(0);
        ch.controllerChange(MIDIControllers.sustainPedal, 127);
        ch.noteOn(60, 100);
        synth.process(new Float32Array(128), new Float32Array(128));
        ch.controllerChange(MIDIControllers.polyModeOn, 0);
        synth.process(new Float32Array(128), new Float32Array(128));
        check(
            ch.voiceCount > 0 && ch.midiParameters.polyMode,
            `Poly On releases like All Notes Off, the pedal holds the voice (${ch.voiceCount} voices)`
        );
        ch.controllerChange(MIDIControllers.monoModeOn, 0);
        check(
            !ch.midiParameters.polyMode,
            "Mono On switches the channel to mono after the notes off"
        );
        ch.controllerChange(MIDIControllers.polyModeOn, 0);
        ch.controllerChange(MIDIControllers.sustainPedal, 0);

        // Drum fallback 3.1.3: a drum preset with the same program only below 49 (11.2.3)
        const ten = synth.midiChannels[9];
        ten.programChange(40);
        check(
            ten.preset?.name === "XGD40",
            `a GS drum request for program 40 falls back to the XG kit at 40 (${ten.preset?.name})`
        );
        ten.programChange(56);
        check(
            ten.preset?.name === "GMD0",
            `a GS drum request for program 56 skips the XG kit at 56 (${ten.preset?.name})`
        );
        // A kit at bank MSB 120 (GM2) numbers its kits like GS, so it counts at any program
        ten.programChange(58);
        check(
            ten.preset?.name === "GM2D58",
            `a GS drum request for program 58 takes the MSB 120 kit at 58 (${ten.preset?.name})`
        );

        // XG channel 10 accepts the bank MSB 120, 126 and 127 only (11.2.2)
        synth.systemExclusive(modes.xg, 0);
        ten.controllerChange(MIDIControllers.bankSelect, 120);
        check(
            ten.patch.bankMSB === 120,
            `XG channel 10 accepts the bank MSB 120 (${ten.patch.bankMSB})`
        );
        ten.controllerChange(MIDIControllers.bankSelect, 1);
        check(
            ten.patch.bankMSB === 120,
            `XG channel 10 ignores the bank MSB 1 (${ten.patch.bankMSB})`
        );
    }

    // Rule 3.2.2: a drum preset with the same program above 48 only counts in GM2, which numbers its kits like GS
    {
        const bank = bankWith(true);
        const preset = new BasicPreset(bank);
        preset.name = "GMD56";
        preset.program = 56;
        preset.isGMGSDrum = true;
        preset.createZone(bank.instruments[0]);
        bank.addPresets(preset);
        bank.flush();
        const synth = await create(bank);
        const ten = synth.midiChannels[9];
        synth.systemExclusive(modes.gm2, 0);
        ten.programChange(56);
        check(
            ten.preset?.name === "GMD56",
            `GM2 drum program 56 falls back to the GS kit at 56 (${ten.preset?.name})`
        );
        synth.systemExclusive(modes.xg, 0);
        ten.programChange(56);
        check(
            ten.preset?.name !== "GMD56",
            `XG drum program 56 does not take the GS kit at 56 (${ten.preset?.name})`
        );
    }

    // A bank with no drum preset
    {
        const synth = await create(bankWith(false));
        synth.systemExclusive(modes.gs, 0);
        const ten = synth.midiChannels[9];
        check(
            !ten.drumChannel && ten.preset?.isDrum === false,
            `channel 10 after a GS reset plays a melodic preset (${ten.preset?.name})`
        );
        const three = synth.midiChannels[2];
        synth.systemExclusive(gsPart(2, 1), 0);
        synth.systemExclusive(modes.gs, 0);
        check(
            !three.patch.isGMGSDrum && three.midiParameters.drumMap === 0,
            "a system reset clears the drum flag set by USE FOR RHYTHM PART"
        );
    }

    // Snapshots
    {
        const synth = await create(bankWith(true));
        synth.systemExclusive(modes.gs, 0);
        synth.midiChannels[9].programChange(1);
        const snapshot = synth.getSnapshot();
        synth.systemExclusive(modes.gm, 0);
        synth.applySnapshot(snapshot);
        check(
            synth.midiChannels[9].drumChannel &&
                synth.midiChannels[9].preset?.name === "GMD1",
            "a drum channel snapshot restores the drum channel on a bank with drums"
        );
        const bare = await create(bankWith(false));
        bare.applySnapshot(snapshot);
        check(
            !bare.midiChannels[9].drumChannel &&
                bare.midiChannels[9].preset?.isDrum === false,
            "a drum channel snapshot is not a drum channel on a bank without drums"
        );
    }

    // XG channel 10 with the bank MSB 126
    {
        const synth = await create(bankWith(true));
        synth.systemExclusive(modes.xg, 0);
        const ten = synth.midiChannels[9];
        ten.controllerChange(MIDIControllers.bankSelect, 126);
        ten.programChange(0);
        check(
            ten.preset?.name === "M0_126" && !ten.drumChannel,
            `XG channel 10 with an exact match at the bank MSB 126 is melodic (${ten.preset?.name})`
        );
        ten.programChange(1);
        check(
            ten.drumChannel && ten.preset?.isDrum === true,
            `XG channel 10 with the bank MSB 126 and no match is a drum channel (${ten.preset?.name})`
        );
    }
}

// A reset does not replay the channel mode messages, so a mono channel goes back to poly without a flip through the mode messages
{
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    await synth.ready;
    const channel = synth.midiChannels[0];
    channel.controllerChange(MIDIControllers.monoModeOn, 1);
    const calls = new Array<string>();
    const original = channel.setMIDIParameter;
    (channel as { setMIDIParameter: typeof original }).setMIDIParameter = (
        ...args: Parameters<typeof original>
    ) => {
        calls.push(`${args[0]}=${String(args[1])}`);
        original.apply(channel, args);
    };
    synth.reset("gs");
    const modeCalls = calls.filter((c) => c.startsWith("polyMode"));
    check(
        !modeCalls.includes("polyMode=false") &&
            channel.midiParameters.polyMode,
        `a reset brings back poly mode without replaying CC 126 (${modeCalls.join(", ")})`
    );
}

// A program change that finds no preset still sends programChange, with an empty name
{
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false
    });
    await synth.ready;
    // No sound bank, so nothing is found for any selection
    synth.onMissingPreset = () => undefined;
    const events = new Array<{ name: string; program: number }>();
    synth.onEventCall = (e) => {
        if (e.type === "programChange") events.push(e.data);
    };
    const channel = synth.midiChannels[0];
    channel.controllerChange(MIDIControllers.bankSelect, 5);
    channel.programChange(42);
    check(
        events.length === 1 &&
            events[0].name === "" &&
            events[0].program === 42 &&
            channel.preset === undefined,
        `a program change with no preset sends an empty name (${JSON.stringify(events)})`
    );
}

// A drum channel ignores mono mode, like the Sound Canvas: a new drum note does not cut the previous one
{
    const bank = makeBank(sineSample(), {
        [GeneratorTypes.releaseVolEnv]: 1200
    });
    bank.presets[0].isGMGSDrum = true;
    bank.flush();
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    synth.soundBankManager.addSoundBank(bank, "main");
    await synth.ready;
    const drums = synth.midiChannels[9];
    drums.controllerChange(MIDIControllers.monoModeOn, 1);
    drums.noteOn(49, 100);
    drums.noteOff(49);
    drums.noteOn(42, 100);
    // A killed voice fades within about 15 ms, the release here is 2 s
    const left = new Float32Array(128);
    const right = new Float32Array(128);
    for (let q = 0; q < 35; q++) synth.process(left, right);
    const crash = synth.voices.find(
        (v) => v.isActive && v.channel === 9 && v.midiNote === 49
    );
    check(
        crash !== undefined && !drums.midiParameters.polyMode,
        "in mono mode a drum note keeps ringing after the next drum note"
    );
}

// The pitch wheel is kept a whole 0 to 16383, it indexes the 14-bit source table
{
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    await synth.ready;
    const channel = synth.midiChannels[0];
    channel.pitchWheel(16_384);
    const high = channel.midiParameters.pitchWheel;
    channel.pitchWheel(8192.6);
    const fraction = channel.midiParameters.pitchWheel;
    channel.pitchWheel(-5);
    const low = channel.midiParameters.pitchWheel;
    check(
        high === 16_383 && fraction === 8193 && low === 0,
        `pitch wheel values outside 0 to 16383 or fractional are clamped and rounded (${high}, ${fraction}, ${low})`
    );
}

finish("midi_behavior_test");
