import { readFileSync } from "node:fs";
import {
    BasicSoundBank,
    type BasicZone,
    CustomCurve,
    GeneratorTypes,
    IndexedByteArray,
    MIDIControllers,
    Modulator,
    ModulatorCurve,
    ModulatorCurveTypes,
    ModulatorSource,
    type ModulatorSourceIndex,
    SoundBankLoader,
    SpessaLog,
    SpessaSynthProcessor
} from "../../../src";
import { readModulators } from "../../../src/soundbank/soundfont/read/modulators";
import { readCurves } from "../../../src/soundbank/soundfont/read/curves";
import { RIFFChunk } from "../../../src/utils/riff_chunk";
import {
    MOD_BYTE_SIZE,
    XMOD_BYTE_SIZE
} from "../../../src/soundbank/basic_soundbank/modulator";
import {
    writeDword,
    writeWord
} from "../../../src/utils/byte_functions/little_endian";
import {
    check,
    finish,
    levelDb,
    makeBank,
    note,
    render,
    SAMPLE_RATE,
    sf2RoundTrip,
    sfeRoundTrip,
    sineSample
} from "./sfe_test_utils";

SpessaLog.warnEnabled = false;

const valid = (m: Modulator) => m.destination !== GeneratorTypes.invalid;

// The payloads of every chunk with the FOURCC, in file order
function chunksOf(file: Uint8Array, fourCC: string) {
    const name = [...fourCC].map((c) => c.charCodeAt(0));
    const found = new Array<Uint8Array>();
    for (let i = 0; i < file.length - 8; i++) {
        if (name.some((c, k) => file[i + k] !== c)) {
            continue;
        }

        const size =
            file[i + 4] |
            (file[i + 5] << 8) |
            (file[i + 6] << 16) |
            (file[i + 7] << 24);
        if (size >= 0 && i + 8 + size <= file.length)
            found.push(file.subarray(i + 8, i + 8 + size));
    }
    return found;
}

// The words of every 10 byte modulator record of a chunk
function modulatorRecords(payload: Uint8Array) {
    const out = new Array<{
        source: number;
        dest: number;
        transform: number;
    }>();
    for (let i = 0; i + MOD_BYTE_SIZE <= payload.length; i += MOD_BYTE_SIZE) {
        out.push({
            source: payload[i] | (payload[i + 1] << 8),
            dest: payload[i + 2] | (payload[i + 3] << 8),
            transform: payload[i + 8] | (payload[i + 9] << 8)
        });
    }
    // The terminal
    out.pop();
    return out;
}

// Counts the generator records with the type and value in a file
function countGenerator(file: Uint8Array, type: number, value: number) {
    let count = 0;
    for (const chunkName of ["igen", "pgen"]) {
        for (const payload of chunksOf(file, chunkName)) {
            for (let i = 0; i + 4 <= payload.length; i += 4) {
                const t = payload[i] | (payload[i + 1] << 8);
                const v =
                    ((payload[i + 2] | (payload[i + 3] << 8)) << 16) >> 16;
                if (t === type && v === value) count++;
            }
        }
    }
    return count;
}

const linear = (cc: number) =>
    new ModulatorSource(
        cc as ModulatorSourceIndex,
        ModulatorCurveTypes.linear,
        true,
        false
    );
const plain = (cc: number) =>
    new Modulator(
        linear(cc),
        new ModulatorSource(),
        GeneratorTypes.pan,
        100,
        0
    );
const curveA = new CustomCurve(
    [
        { x: 0, y: 0 },
        { x: 16_384, y: 16_384 }
    ],
    "A"
);
const curveB = new CustomCurve(
    [
        { x: 0, y: 16_384 },
        { x: 16_384, y: 0 }
    ],
    "B"
);
const curved = (cc: number, curve: CustomCurve) =>
    new Modulator(
        new ModulatorSource(cc as ModulatorSourceIndex, curve, true, false),
        new ModulatorSource(),
        GeneratorTypes.fineTune,
        200,
        0
    );

// Raw modulator records, for the cases the writer can't produce
interface RawModulator {
    source: number;
    destination: number;
    amount: number;
    secondary: number;
    transform: number;
}
const raw = (
    source: number,
    transform: number,
    destination: number = GeneratorTypes.fineTune,
    secondary = 0
): RawModulator => ({ source, destination, amount: 100, secondary, transform });
const FLAG = 0x80_00;
// A custom curve source on a general controller
const custom = (index: number) => (ModulatorCurveTypes.custom << 10) | index;

function rawChunk(mods: RawModulator[]) {
    const data = new IndexedByteArray((mods.length + 1) * MOD_BYTE_SIZE);
    for (const m of mods) {
        writeWord(data, m.source);
        writeWord(data, m.destination);
        writeWord(data, m.amount);
        writeWord(data, m.secondary);
        writeWord(data, m.transform);
    }
    data.currentIndex = 0;
    return new RIFFChunk("imod", data.length, data);
}

interface RawRecord {
    source: number;
    amount: number;
    reserved?: number[];
}
function recordChunk(records: RawRecord[]) {
    const data = new IndexedByteArray((records.length + 1) * XMOD_BYTE_SIZE);
    for (const r of records) {
        writeDword(data, r.source);
        writeDword(data, r.amount);
        const reserved = r.reserved ?? [0, 0, 0, 0, 0, 0, 0, 0];
        for (const b of reserved) data[data.currentIndex++] = b;
    }
    data.currentIndex = 0;
    return new RIFFChunk("imod", data.length, data);
}

// Every curve reads back as itself, `curves` is the raw curve list the indexes point into
const curves = [curveA, curveB];

