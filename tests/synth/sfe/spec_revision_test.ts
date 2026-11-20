// Rules of the SFe 4 spec revision: the RIFS form type (3.1), one DMOD per file (4.2), the DMOD size (7.3),
// The zero xdta shdr terminal (5.5), isng and sampleModes in SF2 conversion (9.1), the generator saturation and the
// Generators that are not plain values (7.1), No Controller (7.2), duplicate modulators (7.3, 7.4),
// The resonance gain (7.1.1) and the removed TONE MAP-0 NUMBER (11.6.2)
import { SoundFont2 } from "../../../src/soundbank/soundfont/read/soundfont";
import {
    ModulatorCurve,
    SOURCE_VALUE_14_BIT,
    SOURCE_VALUE_7_BIT
} from "../../../src/soundbank/basic_soundbank/modulator_curve";
import {
    BasicInstrument,
    BasicSample,
    BasicSoundBank,
    CustomCurve,
    DEFAULT_SOUND_BANK_LOAD_OPTIONS,
    type GeneratorType,
    GeneratorTypes,
    MIDIControllers,
    MIDIUtils,
    Modulator,
    ModulatorControllerSources,
    ModulatorCurveTypes,
    ModulatorSource,
    type ModulatorTransformType,
    SampleTypes,
    SoundBankLoader,
    SPESSASYNTH_DEFAULT_MODULATORS,
    SpessaSynthProcessor
} from "../../../src";
import { GeneratorLimits } from "../../../src/soundbank/basic_soundbank/generator_types";
import { fromSF2DefaultModulators } from "../../../src/soundbank/soundfont/sf2_compatibility";
import {
    check,
    finish,
    makeBank,
    SAMPLE_RATE,
    sf2RoundTrip,
    sineSample,
    zoneGenerator
} from "./sfe_test_utils";

/**
 * Finds a four character code in the bytes.
 */
function find(bytes: Uint8Array, id: string, from = 0) {
    const codes = [...id].map((c) => c.charCodeAt(0));
    for (let i = from; i < bytes.length - 3; i++) {
        if (codes.every((c, j) => bytes[i + j] === c)) return i;
    }
    return -1;
}

/**
 * Inserts bytes at an offset and grows the RIFF and INFO list sizes by their length.
 */
function insertIntoInfo(bytes: Uint8Array, offset: number, extra: Uint8Array) {
    const out = new Uint8Array(bytes.length + extra.length);
    out.set(bytes.subarray(0, offset));
    out.set(extra, offset);
    out.set(bytes.subarray(offset), offset + extra.length);
    const view = new DataView(out.buffer);
    const info = find(out, "INFO") - 8;
    view.setUint32(4, view.getUint32(4, true) + extra.length, true);
    view.setUint32(
        info + 4,
        view.getUint32(info + 4, true) + extra.length,
        true
    );
    return out;
}

const throwsWith = (buffer: ArrayBuffer, text: string) => {
    try {
        SoundBankLoader.fromArrayBuffer(buffer);
        return false;
    } catch (error) {
        return String(error).includes(text);
    }
};

const bank = makeBank(sineSample());
// A name longer than 20 characters makes the writer add xdta
bank.samples[0].name = "a thirty character sample nam";
const sfe = new Uint8Array(bank.writeSFe());
check(
    SoundBankLoader.fromArrayBuffer(sfe.slice().buffer).samples[0].name ===
        bank.samples[0].name,
    "the unmodified SFe file loads with the long sample name"
);

// 3.1: RIFS must be sfen
{
    const riffs = new Uint8Array(16);
    riffs.set(
        [..."RIFS"].map((c) => c.charCodeAt(0)),
        0
    );
    riffs.set(
        [..."sfbk"].map((c) => c.charCodeAt(0)),
        12
    );
    check(
        throwsWith(riffs.buffer, "Expected 'sfen'"),
        "a RIFS file with the form type sfbk is rejected"
    );
    // The reader checks it too, not only the loader
    let readerRejects = false;
    try {
        new SoundFont2(riffs.buffer, false, DEFAULT_SOUND_BANK_LOAD_OPTIONS);
    } catch (error) {
        readerRejects = String(error).includes("Expected 'sfen'");
    }
    check(readerRejects, "the SoundFont2 reader rejects RIFS sfbk by itself");
}

// 4.2: a second DMOD makes the file invalid
const dmod = find(sfe, "DMOD");
const dmodSize = new DataView(sfe.buffer).getUint32(dmod + 4, true);
check(
    dmod > 0 && dmodSize % 10 === 0,
    `the written DMOD has whole records (${dmodSize} bytes)`
);
{
    const copy = sfe.slice(dmod, dmod + 8 + dmodSize);
    const doubled = insertIntoInfo(sfe, dmod + 8 + dmodSize, copy);
    check(
        throwsWith(doubled.buffer, "more than one DMOD"),
        "a file with two DMOD chunks is rejected"
    );
}
// The same for XMOD and CURV (curves A and B are written) and the xdta list (the long sample name)
for (const [id, start] of [
    ["XMOD", find(sfe, "XMOD")],
    ["CURV", find(sfe, "CURV")],
    // The list chunk starts 8 bytes before its type
    ["xdta", find(sfe, "xdta") - 8]
] as const) {
    const size = new DataView(sfe.buffer).getUint32(start + 4, true);
    const doubled = insertIntoInfo(
        sfe,
        start + 8 + size,
        sfe.slice(start, start + 8 + size)
    );
    check(
        start > 0 && throwsWith(doubled.buffer, `more than one ${id}`),
        `a file with two ${id} chunks is rejected`
    );
}

// 7.3: a DMOD that is not a multiple of 10 bytes is malformed
{
    const grown = insertIntoInfo(sfe, dmod + 8 + dmodSize, new Uint8Array(2));
    const view = new DataView(grown.buffer);
    view.setUint32(dmod + 4, dmodSize + 2, true);
    check(
        throwsWith(grown.buffer, "not a multiple of 10"),
        "a DMOD of 10n + 2 bytes is rejected"
    );
}

// 5.5: the xdta shdr terminal record is all zeros
{
    const xdta = find(sfe, "xdta");
    const shdr = find(sfe, "shdr", xdta);
    const size = new DataView(sfe.buffer).getUint32(shdr + 4, true);
    const terminal = sfe.subarray(shdr + 8 + size - 46, shdr + 8 + size);
    check(
        xdta > 0 && shdr > xdta && terminal.every((b) => b === 0),
        "the xdta shdr terminal record is all zeros"
    );
}

