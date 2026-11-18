// The extended modulator records (xdta pmod/imod and XMOD) are sparse:
// One record per modulator with a custom curve, in order, then the terminal. A wrong count ignores them all.
import {
    CustomCurve,
    GeneratorTypes,
    IndexedByteArray,
    Modulator,
    ModulatorCurveTypes,
    ModulatorSource,
    type ModulatorSourceIndex
} from "../../../src";
import { readModulators } from "../../../src/soundbank/soundfont/read/modulators";
import { RIFFChunk } from "../../../src/utils/riff_chunk";
import {
    MOD_BYTE_SIZE,
    XMOD_BYTE_SIZE
} from "../../../src/soundbank/basic_soundbank/modulator";
import {
    check,
    finish,
    makeBank,
    sfeRoundTrip,
    sineSample
} from "./sfe_test_utils";

const curveA = new CustomCurve(
    [
        { x: 0, y: 0 },
        { x: 16_383, y: 16_384 }
    ],
    "A"
);
const curveB = new CustomCurve(
    [
        { x: 0, y: 16_384 },
        { x: 16_383, y: 0 }
    ],
    "B"
);
const plain = (cc: ModulatorSourceIndex) =>
    new Modulator(
        new ModulatorSource(cc, ModulatorCurveTypes.linear, true, false),
        new ModulatorSource(),
        GeneratorTypes.pan,
        100,
        0
    );
// Plain, custom source, plain, custom amount source
const modulators = [
    plain(20),
    new Modulator(
        new ModulatorSource(21, curveA, true, false),
        new ModulatorSource(),
        GeneratorTypes.pan,
        200,
        0
    ),
    plain(22),
    new Modulator(
        new ModulatorSource(23, ModulatorCurveTypes.linear, true, false),
        new ModulatorSource(24, curveB, true, false),
        GeneratorTypes.fineTune,
        30,
        0
    )
];
const curves = [curveA, curveB];
const curveIndex = (c: unknown) => curves.indexOf(c as CustomCurve);

function modChunk() {
    const data = new IndexedByteArray((modulators.length + 1) * MOD_BYTE_SIZE);
    for (const m of modulators) m.write(data, undefined, true);
    data.currentIndex = 0;
    return new RIFFChunk("imod", data.length, data);
}

// The extended records of the given modulators, then the terminal
function extChunk(withRecords: Modulator[]) {
    const data = new IndexedByteArray(
        (withRecords.length + 1) * XMOD_BYTE_SIZE
    );
    for (const m of withRecords) m.writeExtended(data, curveIndex);
    data.currentIndex = 0;
    return new RIFFChunk("imod", data.length, data);
}

const custom = modulators.filter((m) => m.usesCustomCurve);
const read = (ext: RIFFChunk) => readModulators(modChunk(), true, curves, ext);
const valid = (m: Modulator) => m.destination !== GeneratorTypes.invalid;

// The right count: every custom curve modulator gets its own curve
const matched = read(extChunk(custom));
check(matched.length === 4, "four modulators read");
check(
    matched[1].primarySource.curve === curveA &&
        matched[3].secondarySource.curve === curveB,
    "the records match the custom curve modulators in order"
);
check(
    matched.every((m) => valid(m)),
    "all modulators are valid"
);

// One record short: the custom ones are ignored, the plain ones stay
const short = read(extChunk(custom.slice(0, 1)));
check(
    valid(short[0]) && valid(short[2]) && !valid(short[1]) && !valid(short[3]),
    "a wrong count ignores only the custom curve modulators"
);

// The old layout, one record per modulator, does not match either
const full = read(extChunk(modulators));
check(
    !valid(full[1]) && !valid(full[3]) && valid(full[0]),
    "one record per modulator is a wrong count"
);

// Only the terminal (SF2 with extended limits) works for a list without custom curves
const plainOnly = readModulators(
    (() => {
        const data = new IndexedByteArray(3 * MOD_BYTE_SIZE);
        plain(20).write(data);
        plain(22).write(data);
        data.currentIndex = 0;
        return new RIFFChunk("imod", data.length, data);
    })(),
    true,
    curves,
    extChunk([])
);
check(
    plainOnly.every((m) => valid(m)),
    "terminal only is right without custom curves"
);

// Round trip through the writer
const bank = makeBank(sineSample(), {}, (zone, b) => {
    zone.addModulators(...modulators.map((m) => Modulator.copyFrom(m)));
    b.addCustomCurves(curveA, curveB);
});
const sfe = sfeRoundTrip(bank);
const zoneMods = sfe.instruments[0].zones[0].modulators;
check(
    zoneMods.length === 4 &&
        zoneMods[1].primarySource.curve.isIdentical(curveA) &&
        zoneMods[3].secondarySource.curve.isIdentical(curveB) &&
        zoneMods.every((m) => valid(m)),
    "SFe round trip keeps the curves of the sparse records"
);
const file = new Uint8Array(bank.writeSFe());
// The xdta imod holds two records and the terminal (30 bytes).
// The xdta-list is in the INFO-list, so its imod is the first one in the file.
let xdtaImodSize = -1;
const name = [0x69, 0x6d, 0x6f, 0x64]; // "imod"
for (let i = 0; i < file.length - 8; i++) {
    if (name.every((c, k) => file[i + k] === c)) {
        xdtaImodSize =
            file[i + 4] |
            (file[i + 5] << 8) |
            (file[i + 6] << 16) |
            (file[i + 7] << 24);
        break;
    }
}
check(
    xdtaImodSize === 3 * XMOD_BYTE_SIZE,
    `xdta imod holds two records and the terminal (${xdtaImodSize} bytes)`
);

finish("sparse_records_test");