console.info("Item 1: the attenuation unit");
{
    // A bank with 40 cB: the SF2 file stores 100
    const bank = makeBank(sineSample(), {
        [GeneratorTypes.initialAttenuation]: 40
    });
    const sf2File = new Uint8Array(bank.writeSF2());
    check(
        countGenerator(sf2File, GeneratorTypes.initialAttenuation, 100) === 1 &&
            countGenerator(sf2File, GeneratorTypes.initialAttenuation, 40) ===
                0,
        "40 cB is written to SF2 as 100"
    );
    const read = SoundBankLoader.fromArrayBuffer(sf2File.slice().buffer);
    check(
        read.instruments[0].zones[0].getGenerator(
            GeneratorTypes.initialAttenuation,
            0
        ) === 40,
        "an SF2 file with initialAttenuation 100 reads as 40"
    );
    const again = new Uint8Array(read.writeSF2());
    check(
        countGenerator(again, GeneratorTypes.initialAttenuation, 100) === 1,
        "and writes back as 100"
    );
    // A preset level value is converted too
    const presetBank = makeBank(sineSample());
    presetBank.presets[0].zones[0].setGenerator(
        GeneratorTypes.initialAttenuation,
        20
    );
    const presetFile = new Uint8Array(presetBank.writeSF2());
    check(
        countGenerator(presetFile, GeneratorTypes.initialAttenuation, 50) === 1,
        "a preset level 20 cB is written as 50"
    );
    check(
        SoundBankLoader.fromArrayBuffer(
            presetFile.slice().buffer
        ).presets[0].zones[0].getGenerator(
            GeneratorTypes.initialAttenuation,
            0
        ) === 20,
        "and read as 20"
    );
    // SFe keeps the value
    const sfeFile = new Uint8Array(bank.writeSFe());
    check(
        countGenerator(sfeFile, GeneratorTypes.initialAttenuation, 40) === 1 &&
            countGenerator(sfeFile, GeneratorTypes.initialAttenuation, 100) ===
                0,
        "an SFe file stores 40 unchanged"
    );
    check(
        sfeRoundTrip(bank).instruments[0].zones[0].getGenerator(
            GeneratorTypes.initialAttenuation,
            0
        ) === 40,
        "and reads it unchanged"
    );
    // The rounding of the conversion
    for (const [file, model] of [
        [0, 0],
        [1, 0],
        [2, 1],
        [3, 1],
        [4, 2],
        [5, 2],
        [1440, 576],
        [-50, -20]
    ]) {
        const b = makeBank(sineSample());
        b.instruments[0].zones[0].setGenerator(
            GeneratorTypes.initialAttenuation,
            model,
            false
        );
        const written = new Uint8Array(b.writeSF2());
        const stored = countGenerator(
            written,
            GeneratorTypes.initialAttenuation,
            Math.round(model / 0.4)
        );
        const rounded = Math.round(file * 0.4);
        check(
            stored === 1 && rounded === model,
            `file ${file} reads as ${rounded}, ${model} cB writes as ${Math.round(model / 0.4)}`
        );
    }

    // The level of a voice: 100 in the file is 4 dB down, as before
    const none = makeBank(sineSample());
    const attenuated = SoundBankLoader.fromArrayBuffer(sf2File.slice().buffer);
    const renderedNone = await render(none, note(0, undefined), 0.6);
    const renderedAtt = await render(attenuated, note(0, undefined), 0.6);
    const levelNone = levelDb(renderedNone.left, 0.2, 0.6);
    const levelAtt = levelDb(renderedAtt.left, 0.2, 0.6);
    check(
        Math.abs(levelNone - levelAtt - 4) < 0.1,
        `a voice from an SF2 attenuation of 100 is 4 dB down (${(levelNone - levelAtt).toFixed(2)} dB)`
    );
    // The preset and the instrument value add up as before, within a centibel
    const sum = makeBank(sineSample());
    sum.instruments[0].zones[0].setGenerator(
        GeneratorTypes.initialAttenuation,
        40
    );
    sum.presets[0].zones[0].setGenerator(GeneratorTypes.initialAttenuation, 40);
    sum.flush();
    check(
        sum.presets[0].getVoiceParameters(60, 100)[0].generators[
            GeneratorTypes.initialAttenuation
        ] === 80,
        "the preset and instrument values add up in centibels, no scaling in getVoiceParameters"
    );
}

console.info("Item 2: the SF2 round trip");
{
    // Every file value from 0 to 600 changes by at most 1 and is stable after one round trip
    let maxChange = 0;
    let unstable = 0;
    for (let file = -200; file <= 1440; file++) {
        const model = Math.round(file * 0.4);
        const back = Math.round(Math.round(model / 0.4) * 0.4);
        const written = Math.round(model / 0.4);
        maxChange = Math.max(maxChange, Math.abs(written - file));
        if (back !== model) unstable++;
    }
    check(
        maxChange <= 1 && unstable === 0,
        `a file value changes by at most ${maxChange} and the second round trip is stable`
    );
    check(
        !("sf2Amount" in new Modulator()),
        "Modulator has no sf2Amount any more"
    );
    const send = (amount: number) =>
        new Modulator(
            new ModulatorSource(MIDIControllers.reverbDepth, 0, true),
            new ModulatorSource(),
            GeneratorTypes.reverbEffectsSend,
            amount
        );
    for (const [amount, stored] of [
        [1000, 200],
        [1, 0],
        [503, 101],
        [1500, 300],
        [-500, -100]
    ]) {
        const bank = makeBank(sineSample());
        bank.instruments[0].zones[0].addModulators(send(amount));
        const file = new Uint8Array(bank.writeSF2());
        const amounts = chunksOf(file, "imod").flatMap((payload) => {
            const out = new Array<number>();
            for (let i = 0; i + MOD_BYTE_SIZE <= payload.length; i += 10) {
                if (
                    payload[i + 2] === GeneratorTypes.reverbEffectsSend &&
                    payload[i] === 0xdb
                )
                    out.push(
                        ((payload[i + 4] | (payload[i + 5] << 8)) << 16) >> 16
                    );
            }
            return out;
        });
        check(
            amounts.includes(stored),
            `a zone send of ${amount} is written as ${stored} (${amounts.join(",")})`
        );
    }
    // The default list written to SF2 as 200 too
    const changed = makeBank(sineSample());
    changed.defaultModulators = changed.defaultModulators.filter(
        (m) => m.destination !== GeneratorTypes.pan
    );
    const dmod = chunksOf(new Uint8Array(changed.writeSF2()), "DMOD")[0];
    const sends = modulatorRecords(dmod).filter(
        (r) => r.dest === GeneratorTypes.reverbEffectsSend
    );
    check(sends.length === 1, "the changed default list holds the reverb send");
    check(
        sf2RoundTrip(changed).defaultModulators.find(
            (m) => m.destination === GeneratorTypes.reverbEffectsSend
        )?.transformAmount === 1000,
        "and it reads back as 1000"
    );
}