// 9.1: isng and sampleModes in an SF2 file
{
    bank.soundBankInfo.soundEngine = "SFe 4";
    const sf2 = sf2RoundTrip(bank);
    check(
        sf2.soundBankInfo.soundEngine === "EMU8000",
        `an SF2 file does not claim SFe 4 in isng (${sf2.soundBankInfo.soundEngine})`
    );
    // 3 stays, the alternating loop becomes a forward loop, any other value outside 0 to 3 is written as 0
    for (const [value, written] of [
        [3, 3],
        [4, 1],
        [5, 0]
    ] as const) {
        // Unvalidated, like a value read from a file
        const modes = makeBank(sineSample(), {}, (zone) =>
            zone.setGenerator(GeneratorTypes.sampleModes, value, false)
        );
        const read = zoneGenerator(
            sf2RoundTrip(modes),
            GeneratorTypes.sampleModes
        );
        check(
            read === written,
            `sampleModes ${value} is written as ${written} in SF2 (${read})`
        );
    }
    // The losses report counts the changed values
    const losses = makeBank(sineSample(), {
        [GeneratorTypes.sampleModes]: 4
    }).getSF2Losses();
    check(
        losses.alternatingLoops === 1,
        `the losses report counts the alternating loop (${losses.alternatingLoops})`
    );
}

// 7.1: only the final sum of a generator and its modulators saturates, the order of the modulators never matters
{
    // Two different sources, identical modulators would supersede each other (7.4)
    const cc = (index: 80 | 81) =>
        new ModulatorSource(index, ModulatorCurveTypes.linear, true);
    const modBank = makeBank(sineSample(), {}, (zone) => {
        // Base 13500, then +29766 and -29766 (CC 80 and 81 at 127). Clamping after every modulator gave 3001
        zone.setGenerator(GeneratorTypes.initialFilterFc, 13_500);
        zone.addModulators(
            new Modulator(
                cc(80),
                new ModulatorSource(),
                GeneratorTypes.initialFilterFc,
                30_000
            ),
            new Modulator(
                cc(81),
                new ModulatorSource(),
                GeneratorTypes.initialFilterFc,
                -30_000
            )
        );
    });
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    synth.soundBankManager.addSoundBank(modBank, "main");
    await synth.ready;
    const channel = synth.midiChannels[0];
    channel.controllerChange(80, 127);
    channel.controllerChange(81, 127);
    channel.noteOn(60, 100);
    const voice = synth.voices.find((v) => v.isActive);
    const cutoff = voice?.modulatedGenerators[GeneratorTypes.initialFilterFc];
    check(
        cutoff === 13_500,
        `two opposite modulators cancel before the final saturation (${cutoff})`
    );
    // A controller change after the note on takes the single source path, which must agree
    channel.controllerChange(80, 0);
    channel.controllerChange(80, 127);
    const after = voice?.modulatedGenerators[GeneratorTypes.initialFilterFc];
    check(
        after === 13_500,
        `the single source path gives the same sum (${after})`
    );
}

// Both paths cut the fractions once: amounts 100 (CC 80) and 101 (CC 81) at 1 give 201/128 together, not 0 + 0
{
    const fracBank = makeBank(sineSample(), {}, (zone) => {
        zone.setGenerator(GeneratorTypes.initialFilterFc, 5000);
        for (const [source, amount] of [
            [80, 100],
            [81, 101]
        ] as const) {
            zone.addModulators(
                new Modulator(
                    new ModulatorSource(
                        source,
                        ModulatorCurveTypes.linear,
                        true
                    ),
                    new ModulatorSource(),
                    GeneratorTypes.initialFilterFc,
                    amount
                )
            );
        }
    });
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    synth.soundBankManager.addSoundBank(fracBank, "main");
    await synth.ready;
    const channel = synth.midiChannels[0];
    channel.controllerChange(80, 1);
    channel.controllerChange(81, 1);
    channel.noteOn(60, 100);
    const voice = synth.voices.find((v) => v.isActive);
    const atNoteOn = voice?.modulatedGenerators[GeneratorTypes.initialFilterFc];
    channel.controllerChange(80, 0);
    channel.controllerChange(80, 1);
    const afterCC = voice?.modulatedGenerators[GeneratorTypes.initialFilterFc];
    check(
        atNoteOn === 5001 && afterCC === atNoteOn,
        `fractional modulator outputs round the same at note on and after a CC (${atNoteOn}, ${afterCC})`
    );
}

// 7.2: No Controller is x = 16384, the direction applies as for any other source.
// Positive gives 1, negative gives 0 (unipolar) or -1 (bipolar)
{
    for (const [isBipolar, isNegative, expected] of [
        [false, false, 6000],
        [true, false, 6000],
        [false, true, 5000],
        [true, true, 4000]
    ] as const) {
        const modBank = makeBank(sineSample(), {}, (zone) => {
            zone.setGenerator(GeneratorTypes.initialFilterFc, 5000);
            zone.addModulators(
                new Modulator(
                    new ModulatorSource(
                        ModulatorControllerSources.noController,
                        ModulatorCurveTypes.linear,
                        false,
                        isBipolar,
                        isNegative
                    ),
                    new ModulatorSource(),
                    GeneratorTypes.initialFilterFc,
                    1000
                )
            );
        });
        const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
            effectsEnabled: false,
            eventsEnabled: false
        });
        synth.soundBankManager.addSoundBank(modBank, "main");
        await synth.ready;
        synth.midiChannels[0].noteOn(60, 100);
        const voice = synth.voices.find((v) => v.isActive);
        const cutoff =
            voice?.modulatedGenerators[GeneratorTypes.initialFilterFc];
        // The exact output too, the truncated cutoff alone would hide the old 16383 (5000.06 reads as 5000)
        const index =
            voice?.modulators.findIndex(
                (m) =>
                    !m.primarySource.isCC &&
                    m.primarySource.index ===
                        ModulatorControllerSources.noController &&
                    m.destination === GeneratorTypes.initialFilterFc
            ) ?? -1;
        const output = voice?.modulatorValues[index];
        check(
            cutoff === expected && output === expected - 5000,
            `No Controller ${isBipolar ? "bipolar" : "unipolar"} ${isNegative ? "negative" : "positive"} gives exactly ${expected - 5000} (${output}, cutoff ${cutoff})`
        );
    }
}

