// The SF2 conversion rules of the bank model:
// DMOD in SFe and SF2 files, the send rule, the modulation depth rule, DLS attenuation, the tracker bank and the type
import { existsSync, readFileSync } from "node:fs";
import {
    BasicMIDI,
    BasicSoundBank,
    GeneratorTypes,
    type MIDIController,
    MIDIControllers,
    Modulator,
    ModulatorControllerSources,
    ModulatorCurveTypes,
    ModulatorSource,
    type ModulatorTransformType,
    SoundBankLoader,
    SpessaLog
} from "../../../src";
import { Generator } from "../../../src/soundbank/basic_soundbank/generator";
import { toSF2Generator } from "../../../src/soundbank/soundfont/sf2_compatibility";
import { check, finish, makeBank, sineSample } from "./sfe_test_utils";

SpessaLog.infoEnabled = false;

type Destination = (typeof GeneratorTypes)[keyof typeof GeneratorTypes];

const cc = (controller: MIDIController) =>
    new ModulatorSource(controller, ModulatorCurveTypes.linear, true);

const send = (
    amount: number,
    controller: MIDIController = MIDIControllers.reverbDepth,
    destination: Destination = GeneratorTypes.reverbEffectsSend,
    transform: ModulatorTransformType = 0
) =>
    new Modulator(
        cc(controller),
        new ModulatorSource(),
        destination,
        amount,
        transform
    );

const range = () =>
    new ModulatorSource(
        ModulatorControllerSources.modulationDepthRange,
        ModulatorCurveTypes.linear,
        false
    );

const vibrato = (amount: number, destination: Destination) =>
    new Modulator(
        cc(MIDIControllers.modulationWheel),
        range(),
        destination,
        amount,
        0
    );

const readAs = (bank: BasicSoundBank) =>
    SoundBankLoader.fromArrayBuffer(bank.writeSF2());

const zoneOf = (bank: BasicSoundBank) => bank.instruments[0].zones[0];

const presetZoneOf = (bank: BasicSoundBank) => bank.presets[0].zones[0];

const find = (
    modulators: readonly Modulator[],
    destination: Destination,
    controller: MIDIController = MIDIControllers.reverbDepth
) =>
    modulators.find(
        (m) =>
            m.destination === destination &&
            m.primarySource.isController(controller)
    );

// The send the writer produces and the reader returns, from the formulas of the specification
const expectedSend = (amount: number) =>
    Math.max(-32_768, Math.min(1000, Math.round(amount / 5) * 5));

// DMOD of an SFe file
{
    const bank = makeBank(sineSample());
    const sfe = new Uint8Array(bank.writeSFe());
    const find4 = (a: Uint8Array, s: string) => {
        for (let i = 0; i < a.length - 4; i++)
            if (String.fromCharCode(a[i], a[i + 1], a[i + 2], a[i + 3]) === s)
                return i;
        return -1;
    };
    const position = find4(sfe, "DMOD");
    check(position >= 0, "an SFe file has a DMOD chunk");

    const renamed = sfe.slice();
    renamed[position + 3] = "X".codePointAt(0) ?? 0;
    let threw = false;
    let message = "";
    try {
        SoundBankLoader.fromArrayBuffer(renamed.buffer);
    } catch (error) {
        threw = true;
        message = error instanceof Error ? error.message : String(error);
    }
    check(
        threw && message.includes("DMOD"),
        `an SFe file without DMOD throws and the error mentions DMOD (${message})`
    );

    // The terminal record only
    const empty = makeBank(sineSample());
    empty.defaultModulators = [];
    const emptyRead = SoundBankLoader.fromArrayBuffer(empty.writeSFe());
    check(
        emptyRead.type === "sfe" && emptyRead.defaultModulators.length === 0,
        "an SFe DMOD with only the terminal record gives no default modulators"
    );

    // No bytes at all: cut the data of the chunk and fix the sizes of the chunk and of the lists
    const dv = new DataView(sfe.buffer, sfe.byteOffset, sfe.byteLength);
    const size = dv.getUint32(position + 4, true);
    const cut = new Uint8Array(sfe.length - size);
    cut.set(sfe.subarray(0, position + 8));
    cut.set(sfe.subarray(position + 8 + size), position + 8);
    const cutView = new DataView(cut.buffer);
    cutView.setUint32(position + 4, 0, true);
    cutView.setUint32(4, cutView.getUint32(4, true) - size, true);
    const info = find4(cut, "INFO");
    cutView.setUint32(info - 4, cutView.getUint32(info - 4, true) - size, true);
    const zero = SoundBankLoader.fromArrayBuffer(cut.buffer);
    check(
        zero.defaultModulators.length === 0,
        "an SFe DMOD with zero bytes gives no default modulators"
    );
}