console.info("Item 3: the extended flag");
{
    // A modulator with the flag takes the next record
    const flagged = readModulators(
        rawChunk([
            raw(0x80 | 20, 0),
            raw(custom(21) | 0x80, FLAG),
            raw(0x80 | 22, 0),
            raw(custom(23) | 0x80, FLAG)
        ]),
        true,
        curves,
        recordChunk([
            { source: 0, amount: 0 },
            { source: 0, amount: 0 }
        ])
    );
    // The first record belongs to the first flagged modulator (index 1)
    check(
        flagged.length === 4 && flagged.every((m) => valid(m)),
        "flagged modulators with their records are valid"
    );
    check(
        flagged[1].primarySource.curve === curveA &&
            flagged[3].primarySource.curve === curveA,
        "a modulator with the flag takes the next record, one without takes none"
    );
    const second = readModulators(
        rawChunk([
            raw(custom(21) | 0x80, FLAG),
            raw(0x80 | 22, 0),
            raw(custom(23) | 0x80, FLAG)
        ]),
        true,
        curves,
        recordChunk([
            { source: 1, amount: 0 },
            { source: 0, amount: 0 }
        ])
    );
    check(
        second[0].primarySource.curve === curveB &&
            second[2].primarySource.curve === curveA,
        "the records are matched in order"
    );

    // A custom curve without the flag is ignored
    const unflagged = readModulators(
        rawChunk([raw(custom(21) | 0x80, 0), raw(0x80 | 22, 0)]),
        true,
        curves,
        recordChunk([])
    );
    check(
        !valid(unflagged[0]) && valid(unflagged[1]),
        "a custom curve modulator without the flag is ignored"
    );

    // A count that does not match ignores every flagged modulator, the others stay
    const tooFew = readModulators(
        rawChunk([
            raw(custom(21) | 0x80, FLAG),
            raw(0x80 | 22, 0),
            raw(custom(23) | 0x80, FLAG)
        ]),
        true,
        curves,
        recordChunk([{ source: 0, amount: 0 }])
    );
    check(
        !valid(tooFew[0]) && valid(tooFew[1]) && !valid(tooFew[2]),
        "one record for two flagged modulators ignores both, the plain one stays"
    );
    const tooMany = readModulators(
        rawChunk([raw(custom(21) | 0x80, FLAG), raw(0x80 | 22, 0)]),
        true,
        curves,
        recordChunk([
            { source: 0, amount: 0 },
            { source: 0, amount: 0 }
        ])
    );
    check(
        !valid(tooMany[0]) && valid(tooMany[1]),
        "two records for one flagged modulator ignores it"
    );
    const missing = readModulators(
        rawChunk([raw(custom(21) | 0x80, FLAG), raw(0x80 | 22, 0)]),
        true,
        curves
    );
    check(
        !valid(missing[0]) && valid(missing[1]),
        "a flagged modulator without any records chunk is ignored"
    );
    // A size that is not a multiple of 16 is no match
    const oddData = new IndexedByteArray(10 + 16);
    oddData.currentIndex = 0;
    const odd = readModulators(
        rawChunk([raw(custom(21) | 0x80, FLAG)]),
        true,
        curves,
        new RIFFChunk("imod", oddData.length, oddData)
    );
    check(!valid(odd[0]), "a record chunk of 26 bytes does not match");
    // The old 10 byte layout (two records of 10 bytes) is not 16 byte records
    const oldData = new IndexedByteArray(20);
    oldData.currentIndex = 0;
    check(
        !valid(
            readModulators(
                rawChunk([raw(custom(21) | 0x80, FLAG)]),
                true,
                curves,
                new RIFFChunk("imod", oldData.length, oldData)
            )[0]
        ),
        "two 10 byte records do not match one 16 byte record"
    );

    // Reserved bytes: the modulator is ignored and the following records stay aligned
    const reserved = readModulators(
        rawChunk([
            raw(custom(20) | 0x80, FLAG),
            raw(custom(21) | 0x80, FLAG),
            raw(custom(22) | 0x80, FLAG)
        ]),
        true,
        curves,
        recordChunk([
            { source: 0, amount: 0 },
            { source: 1, amount: 0, reserved: [0, 0, 0, 0, 0, 0, 0, 1] },
            { source: 1, amount: 0 }
        ])
    );
    check(
        valid(reserved[0]) && !valid(reserved[1]) && valid(reserved[2]),
        "non-zero reserved bytes ignore that modulator only"
    );
    check(
        reserved[0].primarySource.curve === curveA &&
            reserved[2].primarySource.curve === curveB,
        "the records after it still match their modulators"
    );
    const reservedFirst = readModulators(
        rawChunk([raw(custom(20) | 0x80, FLAG)]),
        true,
        curves,
        recordChunk([
            { source: 0, amount: 0, reserved: [1, 0, 0, 0, 0, 0, 0, 0] }
        ])
    );
    check(
        !valid(reservedFirst[0]),
        "a non-zero first reserved byte ignores it"
    );

    // A flagged modulator without a custom curve source: ignored, the record is consumed
    const noCurve = readModulators(
        rawChunk([raw(0x80 | 20, FLAG), raw(custom(21) | 0x80, FLAG)]),
        true,
        curves,
        recordChunk([
            { source: 0, amount: 0 },
            { source: 1, amount: 0 }
        ])
    );
    check(
        !valid(noCurve[0]) &&
            valid(noCurve[1]) &&
            noCurve[1].primarySource.curve === curveB,
        "a flagged modulator without a custom curve is ignored and takes its record"
    );
    // A curve index on a source that is not custom is ignored, the modulator stays
    const strayIndex = readModulators(
        rawChunk([
            raw(custom(21) | 0x80, FLAG, GeneratorTypes.fineTune, 0x80 | 5)
        ]),
        true,
        curves,
        recordChunk([{ source: 1, amount: 77 }])
    );
    check(
        valid(strayIndex[0]),
        "an index for a source that is not custom is ignored and the modulator is kept"
    );
    // A curve that is missing
    const noSuchCurve = readModulators(
        rawChunk([raw(custom(21) | 0x80, FLAG)]),
        true,
        curves,
        recordChunk([{ source: 9, amount: 0 }])
    );
    check(!valid(noSuchCurve[0]), "an index of a missing curve is ignored");
    // Not an SFe file: the flag makes the transform unknown
    const notSFe = readModulators(
        rawChunk([raw(0x80 | 20, FLAG), raw(0x80 | 21, 0)]),
        false
    );
    check(
        !valid(notSFe[0]) && valid(notSFe[1]),
        "outside SFe bit 15 is part of the transform, which is unknown"
    );

    // The writers
    const bank = makeBank(sineSample(), {}, (zone, b) => {
        zone.addModulators(
            plain(20),
            curved(21, curveA),
            plain(22),
            curved(23, curveB)
        );
        b.addCustomCurves(curveA, curveB);
    });
    const sfeFile = new Uint8Array(bank.writeSFe());
    const imod = chunksOf(sfeFile, "imod");
    // The xdta imod is first in the file, the pdta imod second
    const pdtaRecords = modulatorRecords(imod[1]);
    check(
        pdtaRecords.length === 4 &&
            pdtaRecords.filter((r) => (r.transform & FLAG) !== 0).length ===
                2 &&
            (pdtaRecords[1].transform & FLAG) !== 0 &&
            (pdtaRecords[3].transform & FLAG) !== 0 &&
            (pdtaRecords[0].transform & FLAG) === 0,
        "the SFe writer sets the flag on the two custom curve modulators only"
    );
    check(
        imod[0].length === 3 * XMOD_BYTE_SIZE,
        `the xdta imod holds two 16 byte records and the terminal (${imod[0].length} bytes)`
    );
    const xmodBank = makeBank(sineSample());
    xmodBank.defaultModulators = [
        Modulator.copyFrom(curved(24, curveA)),
        Modulator.copyFrom(plain(25))
    ];
    xmodBank.addCustomCurves(
        ...xmodBank.defaultModulators.flatMap((m) =>
            m.primarySource.curve instanceof CustomCurve
                ? [m.primarySource.curve]
                : []
        )
    );
    const xmodFile = new Uint8Array(xmodBank.writeSFe());
    const dmodRecords = modulatorRecords(chunksOf(xmodFile, "DMOD")[0]);
    check(
        dmodRecords.length === 2 &&
            (dmodRecords[0].transform & FLAG) !== 0 &&
            (dmodRecords[1].transform & FLAG) === 0 &&
            chunksOf(xmodFile, "XMOD")[0].length === 2 * XMOD_BYTE_SIZE,
        "DMOD has the flag on its custom curve modulator and XMOD holds one record and the terminal"
    );
    check(
        sfeRoundTrip(xmodBank).defaultModulators.length === 2,
        "and the default modulators read back"
    );
    // SF2 writer
    const sf2Bank = makeBank(sineSample(), {}, (zone, b) => {
        zone.addModulators(
            plain(20),
            curved(21, curveA),
            plain(22),
            curved(23, curveB)
        );
        b.addCustomCurves(curveA, curveB);
    });
    const sf2File = new Uint8Array(sf2Bank.writeSF2());
    const sf2Records = chunksOf(sf2File, "imod").flatMap((p) =>
        modulatorRecords(p)
    );
    check(
        sf2Records.length === 2 &&
            sf2Records.every((r) => (r.transform & FLAG) === 0),
        "the SF2 writer writes no flag, and drops the custom curve modulators"
    );
    // The xdta of an SF2 file keeps the terminal of the extended limits proposal, 10 bytes
    const longName = makeBank(sineSample());
    longName.presets[0].name = "A preset name that is longer than 20";
    const sf2Long = new Uint8Array(longName.writeSF2());
    const sfeLong = new Uint8Array(longName.writeSFe());
    check(
        chunksOf(sf2Long, "imod")[0].length === MOD_BYTE_SIZE &&
            chunksOf(sfeLong, "imod")[0].length === XMOD_BYTE_SIZE,
        "the xdta imod terminal is 10 bytes in SF2 and 16 in SFe"
    );
    check(
        sf2RoundTrip(longName).presets[0].name ===
            "A preset name that is longer than 20" &&
            sfeRoundTrip(longName).presets[0].name ===
                "A preset name that is longer than 20",
        "and both read back with the long name"
    );
    // The model writer never sets it for SF2 either
    const dataSF2 = new IndexedByteArray(MOD_BYTE_SIZE);
    curved(1, curveA).write(dataSF2);
    const dataSFe = new IndexedByteArray(MOD_BYTE_SIZE);
    curved(1, curveA).write(dataSFe, undefined, true);
    check(
        dataSF2[8] === 0 && dataSF2[9] === 0 && dataSFe[9] === 0x80,
        "Modulator.write sets bit 15 only for SFe"
    );
    // Absolute value keeps working next to the flag
    const abs = new Modulator(
        new ModulatorSource(21, curveA, true, false),
        new ModulatorSource(),
        GeneratorTypes.fineTune,
        10,
        2
    );
    const absBank = makeBank(sineSample(), {}, (zone, b) => {
        zone.addModulators(abs);
        b.addCustomCurves(curveA);
    });
    const absRead = sfeRoundTrip(absBank).instruments[0].zones[0].modulators[0];
    check(
        valid(absRead) && absRead.transformType === 2,
        "the transform is the lower 15 bits, 2 stays 2 next to the flag"
    );
}