// No Controller with a custom type but no curve, or an unknown type, outputs 0 like any unresolved source
for (const [label, sourceEnum] of [
    ["a custom type without a curve", 4 << 10],
    ["an unknown curve type", 5 << 10]
] as const) {
    const modBank = makeBank(sineSample(), {}, (zone) => {
        zone.setGenerator(GeneratorTypes.initialFilterFc, 5000);
        zone.addModulators(
            new Modulator(
                ModulatorSource.fromSourceEnum(sourceEnum),
                new ModulatorSource(),
                GeneratorTypes.initialFilterFc,
                1000
            )
        );
    });
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    synth.soundBankManager.addSoundBank(modBank, "main");
    await synth.ready;
    synth.midiChannels[0].noteOn(60, 100);
    const cutoff = synth.voices.find((v) => v.isActive)?.modulatedGenerators[
        GeneratorTypes.initialFilterFc
    ];
    check(cutoff === 5000, `No Controller with ${label} outputs 0 (${cutoff})`);
}

// A custom curve is evaluated at x = 16384, its end point. This one is 0 up to 16383 and full at 16384,
// So the old x = 16383 gave 0. Reversed, it is evaluated at 0
{
    const endOnly = new CustomCurve([
        { x: 0, y: 0 },
        { x: 16_383, y: 0 },
        { x: 16_384, y: 16_384 }
    ]);
    for (const [isNegative, expected] of [
        [false, 6000],
        [true, 5000]
    ] as const) {
        const modBank = makeBank(sineSample(), {}, (zone) => {
            zone.setGenerator(GeneratorTypes.initialFilterFc, 5000);
            zone.addModulators(
                new Modulator(
                    new ModulatorSource(
                        ModulatorControllerSources.noController,
                        endOnly,
                        false,
                        false,
                        isNegative
                    ),
                    new ModulatorSource(),
                    GeneratorTypes.initialFilterFc,
                    1000
                )
            );
        });
        const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
            effectsEnabled: false,
            eventsEnabled: false
        });
        synth.soundBankManager.addSoundBank(modBank, "main");
        await synth.ready;
        synth.midiChannels[0].noteOn(60, 100);
        const cutoff = synth.voices.find((v) => v.isActive)
            ?.modulatedGenerators[GeneratorTypes.initialFilterFc];
        check(
            cutoff === expected,
            `No Controller on a custom curve${isNegative ? ", reversed," : ""} gives ${expected} (${cutoff})`
        );
    }
}

// 7.1: a modulator on sampleModes is ignored, the stored value plays
{
    const loopingMode = async (amount: number) => {
        const modBank = makeBank(sineSample(), {}, (zone) => {
            zone.setGenerator(GeneratorTypes.sampleModes, 0);
            zone.addModulators(
                new Modulator(
                    new ModulatorSource(
                        ModulatorControllerSources.noController
                    ),
                    new ModulatorSource(),
                    GeneratorTypes.sampleModes,
                    amount
                )
            );
        });
        const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
            effectsEnabled: false,
            eventsEnabled: false
        });
        synth.soundBankManager.addSoundBank(modBank, "main");
        await synth.ready;
        synth.midiChannels[0].noteOn(60, 100);
        return synth.voices.find((v) => v.isActive)?.loopingMode;
    };
    const one = await loopingMode(1);
    check(one === 0, `a modulator on sampleModes is ignored (${one})`);
}

// 4.2 and 7.3 are rules for SFe files: an SF2 file with two DMOD chunks still loads, the last one wins
{
    const sf2 = new Uint8Array(makeBank(sineSample()).writeSF2());
    // The SF2 writer adds no DMOD for a default bank, so the SFe one is copied in twice after isng
    const dmodChunk = sfe.slice(dmod, dmod + 8 + dmodSize);
    const isng = find(sf2, "isng");
    const isngSize = new DataView(sf2.buffer).getUint32(isng + 4, true);
    const after = isng + 8 + isngSize + (isngSize % 2);
    // A DMOD with only its terminal record: no default modulators
    const emptyDmod = new Uint8Array(18);
    emptyDmod.set(
        [..."DMOD"].map((c) => c.charCodeAt(0)),
        0
    );
    emptyDmod[4] = 10;
    const withEmpty = insertIntoInfo(sf2, after, emptyDmod);
    // Inserted at the same offset, so the full DMOD ends up first and the empty one last
    const twice = insertIntoInfo(withEmpty, after, dmodChunk);
    check(
        !throwsWith(twice.buffer, ""),
        "an SF2 file with two DMOD chunks still loads"
    );
    const lastWins = SoundBankLoader.fromArrayBuffer(twice.buffer);
    const emptyOnly = SoundBankLoader.fromArrayBuffer(withEmpty.buffer);
    const fullOnly = SoundBankLoader.fromArrayBuffer(
        insertIntoInfo(sf2, after, dmodChunk).buffer
    );
    check(
        lastWins.defaultModulators.length ===
            emptyOnly.defaultModulators.length &&
            emptyOnly.defaultModulators.length !==
                fullOnly.defaultModulators.length,
        `the last DMOD of an SF2 file wins (${lastWins.defaultModulators.length} default modulators, ${fullOnly.defaultModulators.length} from the first)`
    );
}

// 7.1: modulators on most generators that are not plain values are ignored.
// That is overridingRootKey, exclusiveClass, keynum and the other pre-voice generators. The address offsets are modulated
{
    const fixed = (destination: GeneratorType, amount: number) =>
        new Modulator(
            new ModulatorSource(ModulatorControllerSources.noController),
            new ModulatorSource(),
            destination,
            amount
        );
    const modBank = makeBank(sineSample(), {}, (zone) => {
        // The stored exclusive class is 5. Modulated, the root key would be 60, the class 8, the key 29.
        // The start offset is modulated, it moves by 100 points
        zone.setGenerator(GeneratorTypes.exclusiveClass, 5);
        zone.addModulators(
            fixed(GeneratorTypes.overridingRootKey, 61),
            fixed(GeneratorTypes.exclusiveClass, 3),
            fixed(GeneratorTypes.keyNum, 30),
            fixed(GeneratorTypes.startAddrsOffset, 100)
        );
    });
    // A second zone on the same keys, in the same class
    const second = modBank.instruments[0].createZone(modBank.samples[0]);
    second.setGenerator(GeneratorTypes.exclusiveClass, 5);
    modBank.flush();
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    synth.soundBankManager.addSoundBank(modBank, "main");
    await synth.ready;
    const channel = synth.midiChannels[0];
    channel.noteOn(70, 100);
    const first = synth.voices.filter((v) => v.isActive && v.midiNote === 70);
    check(
        first.length === 2 &&
            first.every(
                (v) => v.exclusiveClass === 5 && v.releaseStartTime === Infinity
            ),
        `the stored exclusive class is used, the two voices of one note on keep playing (${first.map((v) => `${v.exclusiveClass}:${v.releaseStartTime}`).join(", ")})`
    );
    check(
        first.every((v) => v.rootKey === modBank.samples[0].originalKey),
        `an overridingRootKey modulator is ignored (${first.map((v) => v.rootKey).join(", ")})`
    );
    check(
        first.some(
            (v) =>
                v.modulatedGenerators[GeneratorTypes.startAddrsOffset] === 100
        ),
        "a start offset modulator applies"
    );
    check(
        first.every(
            (v) =>
                v.targetKey === 70 &&
                v.modulatedGenerators[GeneratorTypes.keyNum] === -1
        ),
        `a keynum modulator is ignored (${first[0]?.targetKey})`
    );
    channel.noteOn(72, 100);
    check(
        first.every((v) => v.releaseStartTime !== Infinity || !v.isActive),
        "the next note in the same exclusive class releases the older voices"
    );
    // All Notes Off resets the note IDs while held voices still sound. The same key again must still choke them
    channel.controllerChange(MIDIControllers.sustainPedal, 127);
    channel.noteOn(74, 100);
    channel.controllerChange(MIDIControllers.allNotesOff, 0);
    const held = synth.voices.filter((v) => v.isActive && v.midiNote === 74);
    channel.noteOn(74, 100);
    check(
        held.length === 2 && held.every((v) => v.overrideReleaseVolEnv !== 0),
        `a held voice on the same key is choked after All Notes Off reset the note IDs (${held.map((v) => v.overrideReleaseVolEnv).join(", ")})`
    );
    channel.controllerChange(MIDIControllers.sustainPedal, 0);
}