// The send rule, in a zone, in a preset zone and in DMOD
const reverb = (b: BasicSoundBank) =>
    find(zoneOf(b).modulators, GeneratorTypes.reverbEffectsSend)
        ?.transformAmount;
const chorus = (b: BasicSoundBank) =>
    find(
        presetZoneOf(b).modulators,
        GeneratorTypes.chorusEffectsSend,
        MIDIControllers.chorusDepth
    )?.transformAmount;
const defaults = (b: BasicSoundBank) =>
    find(b.defaultModulators, GeneratorTypes.reverbEffectsSend)
        ?.transformAmount;
for (const amount of [
    0, 1, 150, 200, 201, 503, 1000, 5000, 6000, -500, -32_768
]) {
    const expected = expectedSend(amount);
    const bank = makeBank(sineSample(), {}, (zone) => {
        zone.addModulators(send(amount));
    });
    presetZoneOf(bank).addModulators(
        send(
            amount,
            MIDIControllers.chorusDepth,
            GeneratorTypes.chorusEffectsSend
        )
    );
    bank.defaultModulators = [send(amount)];
    const back = readAs(bank);
    const again = readAs(back);
    check(
        reverb(back) === expected &&
            chorus(back) === expected &&
            defaults(back) === expected,
        `a send of ${amount} reads back as ${expected} in a zone, a preset zone and DMOD (${reverb(back)}, ${chorus(back)}, ${defaults(back)})`
    );
    check(
        reverb(again) === expected &&
            chorus(again) === expected &&
            defaults(again) === expected,
        `a send of ${amount} is stable after the second round trip`
    );
}

// The pairs that are not of the default form are not scaled
{
    const crossed = makeBank(sineSample(), {}, (zone) => {
        zone.addModulators(
            send(
                503,
                MIDIControllers.chorusDepth,
                GeneratorTypes.reverbEffectsSend
            ),
            send(
                503,
                MIDIControllers.reverbDepth,
                GeneratorTypes.chorusEffectsSend
            )
        );
    });
    const back = readAs(crossed);
    check(
        find(
            zoneOf(back).modulators,
            GeneratorTypes.reverbEffectsSend,
            MIDIControllers.chorusDepth
        )?.transformAmount === 503 &&
            find(
                zoneOf(back).modulators,
                GeneratorTypes.chorusEffectsSend,
                MIDIControllers.reverbDepth
            )?.transformAmount === 503,
        "a crossed pair (CC 93 to reverb, CC 91 to chorus) is not scaled"
    );
    const absolute = makeBank(sineSample(), {}, (zone) => {
        zone.addModulators(
            send(
                503,
                MIDIControllers.reverbDepth,
                GeneratorTypes.reverbEffectsSend,
                2
            )
        );
    });
    const absoluteBack = readAs(absolute);
    const m = find(
        zoneOf(absoluteBack).modulators,
        GeneratorTypes.reverbEffectsSend
    );
    check(
        m?.transformAmount === 503 && m.transformType === 2,
        "a send with the absolute transform is not scaled"
    );
    check(
        crossed.getSF2Losses().sendAmounts === 0 &&
            absolute.getSF2Losses().sendAmounts === 0,
        "the loss report does not count them as send amounts"
    );
}

// The loss report
{
    const losses = (amount: number, inDefaults = false) => {
        const bank = makeBank(sineSample(), {}, (zone) => {
            if (!inDefaults) zone.addModulators(send(amount));
        });
        if (inDefaults) {
            bank.defaultModulators = [send(amount)];
        }
        return bank.getSF2Losses().sendAmounts;
    };
    check(losses(1500) === 1, "a zone send above 1000 is counted");
    check(
        losses(503) === 1,
        "a zone send that is not a multiple of 5 is counted"
    );
    check(
        losses(505) === 0 && losses(1000) === 0,
        "multiples of 5 up to 1000 are not counted"
    );
    check(losses(1500, true) === 1, "a DMOD send above 1000 is counted");
    check(
        losses(503, true) === 1,
        "a DMOD send that is not a multiple of 5 is counted"
    );
    check(losses(1000, true) === 0, "a DMOD full send is not counted");
}