console.info("Item 4: the 16 byte record");
{
    check(XMOD_BYTE_SIZE === 16, "the record is 16 bytes");
    // Indices above 65535 are representable
    const many = new Array<CustomCurve | undefined>();
    many[70_000] = curveB;
    many[65_536] = curveA;
    const high = readModulators(
        rawChunk([
            raw(custom(21) | 0x80, FLAG),
            raw(custom(22) | 0x80, FLAG, GeneratorTypes.fineTune, 0x80 | 5)
        ]),
        true,
        many,
        recordChunk([
            { source: 70_000, amount: 0 },
            { source: 65_536, amount: 0 }
        ])
    );
    check(
        valid(high[0]) &&
            high[0].primarySource.curve === curveB &&
            valid(high[1]) &&
            high[1].primarySource.curve === curveA,
        "curve indexes 70000 and 65536 are read from the DWORDs"
    );
    // Written by the writer: a bank with more than 65536 curves
    const bank = new BasicSoundBank();
    const filler = new Array<CustomCurve>();
    for (let i = 0; i < 65_540; i++) {
        filler.push(
            new CustomCurve(
                [
                    { x: 0, y: i % 16_000 },
                    { x: 16_384, y: 16_384 }
                ],
                `c${i}`
            )
        );
    }
    bank.customCurves.push(...filler.slice(0, 1000));
    for (let i = 1000; i < filler.length; i++)
        bank.customCurves.push(filler[i]);
    const target = filler[65_538];
    const sourceBank = makeBank(sineSample(), {}, (zone, b) => {
        void b;
        zone.addModulators(curved(21, target));
    });
    sourceBank.customCurves.push(...filler);
    const back = sfeRoundTrip(sourceBank);
    const backMod = back.instruments[0].zones[0].modulators[0];
    check(
        valid(backMod) &&
            backMod.primarySource.curve instanceof CustomCurve &&
            backMod.primarySource.curve.isIdentical(target) &&
            backMod.primarySource.curve.name === "c65538",
        "a modulator using curve 65538 survives the writer and the reader"
    );
    check(
        back.customCurves.filter((c) => c.name.startsWith("c")).length ===
            65_540,
        "all 65540 curves are read back"
    );
}