// 7.1: the address offsets take their modulators once at note on, truncated toward zero
{
    const bank = makeBank(sineSample(), {}, (zone) => {
        zone.addModulators(
            new Modulator(
                new ModulatorSource(
                    MIDIControllers.generalPurposeController1,
                    ModulatorCurveTypes.linear,
                    true
                ),
                new ModulatorSource(),
                GeneratorTypes.startAddrsOffset,
                101
            )
        );
    });
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    synth.soundBankManager.addSoundBank(bank, "main");
    await synth.ready;
    const channel = synth.midiChannels[0];
    // CC 16 at 64 is half, so the modulated offset is 50.5
    channel.controllerChange(MIDIControllers.generalPurposeController1, 64);
    channel.noteOn(60, 100);
    const voice = synth.voices.find((v) => v.isActive && v.midiNote === 60);
    check(
        voice?.wavetable.cursor === 50,
        `a start offset of 50.5 from a modulator starts at sample 50 (${voice?.wavetable.cursor})`
    );
}

// 7.1.1 and 7.3: only initialFilterQ lowers the level, filterQOffset changes the Q but not the level.
// The default CC 71 modulator targets filterQOffset and there is no gain compensator any more
{
    const cc71 = SPESSASYNTH_DEFAULT_MODULATORS.filter((m) =>
        m.primarySource.isController(MIDIControllers.filterResonance)
    );
    check(
        cc71.length === 1 &&
            cc71[0].destination === GeneratorTypes.filterQOffset &&
            cc71[0].transformAmount === 250 &&
            cc71[0].secondarySource.toSourceEnum() === 0x0c_c7,
        `the default CC 71 modulator targets filterQOffset with 250, has the CC 71 switch as its amount source and nothing else uses CC 71 (${cc71.map((m) => `${m.destination}:${m.transformAmount}`).join(", ")})`
    );
    // RMS of a sustained note, after the attack
    const level = async (
        generators: Partial<Record<GeneratorType, number>>
    ) => {
        const bank = makeBank(sineSample(), generators);
        const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
            effectsEnabled: false,
            eventsEnabled: false
        });
        synth.soundBankManager.addSoundBank(bank, "main");
        await synth.ready;
        synth.midiChannels[0].noteOn(60, 100);
        const left = new Float32Array(128);
        const right = new Float32Array(128);
        let sum = 0;
        let count = 0;
        for (let q = 0; q < 200; q++) {
            left.fill(0);
            right.fill(0);
            synth.process(left, right);
            if (q < 100) continue;
            for (const sample of left) sum += sample * sample;
            count += left.length;
        }
        return Math.sqrt(sum / count);
    };
    const plain = await level({});
    const withQ = await level({ [GeneratorTypes.initialFilterQ]: 400 });
    const withOffset = await level({ [GeneratorTypes.filterQOffset]: 400 });
    const withNegative = await level({ [GeneratorTypes.filterQOffset]: -400 });
    const db = (x: number) => 20 * Math.log10(x / plain);
    check(
        Math.abs(db(withQ) + 20) < 1,
        `initialFilterQ 400 lowers the level by about 20 dB (${db(withQ).toFixed(2)} dB)`
    );
    check(
        Math.abs(db(withOffset)) < 1 && Math.abs(db(withNegative)) < 1,
        `filterQOffset of 400 or -400 keeps the level (${db(withOffset).toFixed(2)}, ${db(withNegative).toFixed(2)} dB)`
    );
}

// 7.3 and 7.4: of identical modulators in one list (zone or DMOD), the later one applies, never the sum
{
    const fixedFc = (amount: number) =>
        new Modulator(
            new ModulatorSource(ModulatorControllerSources.noController),
            new ModulatorSource(),
            GeneratorTypes.initialFilterFc,
            amount
        );
    const cutoffOf = async (bank: ReturnType<typeof makeBank>) => {
        const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
            effectsEnabled: false,
            eventsEnabled: false
        });
        synth.soundBankManager.addSoundBank(bank, "main");
        await synth.ready;
        synth.midiChannels[0].noteOn(60, 100);
        return synth.voices.find((v) => v.isActive)?.modulatedGenerators[
            GeneratorTypes.initialFilterFc
        ];
    };
    // Instrument zone
    const zoneBank = makeBank(sineSample(), {}, (zone) => {
        zone.setGenerator(GeneratorTypes.initialFilterFc, 5000);
        // Two separate but identical modulators (only the amount differs)
        zone.addModulators(fixedFc(1000), fixedFc(500));
    });
    const zoneCutoff = await cutoffOf(zoneBank);
    check(
        zoneCutoff === 5500,
        `the later of two identical instrument zone modulators applies (${zoneCutoff})`
    );
    // Preset zone
    const presetBank = makeBank(sineSample(), {}, (zone) =>
        zone.setGenerator(GeneratorTypes.initialFilterFc, 5000)
    );
    const presetZone = presetBank.presets[0].zones[0];
    presetZone.addModulators(fixedFc(1000), fixedFc(500));
    const presetCutoff = await cutoffOf(presetBank);
    check(
        presetCutoff === 5500,
        `the later of two identical preset zone modulators applies (${presetCutoff})`
    );
    // Default modulators
    const defaultsBank = makeBank(sineSample(), {}, (zone) =>
        zone.setGenerator(GeneratorTypes.initialFilterFc, 5000)
    );
    defaultsBank.defaultModulators = [fixedFc(1000), fixedFc(500)];
    const defaultsCutoff = await cutoffOf(defaultsBank);
    check(
        defaultsCutoff === 5500,
        `the later of two identical default modulators applies (${defaultsCutoff})`
    );

    // The flattening for DLS follows the same rule
    const fcAmounts = (bank: ReturnType<typeof makeBank>) =>
        bank.presets[0]
            .toFlattenedInstrument()
            .zones[0].modulators.filter(
                (m) => m.destination === GeneratorTypes.initialFilterFc
            )
            .map((m) => m.transformAmount);
    const flatPreset = fcAmounts(presetBank);
    check(
        flatPreset.length === 1 && flatPreset[0] === 500,
        `flattening keeps only the later preset modulator (${flatPreset.join(", ")})`
    );
    // Instrument [1000, 500] plus a preset 100: the preset amount adds to the later one
    const flatSumBank = makeBank(sineSample(), {}, (zone) =>
        zone.addModulators(fixedFc(1000), fixedFc(500))
    );
    flatSumBank.presets[0].zones[0].addModulators(fixedFc(100));
    const flatSum = fcAmounts(flatSumBank);
    check(
        flatSum.length === 1 && flatSum[0] === 600,
        `flattening adds the preset amount to the later instrument modulator (${flatSum.join(", ")})`
    );
}