// Modulation depth
{
    const bank = makeBank(sineSample(), {}, (zone) => {
        zone.addModulators(
            vibrato(1600, GeneratorTypes.vibLfoToPitch),
            vibrato(3200, GeneratorTypes.modLfoToPitch)
        );
    });
    const back = readAs(bank);
    const mods = zoneOf(back).modulators;
    const vib = find(
        mods,
        GeneratorTypes.vibLfoToPitch,
        MIDIControllers.modulationWheel
    );
    const mod = find(
        mods,
        GeneratorTypes.modLfoToPitch,
        MIDIControllers.modulationWheel
    );
    check(
        vib?.transformAmount === 1600 &&
            vib.secondarySource.index ===
                ModulatorControllerSources.modulationDepthRange &&
            mod?.transformAmount === 3200 &&
            mod.secondarySource.index ===
                ModulatorControllerSources.modulationDepthRange,
        "pitch destinations are written as amount / 32 and follow the range again when read"
    );
    check(bank.getSF2Losses().modulators === 0, "they are not counted as lost");

    const file = new Uint8Array(bank.writeSF2());
    // The imod record: CC 1 (0x0081), destination vibLfoToPitch, amount 50, no amount source
    let found = false;
    for (let i = 0; i < file.length - 10; i++) {
        if (
            file[i] === 0x81 &&
            file[i + 1] === 0 &&
            file[i + 2] === GeneratorTypes.vibLfoToPitch &&
            file[i + 3] === 0 &&
            file[i + 4] === 50 &&
            file[i + 5] === 0 &&
            file[i + 6] === 0 &&
            file[i + 7] === 0
        ) {
            found = true;
            break;
        }
    }
    check(found, "the file holds 50 for an amount of 1600");

    // Another destination, a range as the primary source and a limited amount
    const other = makeBank(sineSample(), {}, (zone) => {
        zone.addModulators(
            vibrato(1600, GeneratorTypes.initialFilterFc),
            new Modulator(
                range(),
                new ModulatorSource(),
                GeneratorTypes.vibLfoToPitch,
                100,
                0
            ),
            vibrato(100_000, GeneratorTypes.vibLfoToPitch)
        );
    });
    const otherBack = readAs(other);
    const left = zoneOf(otherBack).modulators;
    check(
        find(
            left,
            GeneratorTypes.initialFilterFc,
            MIDIControllers.modulationWheel
        ) === undefined,
        "a range modulator with another destination is dropped"
    );
    check(
        !left.some(
            (m) =>
                m.primarySource.index ===
                    ModulatorControllerSources.modulationDepthRange &&
                !m.primarySource.isCC
        ),
        "a modulator with the range as its source is dropped"
    );
    check(
        find(
            left,
            GeneratorTypes.vibLfoToPitch,
            MIDIControllers.modulationWheel
        )?.transformAmount ===
            1023 * 32,
        "an amount beyond the file range is limited to 1023 and comes back as 32736"
    );
    check(
        other.getSF2Losses().modulators === 3,
        `the dropped and the limited modulators are counted as lost (${other.getSF2Losses().modulators})`
    );

    // Reading: only the pitch destinations with CC 1 and no amount source follow the range
    const plain = makeBank(sineSample(), {}, (zone) => {
        zone.addModulators(
            new Modulator(
                cc(MIDIControllers.modulationWheel),
                new ModulatorSource(),
                GeneratorTypes.modLfoToPitch,
                50,
                0
            ),
            new Modulator(
                cc(MIDIControllers.modulationWheel),
                new ModulatorSource(),
                GeneratorTypes.initialFilterFc,
                50,
                0
            ),
            new Modulator(
                cc(MIDIControllers.modulationWheel),
                new ModulatorSource(),
                GeneratorTypes.vibLfoToPitch,
                2000,
                0
            )
        );
    });
    const plainBack = zoneOf(readAs(plain)).modulators;
    const pitch = find(
        plainBack,
        GeneratorTypes.modLfoToPitch,
        MIDIControllers.modulationWheel
    );
    const filter = find(
        plainBack,
        GeneratorTypes.initialFilterFc,
        MIDIControllers.modulationWheel
    );
    const big = find(
        plainBack,
        GeneratorTypes.vibLfoToPitch,
        MIDIControllers.modulationWheel
    );
    check(
        pitch?.transformAmount === 1600 &&
            pitch.secondarySource.index ===
                ModulatorControllerSources.modulationDepthRange,
        "an SF2 mod wheel to modLfoToPitch gets the range and 32 times its amount"
    );
    check(
        filter?.transformAmount === 50 &&
            filter.secondarySource.index ===
                ModulatorControllerSources.noController &&
            big?.transformAmount === 2000 &&
            big.secondarySource.index ===
                ModulatorControllerSources.noController,
        "another destination and an amount above 1023 are left alone"
    );
}