console.info("Item 5: CURV with a DWORD count and x up to 16384");
{
    const full = new CustomCurve(
        [
            { x: 0, y: 0 },
            { x: 16_384, y: 16_384 }
        ],
        "full"
    );
    check(
        full.getValue(8192, false, false) === 0.5 &&
            full.getValue(0, false, false) === 0 &&
            Math.abs(full.getValue(16_383, false, false) - 16_383 / 16_384) <
                1e-6,
        "a point at x 16384 defines the linear curve up to exactly 1"
    );
    check(
        full.getValue(0, false, true) === 1 &&
            full.getValue(16_383, false, true) === 1 / 16_384,
        "the reversed direction evaluates at 16384 for a source value of 0"
    );
    check(
        full.getValue(0, true, true) === 1 &&
            full.getValue(8192, true, true) === 0,
        "bipolar reversed"
    );
    let threw = false;
    try {
        new CustomCurve([
            { x: 0, y: 0 },
            { x: 16_385, y: 0 }
        ]);
    } catch {
        threw = true;
    }
    check(threw, "an x of 16385 is invalid");
    // The three points around the end
    const step = new CustomCurve([
        { x: 0, y: 0 },
        { x: 16_383, y: 8000 },
        { x: 16_384, y: 16_384 }
    ]);
    check(
        step.getValue(16_383, false, false) === 8000 / 16_384 &&
            step.getValue(0, false, true) === 1,
        "points at 16383 and 16384 are both used"
    );

    // Hand-built CURV with a DWORD count
    const build = (count: number, points: [number, number][]) => {
        const data = new IndexedByteArray(4 + 42 + points.length * 4);
        writeDword(data, count);
        for (let i = 0; i < 40; i++)
            data[data.currentIndex++] = i < 1 ? 0x58 : 0;
        writeWord(data, points.length);
        for (const [x, y] of points) {
            writeWord(data, x);
            writeWord(data, y);
        }
        data.currentIndex = 0;
        return new RIFFChunk("CURV", data.length, data);
    };
    const read = readCurves(
        build(1, [
            [0, 0],
            [16_384, 16_384]
        ])
    );
    check(
        read.length === 1 && read[0]?.points[1].x === 16_384,
        "a CURV with the DWORD count 1 and a point at 16384 is read"
    );
    const bad = readCurves(
        build(1, [
            [0, 0],
            [16_385, 0]
        ])
    );
    check(
        bad.length === 1 && bad[0] === undefined,
        "a point at 16385 makes the curve invalid, it keeps its number"
    );
    // A CURV whose size does not match its counts is malformed and the file is rejected (section 5.4)
    const throws = (chunk: RIFFChunk) => {
        try {
            readCurves(chunk);
            return false;
        } catch {
            return true;
        }
    };
    const short = new IndexedByteArray(3);
    check(
        throws(new RIFFChunk("CURV", short.length, short)),
        "a chunk too short for a DWORD count is rejected"
    );
    check(
        throws(build(2, [[0, 0]])),
        "a count larger than the curves in the chunk is rejected"
    );
    const longer = build(1, [
        [0, 0],
        [16_384, 16_384]
    ]);
    const padded = new IndexedByteArray(longer.data.length + 4);
    padded.set(longer.data);
    check(
        throws(new RIFFChunk("CURV", padded.length, padded)),
        "bytes after the last curve are rejected"
    );
    // A draft from before 2026-11-17: a WORD count, so the DWORD count takes the name's first bytes
    const draft = new IndexedByteArray(2 + 42 + 8);
    writeWord(draft, 1);
    for (let i = 0; i < 40; i++) draft[draft.currentIndex++] = i < 1 ? 0x58 : 0;
    writeWord(draft, 2);
    writeWord(draft, 0);
    writeWord(draft, 0);
    writeWord(draft, 16_383);
    writeWord(draft, 16_383);
    draft.currentIndex = 0;
    check(
        throws(new RIFFChunk("CURV", draft.length, draft)),
        "a draft CURV with a WORD count is rejected"
    );
    check(
        throws(new RIFFChunk("CURV", 0, new IndexedByteArray(0))),
        "an empty chunk has no DWORD count and is rejected"
    );
    // Through the writer
    const bank = makeBank(sineSample(), {}, (zone, b) => {
        zone.addModulators(curved(21, full));
        b.addCustomCurves(full);
    });
    const file = new Uint8Array(bank.writeSFe());
    const curv = chunksOf(file, "CURV")[0];
    const count = curv[0] | (curv[1] << 8) | (curv[2] << 16) | (curv[3] << 24);
    // A DWORD count, then per curve a 40 byte name, a WORD point count and 4 bytes per point
    const expectedLength = bank.customCurves.reduce(
        (length, c) => length + 42 + c.points.length * 4,
        4
    );
    check(
        count === 3 && curv.length === expectedLength,
        `the written CURV count is a DWORD (${count} curves with the two default ones, ${curv.length} of ${expectedLength} bytes)`
    );
    const back = sfeRoundTrip(bank);
    const mod = back.instruments[0].zones[0].modulators[0];
    check(
        valid(mod) &&
            mod.primarySource.curve instanceof CustomCurve &&
            mod.primarySource.curve.points[1].x === 16_384,
        "a curve with a point at 16384 survives the writer"
    );
}