// 11.6.2: TONE MAP-0 NUMBER (40 4x 01) is not handled any more
{
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    // Part 1 is block 1, so 40 41 01
    const body = [0x40, 0x41, 0x01, 0x05];
    const checksum = (128 - (body.reduce((x, y) => x + y, 0) % 128)) % 128;
    const toneMap0 = [0x41, 0x10, 0x42, 0x12, ...body, checksum, 0xf7];
    synth.systemExclusive(toneMap0);
    check(
        synth.midiChannels[0].patch.bankLSB === 0,
        `TONE MAP-0 NUMBER does not set the bank LSB (${synth.midiChannels[0].patch.bankLSB})`
    );
    check(
        MIDIUtils.analyzeSysEx(toneMap0).every((m) => m.type === "Other"),
        "the analyzer does not report TONE MAP-0 NUMBER either"
    );
}

// 11.3: CC 33 is a 7-bit source of its own. CC 1 never changes it, and 127 is the end of the range (7.2)
{
    const lsbBank = makeBank(sineSample(), {}, (zone) => {
        zone.setGenerator(GeneratorTypes.initialFilterFc, 5000);
        zone.addModulators(
            new Modulator(
                new ModulatorSource(
                    MIDIControllers.modulationWheelLSB,
                    ModulatorCurveTypes.linear,
                    true
                ),
                new ModulatorSource(),
                GeneratorTypes.initialFilterFc,
                1000
            )
        );
    });
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    synth.soundBankManager.addSoundBank(lsbBank, "main");
    await synth.ready;
    const channel = synth.midiChannels[0];
    channel.controllerChange(MIDIControllers.modulationWheelLSB, 127);
    channel.noteOn(60, 100);
    const voice = synth.voices.find((v) => v.isActive);
    const fc = () => voice?.modulatedGenerators[GeneratorTypes.initialFilterFc];
    const full = fc();
    channel.controllerChange(MIDIControllers.modulationWheel, 10);
    const afterCC1 = fc();
    channel.controllerChange(MIDIControllers.modulationWheelLSB, 64);
    const center = fc();
    check(
        full === 6000 && afterCC1 === 6000 && center === 5500,
        `CC 33 at 127 is the full amount, CC 1 leaves it, 64 is half (${full}, ${afterCC1}, ${center})`
    );
}

// The exclusive class also chokes in mono mode, a voice held by the pedal can survive the switch to mono
{
    const hatBank = makeBank(sineSample(), {}, (zone) =>
        zone.setGenerator(GeneratorTypes.exclusiveClass, 1)
    );
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    synth.soundBankManager.addSoundBank(hatBank, "main");
    await synth.ready;
    const channel = synth.midiChannels[0];
    channel.controllerChange(MIDIControllers.sustainPedal, 127);
    channel.noteOn(46, 100);
    const open = synth.voices.find((v) => v.isActive && v.midiNote === 46);
    channel.controllerChange(MIDIControllers.monoModeOn, 0);
    channel.noteOn(42, 100);
    check(
        open !== undefined && open.overrideReleaseVolEnv !== 0,
        `a held voice is choked by the same class after Mono On (${open?.overrideReleaseVolEnv})`
    );
}

// 9.2 Resonance: without DMOD, an instrument zone with its own CC 71 to Q gets an amount 0 CC 71 to filterQOffset.
// It turns the default one off in that zone. Preset zones and files with DMOD get nothing
{
    const cc71ToQ = () =>
        new Modulator(
            new ModulatorSource(
                MIDIControllers.filterResonance,
                ModulatorCurveTypes.linear,
                true,
                true
            ),
            new ModulatorSource(),
            GeneratorTypes.initialFilterQ,
            200,
            0
        );
    const isTwin = (m: Modulator) =>
        m.destination === GeneratorTypes.filterQOffset &&
        m.transformAmount === 0 &&
        m.primarySource.toSourceEnum() === 0x02_c7 &&
        m.secondarySource.toSourceEnum() === 0x0c_c7;
    const bank = makeBank(sineSample(), {}, (zone) =>
        zone.addModulators(cc71ToQ())
    );
    bank.presets[0].zones[0].addModulators(cc71ToQ());
    const loaded = sf2RoundTrip(bank);
    const instMods = loaded.instruments[0].zones[0].modulators;
    check(
        instMods.length === 2 && instMods.some((m) => isTwin(m)),
        `an instrument zone with CC 71 to Q gets the amount 0 twin (${instMods.length} modulators)`
    );
    check(
        !loaded.presets[0].zones[0].modulators.some((m) => isTwin(m)),
        "a preset zone gets no twin"
    );
    const losses = loaded.getSF2Losses();
    check(
        losses.modulators === 0 && losses.addedModulators === 0,
        `the twin is restored on the next load, not a loss (${losses.modulators} lost, ${losses.addedModulators} added)`
    );
    const again = sf2RoundTrip(loaded).instruments[0].zones[0].modulators;
    check(
        again.filter((m) => isTwin(m)).length === 1,
        "a second round trip keeps one twin"
    );

    // The default CC 71 to filterQOffset is off for this zone: CC 71 at 127 leaves the offset at 0
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    synth.soundBankManager.addSoundBank(loaded, "main");
    await synth.ready;
    synth.midiChannels[0].controllerChange(
        MIDIControllers.filterResonance,
        127
    );
    synth.midiChannels[0].noteOn(60, 100);
    const voice = synth.voices.find((v) => v.isActive && v.midiNote === 60);
    check(
        voice?.modulatedGenerators[GeneratorTypes.filterQOffset] === 0,
        `CC 71 at 127 does not move filterQOffset in that zone (${voice?.modulatedGenerators[GeneratorTypes.filterQOffset]})`
    );

    // A file with DMOD keeps its list and the zones get nothing
    const withDMOD = makeBank(sineSample(), {}, (zone) =>
        zone.addModulators(cc71ToQ())
    );
    withDMOD.defaultModulators = withDMOD.defaultModulators.filter(
        (m) => m.destination !== GeneratorTypes.pan
    );
    const dmodLoaded = sf2RoundTrip(withDMOD);
    check(
        !dmodLoaded.instruments[0].zones[0].modulators.some((m) => isTwin(m)),
        "a file with DMOD gets no twin"
    );
}