// The amount source must be the plain range, and CC 1 may have any curve, polarity and direction
{
    const bipolarRange = new Modulator(
        cc(MIDIControllers.modulationWheel),
        new ModulatorSource(
            ModulatorControllerSources.modulationDepthRange,
            ModulatorCurveTypes.linear,
            false,
            true
        ),
        GeneratorTypes.vibLfoToPitch,
        1600,
        0
    );
    const odd = new Modulator(
        new ModulatorSource(
            MIDIControllers.modulationWheel,
            ModulatorCurveTypes.convex,
            true,
            true,
            true
        ),
        range(),
        GeneratorTypes.vibLfoToPitch,
        1600,
        2
    );
    const back = zoneOf(
        readAs(
            makeBank(sineSample(), {}, (zone) => {
                zone.addModulators(bipolarRange);
            })
        )
    ).modulators;
    check(
        find(
            back,
            GeneratorTypes.vibLfoToPitch,
            MIDIControllers.modulationWheel
        ) === undefined,
        "a vibrato with a bipolar range as its amount source is dropped"
    );
    const oddBack = find(
        zoneOf(
            readAs(
                makeBank(sineSample(), {}, (zone) => {
                    zone.addModulators(odd);
                })
            )
        ).modulators,
        GeneratorTypes.vibLfoToPitch,
        MIDIControllers.modulationWheel
    );
    check(
        oddBack?.transformAmount === 1600 &&
            oddBack.transformType === 2 &&
            oddBack.primarySource.isBipolar &&
            oddBack.primarySource.isNegative &&
            oddBack.primarySource.curveType === ModulatorCurveTypes.convex,
        "CC 1 with another curve, polarity, direction and transform is converted both ways"
    );
}

// Half rounding goes toward positive infinity in every conversion of section 9
{
    const attenuation = (value: number) =>
        toSF2Generator(
            new Generator(GeneratorTypes.initialAttenuation, value, false)
        ).value;
    check(
        attenuation(1) === 3 && attenuation(-1) === -2,
        `an attenuation of 1 is written as 3 and -1 as -2 (${attenuation(1)}, ${attenuation(-1)})`
    );
    check(
        attenuation(3) === 8 && attenuation(-3) === -7,
        `an attenuation of 3 is written as 8 and -3 as -7 (${attenuation(3)}, ${attenuation(-3)})`
    );

    // The imod record of the mod wheel vibrato holds the amount at the fifth byte
    const hasVibratoAmount = (file: Uint8Array, amount: number) => {
        const low = amount & 0xff;
        const high = (amount >> 8) & 0xff;
        for (let i = 0; i < file.length - 10; i++) {
            if (
                file[i] === 0x81 &&
                file[i + 1] === 0 &&
                file[i + 2] === GeneratorTypes.vibLfoToPitch &&
                file[i + 3] === 0 &&
                file[i + 4] === low &&
                file[i + 5] === high &&
                file[i + 6] === 0 &&
                file[i + 7] === 0
            ) {
                return true;
            }
        }
        return false;
    };
    for (const [amount, expected] of [
        [16, 1],
        [-16, 0],
        [48, 2],
        [-48, -1]
    ]) {
        const file = new Uint8Array(
            makeBank(sineSample(), {}, (zone) => {
                zone.addModulators(
                    vibrato(amount, GeneratorTypes.vibLfoToPitch)
                );
            }).writeSF2()
        );
        check(
            hasVibratoAmount(file, expected),
            `a vibrato amount of ${amount} is written as ${expected}`
        );
    }
}