console.info("Item 6: linked modulators");
{
    const link = readModulators(
        rawChunk([
            raw(127, 0),
            raw(0x80 | 5, 0, GeneratorTypes.fineTune, 127),
            raw(0x80 | 5, 0, 0x80_00 | GeneratorTypes.fineTune),
            // CC 119 is not a link
            raw(0x80 | 119, 0),
            // The controllers SF2 8.2.1 calls illegal
            ...[0, 6, 32, 38, 98, 101, 120, 127].map((cc) => raw(0x80 | cc, 0)),
            raw(0x80 | 5, 0x80 | 6)
        ]),
        true
    );
    check(
        !valid(link[0]) && !valid(link[1]) && !valid(link[2]) && valid(link[3]),
        "a link source, a link amount source and a destination with bit 15 are ignored, CC 119 is not"
    );
    check(
        link.slice(4).every((m) => !valid(m)),
        "a modulator with an illegal controller as its source or amount source is ignored"
    );
    check(
        !valid(readModulators(rawChunk([raw(127, 0)]), false)[0]),
        "and in a file that is not SFe"
    );
    // Through a file: a modulator that would supersede a default one if it were not ignored
    const mkLinked = () =>
        new Modulator(
            new ModulatorSource(
                MIDIControllers.mainVolume,
                ModulatorCurveTypes.concave,
                true,
                false,
                true
            ),
            new ModulatorSource(127),
            GeneratorTypes.initialAttenuation,
            0
        );
    const bank = makeBank(sineSample(), {}, (zone) =>
        zone.addModulators(mkLinked())
    );
    for (const [name, back] of [
        ["SFe", sfeRoundTrip(bank)],
        ["SF2", sf2RoundTrip(bank)]
    ] as const) {
        const params = back.presets[0].getVoiceParameters(60, 100)[0];
        const volume = params.modulators.filter(
            (m) =>
                m.destination === GeneratorTypes.initialAttenuation &&
                m.primarySource.isController(MIDIControllers.mainVolume)
        );
        check(
            volume.length === 1 && volume[0].transformAmount === 960,
            `${name}: the ignored linked modulator supersedes nothing, the default CC 7 stays at 960`
        );
    }
}