// 9.1: an ignored modulator (7.4) is not written to SF2, in the zones or in DMOD
{
    const plain = (destination: GeneratorType, transform = 0) =>
        new Modulator(
            new ModulatorSource(
                MIDIControllers.expression,
                ModulatorCurveTypes.linear,
                true
            ),
            new ModulatorSource(),
            destination,
            100,
            transform as ModulatorTransformType
        );
    const bank = makeBank(sineSample(), {}, (zone) =>
        zone.addModulators(
            plain(GeneratorTypes.invalid),
            plain(GeneratorTypes.pan, 1),
            plain(GeneratorTypes.pan)
        )
    );
    bank.defaultModulators = [
        ...bank.defaultModulators,
        plain(GeneratorTypes.invalid)
    ];
    const losses = bank.getSF2Losses();
    const loaded = sf2RoundTrip(bank);
    const mods = loaded.instruments[0].zones[0].modulators;
    check(
        mods.length === 1 && mods[0].destination === GeneratorTypes.pan,
        `only the valid zone modulator is written (${mods.map((m) => `${m.destination}:${m.transformType}`).join(", ")})`
    );
    check(
        !loaded.defaultModulators.some(
            (m) => m.destination === GeneratorTypes.invalid
        ),
        "the ignored DMOD modulator is not written"
    );
    // The one DMOD loss is the default CC 71 to filterQOffset, which a written DMOD always loses
    check(
        losses.modulators === 0 && losses.defaultModulators === 1,
        `ignored modulators are not counted as losses (${losses.modulators}, ${losses.defaultModulators})`
    );
}

// 5.5: the xdta half of a name continues only a pdta half of all 20 characters. A zero byte ends the name
{
    const bank = makeBank(sineSample());
    const long = "ABCDEFGHIJKLMNOPQRSTuvwxyz0123";
    bank.presets[0].name = long;
    const file = new Uint8Array(bank.writeSFe());
    check(
        SoundBankLoader.fromArrayBuffer(file.slice().buffer).presets[0].name ===
            long,
        "a 30 character name reads back whole"
    );
    // The pdta half is the only place with the first 20 characters
    const head = long
        .slice(0, 20)
        .split("")
        .map((c) => c.charCodeAt(0));
    const at = file.findIndex((_, i) =>
        head.every((b, j) => file[i + j] === b)
    );
    file[at + 10] = 0;
    const name = SoundBankLoader.fromArrayBuffer(file.buffer).presets[0].name;
    check(
        name === long.slice(0, 10),
        `a zero byte in the pdta half ends the name, the xdta half is ignored (${name})`
    );
}

// 7.2: center-max. A 7-bit 64 is exactly the center and 127 exactly the end, a 14-bit 16383 too
{
    check(
        SOURCE_VALUE_7_BIT[64] === 8192 &&
            SOURCE_VALUE_7_BIT[127] === 16_384 &&
            SOURCE_VALUE_7_BIT[65] === 8322 &&
            SOURCE_VALUE_7_BIT[69] === 8842 &&
            SOURCE_VALUE_14_BIT[8192] === 8192 &&
            SOURCE_VALUE_14_BIT[16_383] === 16_384,
        "the 7-bit and 14-bit source values match 7.2"
    );
    const linear = ModulatorCurve.fromType(ModulatorCurveTypes.linear);
    const concave = ModulatorCurve.fromType(ModulatorCurveTypes.concave);
    check(
        linear.tables[0][16_384] === 1 &&
            linear.tables[2][16_384] === 1 &&
            linear.tables[1][16_384] === 0 &&
            concave.tables[0][16_384] === 1,
        "the built-in curves reach exactly 1 at 16384"
    );
    // Curve A puts its CC points at the source values of those CC values
    const attack = SPESSASYNTH_DEFAULT_MODULATORS.find((m) =>
        m.primarySource.isController(MIDIControllers.attackTime)
    )?.primarySource.curve;
    check(
        attack instanceof CustomCurve &&
            attack.points.some((p) => p.x === 8842 && p.y === 8192) &&
            attack.points.at(-1)?.x === 16_384,
        "curve A has its CC 69 point at 8842 and ends at 16384"
    );
    // The 7-bit fast path of a custom curve gives the same output as evaluating the points
    const wiggle = new CustomCurve(
        Array.from({ length: 33 }, (_, i) => ({
            x: i * 512,
            y: (i % 2) * 16_384
        }))
    );
    let same = true;
    for (let v = 0; v < 128; v++) {
        for (const negative of [false, true]) {
            const x = negative
                ? 16_384 - SOURCE_VALUE_7_BIT[v]
                : SOURCE_VALUE_7_BIT[v];
            const y = wiggle.getY(x);
            if (
                wiggle.getValue(SOURCE_VALUE_7_BIT[v], false, negative) !==
                    Math.fround(y / 16_384) ||
                wiggle.getValue(SOURCE_VALUE_7_BIT[v], true, negative) !==
                    Math.fround((y - 8192) / 8192)
            )
                same = false;
        }
    }
    check(
        same,
        "the custom curve grid matches the points at every 7-bit value"
    );
}