// The attenuation of a DLS file survives the conversions
{
    const path = "tests/files/sound_bank/gm.dls";
    if (existsSync(path)) {
        const file = readFileSync(path);
        const input = file.buffer.slice(
            file.byteOffset,
            file.byteOffset + file.byteLength
        );
        const attenuations = (bank: BasicSoundBank) =>
            bank.instruments.flatMap((inst) =>
                [inst.globalZone, ...inst.zones].map((z) =>
                    z.getGenerator(GeneratorTypes.initialAttenuation, -1)
                )
            );
        const dls = SoundBankLoader.fromArrayBuffer(input);
        const original = attenuations(dls);
        const viaSF2 = attenuations(readAs(dls));
        const viaDLS = attenuations(
            SoundBankLoader.fromArrayBuffer(dls.writeDLS())
        );
        check(
            original.length === viaSF2.length &&
                original.every((v, i) => Math.abs(v - viaSF2[i]) <= 1),
            "DLS to bank to SF2 to bank keeps the attenuation"
        );
        check(
            original.length === viaDLS.length &&
                original.every((v, i) => Math.abs(v - viaDLS[i]) <= 1),
            "DLS to bank to DLS keeps the attenuation"
        );
        check(
            original.some((v) => v !== 0 && v !== -1),
            "the DLS file has attenuation to compare"
        );
    } else {
        console.info(
            "  skip DLS attenuation, tests/files/sound_bank/gm.dls is missing"
        );
    }
}

// The bank the tracker builds is an SFe bank, and its attenuation is stable
{
    const path = "tests/files/it_support/work_eek/surasshu_-_eek.it";
    if (existsSync(path)) {
        const file = readFileSync(path);
        const types = new Array<string>();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const original = BasicSoundBank.prototype.writeSF2;
        BasicSoundBank.prototype.writeSF2 = function (
            this: BasicSoundBank,
            ...args
        ) {
            types.push(this.type);
            return original.apply(this, args);
        };
        let midi: BasicMIDI;
        try {
            midi = BasicMIDI.fromArrayBuffer(
                file.buffer.slice(
                    file.byteOffset,
                    file.byteOffset + file.byteLength
                ),
                path
            );
        } finally {
            BasicSoundBank.prototype.writeSF2 = original;
        }
        check(
            types.length === 1 && types[0] === "sfe",
            `the tracker bank is typed as SFe (${types.join(",")})`
        );
        const embedded = midi.embeddedSoundBank;
        check(
            embedded !== undefined,
            "the tracker module has an embedded bank"
        );
        if (embedded) {
            const attenuations = (bank: BasicSoundBank) =>
                bank.instruments.flatMap((inst) =>
                    [inst.globalZone, ...inst.zones].map((z) =>
                        z.getGenerator(GeneratorTypes.initialAttenuation, -1)
                    )
                );
            const first = SoundBankLoader.fromArrayBuffer(embedded);
            const second = readAs(first);
            check(
                attenuations(first).join(",") ===
                    attenuations(second).join(","),
                "the attenuation of the embedded bank is stable on a second read"
            );
            check(
                attenuations(first).some((v) => v > 0),
                "the embedded bank has an attenuation"
            );
        }
    } else {
        console.info("  skip tracker, the module is missing");
    }
}

// A new bank is an SFe bank with the SFe default list
{
    const bank = new BasicSoundBank();
    check(bank.type === "sfe", "a new BasicSoundBank is typed as SFe");
    const list = bank.defaultModulators;
    // The entries of section 7.3 that the conversions touch
    const has = (
        controller: MIDIController,
        destination: Destination,
        amount: number,
        amountSource?: number
    ) =>
        list.some(
            (m) =>
                m.primarySource.isController(controller) &&
                m.destination === destination &&
                m.transformAmount === amount &&
                (amountSource === undefined ||
                    m.secondarySource.toSourceEnum() === amountSource)
        );
    check(
        list.length === 16 &&
            !list.some(
                (m) =>
                    !m.primarySource.isCC &&
                    m.primarySource.index ===
                        ModulatorControllerSources.channelPressure
            ),
        `a new bank has 16 default modulators and no channel pressure vibrato (${list.length})`
    );
    check(
        has(
            MIDIControllers.filterResonance,
            GeneratorTypes.gain,
            125,
            0x0c_c7
        ) &&
            has(
                MIDIControllers.brightness,
                GeneratorTypes.initialFilterFc,
                4800
            ) &&
            has(
                MIDIControllers.reverbDepth,
                GeneratorTypes.reverbEffectsSend,
                1000
            ) &&
            has(
                MIDIControllers.chorusDepth,
                GeneratorTypes.chorusEffectsSend,
                1000
            ) &&
            has(
                MIDIControllers.modulationWheel,
                GeneratorTypes.vibLfoToPitch,
                1600,
                ModulatorControllerSources.modulationDepthRange
            ),
        "a new bank holds the CC 71 gain, CC 74, CC 91, CC 93 and CC 1 vibrato modulators of section 7.3"
    );

    const sameList = (a: readonly Modulator[], b: readonly Modulator[]) =>
        a.length === b.length &&
        a.every((m) => b.some((n) => Modulator.isIdentical(m, n, true)));

    // An SF2 file without DMOD gets the list of a new bank
    const path = "tests/files/sound_bank/gm.sf2";
    if (existsSync(path)) {
        const file = readFileSync(path);
        const read = SoundBankLoader.fromArrayBuffer(
            file.buffer.slice(
                file.byteOffset,
                file.byteOffset + file.byteLength
            )
        );
        check(
            sameList(read.defaultModulators, list),
            `an SF2 file without DMOD gets exactly the list of a new bank (${read.defaultModulators.length} modulators)`
        );
    } else {
        console.info("  skip SF2 without DMOD, gm.sf2 is missing");
    }

    // The list of section 7.3 plus one modulator survives as SF2
    const extra = new Modulator(
        cc(MIDIControllers.expression),
        new ModulatorSource(),
        GeneratorTypes.initialFilterFc,
        -500,
        0
    );
    const plusOne = makeBank(sineSample());
    plusOne.defaultModulators = [...plusOne.defaultModulators, extra];
    const back = readAs(plusOne);
    check(
        back.defaultModulators.length === 17 &&
            sameList(back.defaultModulators, [...list, extra]),
        `the list of section 7.3 plus one modulator comes back as that list plus the modulator (${back.defaultModulators.length} modulators)`
    );
}