console.info("Item 7: unknown transforms and destinations");
{
    const unknown = readModulators(
        rawChunk([
            raw(0x80 | 5, 7),
            raw(0x80 | 5, 1),
            raw(0x80 | 5, 2),
            raw(0x80 | 5, 0),
            // An unused SoundFont 2 destination, one above the known ones and one at the SoundFont 2 end marker
            raw(0x80 | 5, 0, 14),
            raw(0x80 | 5, 0, 92),
            raw(0x80 | 5, 0, 0x7f_ff)
        ]),
        true
    );
    check(
        !valid(unknown[0]) &&
            !valid(unknown[1]) &&
            valid(unknown[2]) &&
            valid(unknown[3]),
        "transform 7 and 1 are unknown, 2 and 0 are known"
    );
    check(
        !valid(unknown[4]) && !valid(unknown[5]) && !valid(unknown[6]),
        "the destinations 14, 92 and 32767 are unknown"
    );
    // A flagged modulator with an unknown transform still takes its record
    const flaggedUnknown = readModulators(
        rawChunk([
            raw(custom(21) | 0x80, FLAG | 9),
            raw(custom(22) | 0x80, FLAG)
        ]),
        true,
        curves,
        recordChunk([
            { source: 0, amount: 0 },
            { source: 1, amount: 0 }
        ])
    );
    check(
        !valid(flaggedUnknown[0]) &&
            valid(flaggedUnknown[1]) &&
            flaggedUnknown[1].primarySource.curve === curveB,
        "an unknown transform with the flag is ignored and still takes its record"
    );
    // Through the writer: an ignored modulator supersedes nothing
    const attenuationMod = (transform: number, destination: number) =>
        new Modulator(
            new ModulatorSource(
                MIDIControllers.mainVolume,
                ModulatorCurveTypes.concave,
                true,
                false,
                true
            ),
            new ModulatorSource(),
            destination as typeof GeneratorTypes.initialAttenuation,
            0,
            transform as 0
        );
    for (const [name, mod] of [
        [
            "an unknown transform",
            attenuationMod(5, GeneratorTypes.initialAttenuation)
        ]
    ] as const) {
        const bank = makeBank(sineSample(), {}, (zone) =>
            zone.addModulators(mod)
        );
        for (const [format, back] of [
            ["SFe", sfeRoundTrip(bank)],
            ["SF2", sf2RoundTrip(bank)]
        ] as const) {
            const params = back.presets[0].getVoiceParameters(60, 100)[0];
            const volume = params.modulators.filter(
                (m) =>
                    m.destination === GeneratorTypes.initialAttenuation &&
                    m.primarySource.isController(MIDIControllers.mainVolume)
            );
            check(
                volume.length === 1 && volume[0].transformAmount === 960,
                `${format}: ${name} supersedes nothing, the default stays`
            );
        }
    }
    // Destination 92 (unknown) through the SFe writer and reader
    const bank = makeBank(sineSample(), {}, (zone) =>
        zone.addModulators(
            new Modulator(
                new ModulatorSource(20, ModulatorCurveTypes.linear, true),
                new ModulatorSource(),
                92 as typeof GeneratorTypes.pan,
                100
            ),
            plain(21)
        )
    );
    const mods = sfeRoundTrip(bank).instruments[0].zones[0].modulators;
    check(
        mods.filter((m) => valid(m)).length === 1,
        "a modulator to destination 92 is ignored by an SFe 4.0 reader and the other stays"
    );
}