// 7.4 and 9.1: modulators to keyRange and the like, and preset modulators to instrument-only generators,
// Are ignored, so SF2 does not write them. An instrument modulator to exclusiveClass is written
{
    const toDest = (destination: GeneratorType) =>
        new Modulator(
            new ModulatorSource(
                MIDIControllers.expression,
                ModulatorCurveTypes.linear,
                true
            ),
            new ModulatorSource(),
            destination,
            10,
            0
        );
    const bank = makeBank(sineSample(), {}, (zone) =>
        zone.addModulators(
            toDest(GeneratorTypes.keyRange),
            toDest(GeneratorTypes.exclusiveClass)
        )
    );
    bank.presets[0].zones[0].addModulators(
        toDest(GeneratorTypes.exclusiveClass),
        toDest(GeneratorTypes.startAddrsOffset),
        toDest(GeneratorTypes.pan)
    );
    const losses = bank.getSF2Losses();
    const loaded = sf2RoundTrip(bank);
    const inst = loaded.instruments[0].zones[0].modulators.map(
        (m) => m.destination
    );
    const preset = loaded.presets[0].zones[0].modulators.map(
        (m) => m.destination
    );
    check(
        inst.length === 1 && inst[0] === GeneratorTypes.exclusiveClass,
        `the instrument keeps exclusiveClass and drops keyRange (${inst.join(", ")})`
    );
    check(
        preset.length === 1 && preset[0] === GeneratorTypes.pan,
        `the preset drops its instrument-only modulators (${preset.join(", ")})`
    );
    check(
        losses.modulators === 0,
        `ignored modulators are not counted as losses (${losses.modulators})`
    );
}

// 9.1: without xdta the indices must fit 16 bits, so such a bank can't be written
{
    const bank = makeBank(sineSample(), {}, (zone) => {
        for (let i = 0; i < 0x1_00_00; i++) {
            zone.addModulators(
                new Modulator(
                    new ModulatorSource(
                        MIDIControllers.expression,
                        ModulatorCurveTypes.linear,
                        true
                    ),
                    new ModulatorSource(),
                    GeneratorTypes.pan,
                    i % 100,
                    0
                )
            );
        }
    });
    let refused = false;
    try {
        bank.writeSF2({ writeExtendedLimits: false });
    } catch {
        refused = true;
    }
    let written = false;
    try {
        bank.writeSF2();
        written = true;
    } catch {
        // Stays false
    }
    check(
        refused && written,
        `65536 modulators are refused without extended limits and written with them (${refused}, ${written})`
    );
}

// 7.4: CC 64 is a source like any other, so its modulators follow the pedal during the note
{
    const bank = makeBank(sineSample(), {}, (zone) => {
        zone.addModulators(
            new Modulator(
                new ModulatorSource(
                    MIDIControllers.sustainPedal,
                    ModulatorCurveTypes.linear,
                    true
                ),
                new ModulatorSource(),
                GeneratorTypes.initialAttenuation,
                200
            )
        );
    });
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    synth.soundBankManager.addSoundBank(bank, "main");
    await synth.ready;
    const channel = synth.midiChannels[0];
    channel.noteOn(60, 100);
    const voice = synth.voices.find((v) => v.isActive && v.midiNote === 60);
    const before =
        voice?.modulatedGenerators[GeneratorTypes.initialAttenuation];
    channel.controllerChange(MIDIControllers.sustainPedal, 127);
    const after = voice?.modulatedGenerators[GeneratorTypes.initialAttenuation];
    check(
        after !== undefined && before !== undefined && after - before === 200,
        `a CC 64 to attenuation modulator follows the pedal on a sounding voice (${before}, ${after})`
    );
}

// 7.1: delayModEnv and attackModEnv keep the SF2 default of -12000, so a preset offset adds to that
{
    check(
        GeneratorLimits[GeneratorTypes.delayModEnv].def === -12_000 &&
            GeneratorLimits[GeneratorTypes.attackModEnv].def === -12_000,
        "delayModEnv and attackModEnv default to -12000"
    );
    const bank = makeBank(sineSample());
    bank.presets[0].zones[0].setGenerator(GeneratorTypes.attackModEnv, 7200);
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    synth.soundBankManager.addSoundBank(bank, "main");
    await synth.ready;
    synth.midiChannels[0].noteOn(60, 100);
    const voice = synth.voices.find((v) => v.isActive && v.midiNote === 60);
    const attack = voice?.modulatedGenerators[GeneratorTypes.attackModEnv];
    check(
        attack === -4800,
        `a preset attackModEnv of 7200 over the default gives -4800 (${attack})`
    );
}

// 7.1: the limits of the address offsets apply to each generator only once, a negative fine offset pulls back a coarse one
{
    const long = new Float32Array(70_000);
    for (let i = 0; i < long.length; i++)
        long[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE);
    const sample = new BasicSample(
        "long",
        SAMPLE_RATE,
        69,
        0,
        SampleTypes.monoSample,
        0,
        long.length
    );
    sample.setAudioData(long, SAMPLE_RATE);
    const bank = makeBank(sample, {
        [GeneratorTypes.startAddrsCoarseOffset]: 1,
        [GeneratorTypes.startAddrsOffset]: -100
    });
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    synth.soundBankManager.addSoundBank(bank, "main");
    await synth.ready;
    synth.midiChannels[0].noteOn(60, 100);
    const voice = synth.voices.find((v) => v.isActive && v.midiNote === 60);
    check(
        voice?.wavetable.cursor === 32_668,
        `a coarse offset of 1 with a fine offset of -100 starts at 32668 (${voice?.wavetable.cursor})`
    );
}

// 9.2: an ignored DMOD modulator does not count for the additions, a CC 73 to keyNum keeps the envelope modulators
{
    const ignored = new Modulator(
        new ModulatorSource(
            MIDIControllers.attackTime,
            ModulatorCurveTypes.linear,
            true
        ),
        new ModulatorSource(),
        GeneratorTypes.keyNum,
        100
    );
    const list = fromSF2DefaultModulators(new BasicSoundBank(), [ignored]);
    const restored = list.filter(
        (m) =>
            m !== ignored &&
            m.primarySource.isController(MIDIControllers.attackTime)
    ).length;
    check(
        restored > 0,
        `a DMOD with only CC 73 to keyNum still gets the CC 73 envelope modulator (${restored})`
    );
}