// The other forms of the Modulation Depth Range as the amount source are dropped and counted
{
    const forms = [
        ["negative", ModulatorCurveTypes.linear, false, true],
        ["concave", ModulatorCurveTypes.concave, false, false],
        ["switch", ModulatorCurveTypes.switch, false, false]
    ] as const;
    for (const [name, curve, bipolar, negative] of forms) {
        const mod = new Modulator(
            cc(MIDIControllers.modulationWheel),
            new ModulatorSource(
                ModulatorControllerSources.modulationDepthRange,
                curve,
                false,
                bipolar,
                negative
            ),
            GeneratorTypes.vibLfoToPitch,
            1600,
            0
        );
        const bank = makeBank(sineSample(), {}, (zone) => {
            zone.addModulators(mod);
        });
        check(
            find(
                zoneOf(readAs(bank)).modulators,
                GeneratorTypes.vibLfoToPitch,
                MIDIControllers.modulationWheel
            ) === undefined,
            `a vibrato with a ${name} range as its amount source is dropped`
        );
        check(
            bank.getSF2Losses().modulators === 1,
            `a vibrato with a ${name} range as its amount source is counted as lost`
        );
    }
}

// The attenuation is limited to the SHORT range
{
    const attenuation = (value: number) =>
        toSF2Generator(
            new Generator(GeneratorTypes.initialAttenuation, value, false)
        ).value;
    const written = [13_107, 13_108, 32_767, -13_107, -32_768].map((v) =>
        attenuation(v)
    );
    check(
        written.join(",") === "32767,32767,32767,-32767,-32768",
        `the attenuation is limited to -32768 to 32767 (${written.join(",")})`
    );
}

// The DMOD chunk is left out only for an equal list
{
    const hasDMOD = (bank: BasicSoundBank) => {
        const file = new Uint8Array(bank.writeSF2());
        for (let i = 0; i < file.length - 4; i++) {
            if (
                String.fromCharCode(
                    file[i],
                    file[i + 1],
                    file[i + 2],
                    file[i + 3]
                ) === "DMOD"
            )
                return true;
        }
        return false;
    };
    const copies = () =>
        new BasicSoundBank().defaultModulators.map((m) =>
            Modulator.copyFrom(m)
        );

    const duplicate = copies();
    duplicate[1] = Modulator.copyFrom(duplicate[0]);
    const duplicated = makeBank(sineSample());
    duplicated.defaultModulators = duplicate;
    check(
        hasDMOD(duplicated),
        "a list with a copy in place of another entry is written with DMOD"
    );

    const reordered = makeBank(sineSample());
    const [first, ...rest] = copies();
    reordered.defaultModulators = [...rest, first];
    check(
        !hasDMOD(reordered),
        "a reordered list of section 7.3 is written without DMOD"
    );

    const changed = copies();
    changed[0].transformAmount += 1;
    const amount = makeBank(sineSample());
    amount.defaultModulators = changed;
    check(
        hasDMOD(amount),
        "a list of section 7.3 with one amount changed is written with DMOD"
    );
}

finish("sf2_conversion_test");