console.info("gm.sf2 round trips:");
{
    const file = readFileSync("tests/files/sound_bank/gm.sf2");
    const load = () =>
        SoundBankLoader.fromArrayBuffer(
            file.buffer.slice(
                file.byteOffset,
                file.byteOffset + file.byteLength
            )
        );
    const original = load();
    const roundTripped = SoundBankLoader.fromArrayBuffer(original.writeSF2());
    const second = SoundBankLoader.fromArrayBuffer(roundTripped.writeSF2());
    const viaSFe = SoundBankLoader.fromArrayBuffer(
        SoundBankLoader.fromArrayBuffer(original.writeSFe()).writeSF2()
    );

    // The attenuation values the files store, to see the change in file units
    const stored = (bytes: Uint8Array) => {
        const out = new Array<number>();
        for (const chunkName of ["igen", "pgen"]) {
            for (const payload of chunksOf(bytes, chunkName)) {
                for (let i = 0; i + 4 <= payload.length; i += 4) {
                    if (
                        (payload[i] | (payload[i + 1] << 8)) ===
                        GeneratorTypes.initialAttenuation
                    )
                        out.push(
                            ((payload[i + 2] | (payload[i + 3] << 8)) << 16) >>
                                16
                        );
                }
            }
        }
        return out;
    };
    const fileBefore = stored(new Uint8Array(file));
    const fileAfter = stored(new Uint8Array(original.writeSF2()));
    const fileSecond = stored(new Uint8Array(roundTripped.writeSF2()));
    const predicted = fileBefore.map((f) =>
        Math.round(Math.round(f * 0.4) / 0.4)
    );
    const fileChanged = fileBefore.filter((f, i) => f !== predicted[i]).length;
    const fileMaxChange = Math.max(
        ...fileBefore.map((f, i) => Math.abs(f - predicted[i]))
    );
    // If both lists hold the same values, whatever their order
    const sameValues = (a: number[], b: number[]) => {
        const counts = new Map<number, number>();
        for (const v of a) counts.set(v, (counts.get(v) ?? 0) + 1);
        for (const v of b) counts.set(v, (counts.get(v) ?? 0) - 1);
        return (
            a.length === b.length && [...counts.values()].every((c) => c === 0)
        );
    };
    console.info(
        `  attenuation values in the file: ${fileBefore.length}, ${fileChanged} change in the first round trip, the largest change is ${fileMaxChange} file units`
    );
    check(
        fileBefore.length > 1000 &&
            fileMaxChange <= 1 &&
            sameValues(fileAfter, predicted),
        "the stored attenuation values change as predicted, by at most 1 file unit"
    );
    check(
        fileSecond.join(",") === fileAfter.join(","),
        "and the second written file stores the same values"
    );

    // All generator values of every zone, as lists
    const dump = (b: BasicSoundBank) =>
        [...b.presets, ...b.instruments].flatMap((e) =>
            [e.globalZone, ...e.zones].map((z) =>
                // Integer keys come out in ascending order
                Object.entries(
                    Object.fromEntries(
                        z.generators.map((g) => [g.type, g.value])
                    )
                ).join(",")
            )
        );
    const compare = (a: BasicSoundBank, b: BasicSoundBank) => {
        const da = [...a.presets, ...a.instruments].flatMap((e) =>
            [e.globalZone, ...e.zones].map((z) => z.generators)
        );
        const db = [...b.presets, ...b.instruments].flatMap((e) =>
            [e.globalZone, ...e.zones].map((z) => z.generators)
        );
        let maxAttenuation = 0;
        let changedAttenuation = 0;
        let otherDifferences = 0;
        let values = 0;
        for (const [i, gens] of da.entries()) {
            const other = new Map(db[i].map((g) => [g.type, g.value]));
            for (const g of gens) {
                values++;
                const v = other.get(g.type);
                if (g.type === GeneratorTypes.initialAttenuation) {
                    const d = Math.abs((v ?? 0) - g.value);
                    if (d > 0) changedAttenuation++;
                    maxAttenuation = Math.max(maxAttenuation, d);
                } else if (v !== g.value) otherDifferences++;
            }
        }
        return { maxAttenuation, changedAttenuation, otherDifferences, values };
    };
    const first = compare(original, roundTripped);
    console.info(
        `  gm.sf2 to SF2 and back: ${first.values} generator values, ${first.changedAttenuation} attenuation values changed (largest change ${first.maxAttenuation} cB), ${first.otherDifferences} other differences`
    );
    check(
        first.maxAttenuation <= 1 && first.otherDifferences === 0,
        "the first SF2 round trip changes attenuation by at most 1 cB and nothing else"
    );
    const stable = compare(roundTripped, second);
    check(
        stable.changedAttenuation === 0 &&
            dump(roundTripped).join("|") === dump(second).join("|"),
        "the second round trip changes nothing"
    );
    const viaSFeCompare = compare(original, viaSFe);
    console.info(
        `  gm.sf2 to SFe to SF2: ${viaSFeCompare.changedAttenuation} attenuation values changed (largest change ${viaSFeCompare.maxAttenuation} cB), ${viaSFeCompare.otherDifferences} other differences`
    );
    check(
        viaSFeCompare.maxAttenuation <= 1 &&
            viaSFeCompare.otherDifferences === 0,
        "SF2 to SFe to SF2 changes attenuation by at most 1 cB and nothing else"
    );
    check(
        dump(roundTripped).join("|") === dump(viaSFe).join("|"),
        "and gives the same generators as the SF2 round trip"
    );

    // The sum a voice uses against the old floor(sum * 0.4), rebuilt from the file units of each part
    let maxSumDifference = 0;
    let sums = 0;
    const toFile = (v: number) => Math.round(v / 0.4);
    const attenuationOf = (zone: BasicZone, parent: BasicZone) => {
        const own = zone.getGenerator(GeneratorTypes.initialAttenuation, NaN);
        return Number.isNaN(own)
            ? parent.getGenerator(GeneratorTypes.initialAttenuation, 0)
            : own;
    };
    for (const preset of original.presets) {
        for (const presetZone of preset.zones) {
            const instrument = presetZone.instrument;
            if (!instrument) continue;
            const presetPart = attenuationOf(presetZone, preset.globalZone);
            for (const instrumentZone of instrument.zones) {
                const instrumentPart = attenuationOf(
                    instrumentZone,
                    instrument.globalZone
                );
                const old = Math.floor(
                    (toFile(instrumentPart) + toFile(presetPart)) * 0.4
                );
                maxSumDifference = Math.max(
                    maxSumDifference,
                    Math.abs(instrumentPart + presetPart - old)
                );
                sums++;
            }
        }
    }
    console.info(
        `  attenuation sums of ${sums} preset and instrument zone pairs against floor(sum * 0.4): largest difference ${maxSumDifference} cB`
    );
    check(
        maxSumDifference <= 2,
        `the summed attenuation stays within 2 cB of the old rule (${maxSumDifference})`
    );

    // The rendered level of some presets before and after
    const presetsToTry = [0, 4, 24, 32, 48, 56, 73, 80, 118];
    let maxLevelDifference = 0;
    let maxSFeLevelDifference = 0;
    const levelOf = async (bank: BasicSoundBank, program: number) => {
        const result = await render(
            bank,
            [
                {
                    time: 0,
                    run: (s: SpessaSynthProcessor) =>
                        s.programChange(0, program)
                },
                {
                    time: 0,
                    run: (s: SpessaSynthProcessor) => s.noteOn(0, 60, 100)
                }
            ],
            0.7
        );
        return levelDb(result.left, 0.1, 0.7);
    };
    for (const program of presetsToTry) {
        const a = await levelOf(original, program);
        const b = await levelOf(roundTripped, program);
        const c = await levelOf(viaSFe, program);
        maxLevelDifference = Math.max(maxLevelDifference, Math.abs(a - b));
        maxSFeLevelDifference = Math.max(
            maxSFeLevelDifference,
            Math.abs(a - c)
        );
        console.info(
            `  program ${program}: ${a.toFixed(2)} dB, after SF2 ${b.toFixed(2)} dB, after SFe and SF2 ${c.toFixed(2)} dB`
        );
    }
    check(
        maxLevelDifference < 0.2 && maxSFeLevelDifference < 0.2,
        `the rendered level changes by less than 0.2 dB (SF2 ${maxLevelDifference.toFixed(3)}, via SFe ${maxSFeLevelDifference.toFixed(3)})`
    );
    void SAMPLE_RATE;
}

console.info("The switch curve (section 7.2)");
{
    const tables = ModulatorCurve.fromType(ModulatorCurveTypes.switch).tables;
    // Unipolar positive, unipolar negative, bipolar positive, bipolar negative at CC 63, 64 and 127
    const at = (transform: number) =>
        [63, 64, 127].map((cc) => tables[transform][cc * 128]).join(" ");
    check(
        at(0) === "0 1 1" && at(2) === "-1 1 1",
        "a switch is on from 8192, so CC 64 is on"
    );
    check(
        at(1) === "1 0 0" && at(3) === "1 -1 -1",
        "the negative direction is the exact opposite"
    );
}

finish("prefreeze_test");