// 9.1: a sample link above 16 bits needs xdta too
{
    const bank = new BasicSoundBank();
    const samples = new Array<BasicSample>();
    for (let i = 0; i < 0x1_00_01; i++) {
        const s = new BasicSample(
            "s",
            SAMPLE_RATE,
            60,
            0,
            SampleTypes.monoSample,
            0,
            0
        );
        s.setAudioData(new Float32Array(1), SAMPLE_RATE);
        samples.push(s);
    }
    for (const s of samples) bank.addSamples(s);
    samples[0].linkedSample = samples[0x1_00_00];
    samples[0].sampleType = SampleTypes.leftSample;
    let refused = false;
    try {
        bank.writeSF2({ writeExtendedLimits: false });
    } catch {
        refused = true;
    }
    check(refused, "a link to sample 65536 is refused without extended limits");

    // 7.1.1: sampleIDMSB lets an SFe zone refer to sample 65536 and above. SF2 has no such generator and refuses it (5.5)
    samples[0].linkedSample = undefined;
    samples[0].sampleType = SampleTypes.monoSample;
    const inst = new BasicInstrument();
    inst.name = "far";
    inst.createZone(samples[0x1_00_00]);
    // A sample in the upper half of the 16-bit range, which a signed read would break
    inst.createZone(samples[40_000]);
    bank.addInstruments(inst);
    let sf2Refused = false;
    try {
        bank.writeSF2();
    } catch (error) {
        sf2Refused = String(error).includes("65535");
    }
    check(sf2Refused, "SF2 refuses a zone that refers to sample 65536");
    const back = SoundBankLoader.fromArrayBuffer(bank.writeSFe());
    const backInst = back.instruments.find((i) => i.name === "far");
    const indexes = backInst?.zones.map((z) => back.samples.indexOf(z.sample));
    check(
        indexes?.join(",") === "65536,40000",
        `SFe keeps zones that refer to samples 65536 and 40000 (${indexes?.join(",")})`
    );
}

// 7.3: the default CC 71 modulator acts only above 64, lower values leave the resonance alone
{
    const bank = makeBank(sineSample());
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    synth.soundBankManager.addSoundBank(bank, "main");
    await synth.ready;
    const offsets = new Array<number | undefined>();
    for (const [key, cc] of [
        [60, 0],
        [62, 32],
        [64, 64],
        [66, 127]
    ]) {
        synth.midiChannels[0].controllerChange(
            MIDIControllers.filterResonance,
            cc
        );
        synth.midiChannels[0].noteOn(key, 100);
        offsets.push(
            synth.voices.find((v) => v.isActive && v.midiNote === key)
                ?.modulatedGenerators[GeneratorTypes.filterQOffset]
        );
    }
    check(
        offsets[0] === 0 &&
            offsets[1] === 0 &&
            offsets[2] === 0 &&
            offsets[3] === 250,
        `CC 71 at 0, 32 and 64 gives no filterQOffset and 127 gives the full 250 (7.2 center-max) (${offsets.join(", ")})`
    );
}

// The deduplicated default list is cached, replacing the list clears the cache
{
    const bank = makeBank(sineSample());
    const before = bank.effectiveDefaultModulators.length;
    const fixed = (amount: number) =>
        new Modulator(
            new ModulatorSource(ModulatorControllerSources.noController),
            new ModulatorSource(),
            GeneratorTypes.initialFilterFc,
            amount
        );
    bank.defaultModulators = [fixed(-100), fixed(-200)];
    const after = bank.effectiveDefaultModulators;
    check(
        before > 0 &&
            after.length === 1 &&
            after[0].transformAmount === -200 &&
            bank.effectiveDefaultModulators === after,
        `the effective default list follows a replaced list and is reused (${before}, ${after.map((m) => m.transformAmount).join(",")})`
    );
}

// 7.1.1: sampleIDMSB is the top of the sample index. An index past the samples makes the reader ignore the zone,
// 0 leaves the zone alone, and instrumentMSB in an instrument zone is ignored
{
    const patched = (value: number, type = 91, gap = false) => {
        const bytes = new Uint8Array(
            makeBank(sineSample(), {
                [GeneratorTypes.releaseVolEnv]: -1234,
                // A generator between the patched one and sampleID
                ...(gap ? { [GeneratorTypes.coarseTune]: 5 } : {})
            }).writeSFe()
        );
        // Turn the release generator of the instrument zone into an MSB generator, it comes before sampleID
        const igen = find(bytes, "igen");
        const view = new DataView(bytes.buffer);
        const size = view.getUint32(igen + 4, true);
        for (let i = igen + 8; i < igen + 8 + size; i += 4) {
            if (
                view.getUint16(i, true) === GeneratorTypes.releaseVolEnv &&
                view.getInt16(i + 2, true) === -1234
            ) {
                view.setUint16(i, type, true);
                view.setInt16(i + 2, value, true);
            }
        }
        return SoundBankLoader.fromArrayBuffer(bytes.buffer);
    };
    const dropped = patched(1);
    const kept = patched(0);
    check(
        dropped.instruments[0].zones.length === 0,
        `a zone whose sampleIDMSB 1 points past the samples is ignored (${dropped.instruments[0].zones.length} zones)`
    );
    check(
        kept.instruments[0].zones.length === 1 &&
            kept.instruments[0].zones[0].generators.every((g) => g.type <= 89),
        "a zone with sampleIDMSB 0 is kept, the zone does not store the generator"
    );
    // The MSB only counts right before sampleID
    const notAdjacent = patched(1, 91, true);
    check(
        notAdjacent.instruments[0].zones.length === 1 &&
            notAdjacent.samples.indexOf(
                notAdjacent.instruments[0].zones[0].sample
            ) === 0,
        "a sampleIDMSB with another generator before sampleID is ignored"
    );
    // As in SF2, a generator after sampleID is ignored: swap the release with the sampleID record after it
    {
        const bytes = new Uint8Array(
            makeBank(sineSample(), {
                [GeneratorTypes.releaseVolEnv]: -1234
            }).writeSFe()
        );
        const igen = find(bytes, "igen");
        const view = new DataView(bytes.buffer);
        const size = view.getUint32(igen + 4, true);
        for (let i = igen + 8; i < igen + 8 + size - 4; i += 4) {
            if (
                view.getUint16(i, true) === GeneratorTypes.releaseVolEnv &&
                view.getInt16(i + 2, true) === -1234 &&
                view.getUint16(i + 4, true) === GeneratorTypes.sampleID
            ) {
                const release = view.getUint32(i, true);
                view.setUint32(i, view.getUint32(i + 4, true), true);
                view.setUint32(i + 4, release, true);
            }
        }
        const after = SoundBankLoader.fromArrayBuffer(bytes.buffer)
            .instruments[0].zones;
        check(
            after.length === 1 &&
                after[0].getGenerator(GeneratorTypes.releaseVolEnv, null) ===
                    null,
            "a generator after sampleID is ignored and the zone stays"
        );
    }
    // InstrumentMSB belongs to preset zones, in an instrument zone it is only ignored
    const wrongLevel = patched(1, 90);
    check(
        wrongLevel.instruments[0].zones.length === 1,
        "an instrument zone with instrumentMSB 1 is kept, the generator is ignored there"
    );
}

finish("spec_revision_test");
