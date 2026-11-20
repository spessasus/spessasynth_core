// The fixes from the 2026-11-15 review: link bookkeeping, writer limits, the SF2 rules and the new send generator
import {
    BasicSoundBank,
    CustomCurve,
    Generator,
    type GeneratorType,
    GeneratorTypes,
    MIDIControllers,
    Modulator,
    ModulatorCurveTypes,
    ModulatorSource,
    type ModulatorSourceIndex,
    SoundBankCloner,
    SoundBankLoader,
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
    renderLeft,
    SAMPLE_RATE,
    sf2RoundTrip,
    sfeRoundTrip,
    sineSample
} from "./sfe_test_utils";

const curve = (y: number, name = "") =>
    new CustomCurve(
        [
            { x: 0, y: 0 },
            { x: 16_383, y }
        ],
        name
    );
const customModulator = (c: CustomCurve, cc = 20) =>
    new Modulator(
        new ModulatorSource(cc as ModulatorSourceIndex, c, false, false),
        new ModulatorSource(),
        GeneratorTypes.pan,
        100,
        0
    );
const throws = (run: () => unknown) => {
    try {
        run();
        return false;
    } catch {
        return true;
    }
};
// Curve use counted from the links against the modulators that really use it
const linkCount = (bank: BasicSoundBank, c: CustomCurve) => {
    let count = 0;
    const lists = [bank.defaultModulators];
    for (const element of [...bank.presets, ...bank.instruments]) {
        for (const zone of [element.globalZone, ...element.zones])
            lists.push(zone.modulators);
    }
    for (const list of lists) {
        for (const m of list) {
            if (m.primarySource.curve === c) count++;
            if (m.secondarySource.curve === c) count++;
        }
    }
    return count;
};

// A negative NRPN offset must not wrap an instant time into a long one
{
    const bank = makeBank(sineSample(), {
        [GeneratorTypes.sampleModes]: 1,
        [GeneratorTypes.delayVoice]: -32_768
    });
    const left = await renderLeft(
        bank,
        [
            {
                time: 0,
                run: (s) => {
                    // SF2 NRPN (MSB 120) for generator 87, 50 below the center
                    s.controllerChange(
                        0,
                        MIDIControllers.nonRegisteredParameterMSB,
                        120
                    );
                    s.controllerChange(
                        0,
                        MIDIControllers.nonRegisteredParameterLSB,
                        87
                    );
                    s.controllerChange(0, MIDIControllers.dataEntryMSB, 63);
                    s.controllerChange(0, MIDIControllers.dataEntryLSB, 78);
                }
            },
            ...note(0.01, 0.5)
        ],
        0.6
    );
    check(
        levelDb(left, 0.1, 0.4) > -40,
        "a negative NRPN offset on an instant delayVoice keeps it instant"
    );
}

// The curve count and the curve indexes are DWORDs, so more than 65535 curves are written
{
    const bank = new BasicSoundBank();
    for (let i = 0; i < 65_534; i++)
        bank.customCurves.push(curve(1 + (i % 16_000)));
    let back: BasicSoundBank | undefined;
    check(
        bank.customCurves.length === 65_536 &&
            !throws(() => {
                back = SoundBankLoader.fromArrayBuffer(bank.writeSFe());
            }) &&
            back?.customCurves.length === 65_536,
        "more than 65535 custom curves are written and read back"
    );
}

// Merging gives the merged bank its own default curves
{
    const a = new BasicSoundBank();
    const b = new BasicSoundBank();
    const before = a.customCurves.map((c) => c.useCount);
    const merged = BasicSoundBank.mergeSoundBanks(a, b);
    check(
        a.customCurves.every((c, i) => c.useCount === before[i]),
        "merge leaves the first bank's curve use counts alone"
    );
    check(
        merged.customCurves.length === 2 &&
            merged.customCurves.every(
                (c) =>
                    !a.customCurves.includes(c) &&
                    c.useCount === linkCount(merged, c)
            ),
        "the merged bank owns copies of the default curves, with the right use counts"
    );
    a.defaultModulators = [];
    check(
        !throws(() => {
            const all = a.customCurves.slice();
            for (const c of all) a.deleteCustomCurve(c);
        }),
        "the first bank's default curves can be deleted after a merge"
    );
}

// Adding modulators is all or nothing
{
    const c = curve(16_384);
    const bank = makeBank(sineSample(), {}, (zone, b) => {
        b.addCustomCurves(c);
        zone.addModulators(customModulator(c));
    });
    const zone = bank.instruments[0].zones[0];
    const taken = zone.modulators[0];
    const other = bank.instruments[0].globalZone;
    const fresh = customModulator(c, 21);
    const usesBefore = c.useCount;
    check(
        throws(() => other.addModulators(fresh, taken)) &&
            other.modulators.length === 0 &&
            c.useCount === usesBefore,
        "a failed addModulators adds nothing and links nothing"
    );
    check(
        !throws(() => other.addModulators(fresh)) &&
            c.useCount === usesBefore + 1,
        "the modulator of the failed call can still be added"
    );
    check(
        throws(() => other.setModulators([taken])) &&
            other.modulators.length === 1,
        "a failed setModulators keeps the zone's modulators"
    );
    const defaults = bank.defaultModulators;
    check(
        throws(() => (bank.defaultModulators = [...defaults, taken])) &&
            bank.defaultModulators.length === defaults.length &&
            bank.customCurves.every((x) => x.useCount === linkCount(bank, x)),
        "a failed default modulators assignment keeps the list and the links"
    );
    check(
        throws(() => other.addModulators(fresh)),
        "adding a modulator of the same zone again throws"
    );
    const twice = customModulator(c, 23);
    check(
        throws(() => zone.addModulators(twice, twice)),
        "the same modulator twice in one call throws"
    );
}

// The cloner keeps curve names, so unnamed curves are reused on the next clone
{
    const c1 = curve(16_384);
    const c2 = curve(8192);
    const source = makeBank(sineSample(), {}, (zone, b) => {
        b.addCustomCurves(c1, c2);
        zone.addModulators(customModulator(c1), customModulator(c2, 21));
    });
    const target = new BasicSoundBank();
    const base = target.customCurves.length;
    for (let i = 0; i < 3; i++) {
        new SoundBankCloner(target, { reuseByName: true }).clonePreset(
            source.presets[0]
        );
    }
    check(
        target.customCurves.length === base + 2 &&
            target.customCurves.slice(base).every((c) => c.name === ""),
        `three clones copy two unnamed curves once (${target.customCurves.length - base} curves)`
    );
    const copy = BasicSoundBank.copyFrom(source);
    check(
        copy.customCurves.every(
            (c, i) => c.name === source.customCurves[i].name
        ),
        "a copied bank keeps its curve names"
    );
}

// An unresolved custom curve is identical only to itself, both ways
{
    const real = new ModulatorSource(20, curve(16_384), false, false);
    const unresolved = ModulatorSource.fromSourceEnum(
        (ModulatorCurveTypes.custom << 10) | 0x80 | 20
    );
    check(
        !real.isIdentical(unresolved) && !unresolved.isIdentical(real),
        "a custom curve and an unresolved one are not identical, in either order"
    );
}

// Reverb and chorus sends: the bank holds real amounts, SF2 files a fifth
{
    const send = (
        amount: number,
        destination: GeneratorType = GeneratorTypes.reverbEffectsSend
    ) =>
        new Modulator(
            ModulatorSource.fromSourceEnum(
                destination === GeneratorTypes.reverbEffectsSend
                    ? 0x00_db
                    : 0x00_dd
            ),
            new ModulatorSource(),
            destination,
            amount,
            0
        );
    const defaults = new BasicSoundBank().defaultModulators;
    check(
        defaults.some(
            (m) =>
                m.destination === GeneratorTypes.reverbEffectsSend &&
                m.transformAmount === 1000
        ),
        "the default reverb send is 1000"
    );
    const bank = makeBank(sineSample(), {}, (zone) => {
        zone.addModulators(
            send(500),
            send(1000, GeneratorTypes.chorusEffectsSend)
        );
    });
    const amounts = (b: BasicSoundBank) =>
        b.instruments[0].zones[0].modulators
            .filter((m) => m.destination <= GeneratorTypes.reverbEffectsSend)
            .map((m) => m.transformAmount)
            .join(",");
    check(
        amounts(sf2RoundTrip(bank)) === "500,1000",
        "SF2 round trip keeps send amounts"
    );
    check(
        amounts(sfeRoundTrip(bank)) === "500,1000",
        "SFe round trip keeps send amounts"
    );
    // A send of the default form is stored as a fifth, so 350 is 70 in the file and reads back as 350
    const sf2File = makeBank(sineSample(), {}, (zone) => {
        zone.addModulators(
            send(350),
            send(350, GeneratorTypes.chorusEffectsSend)
        );
    });
    const loaded = sf2RoundTrip(sf2File);
    check(
        amounts(loaded) === "350,350",
        "model 350 is stored as 70 and read back as 350"
    );
    const first = new Uint8Array(sf2File.writeSF2());
    const second = new Uint8Array(loaded.writeSF2());
    check(
        first.length === second.length &&
            first.every((v, i) => v === second[i]),
        "an SF2 file is written back byte for byte"
    );
}

// Generator 89: the variation send follows CC 94 through a default modulator
{
    const bank = new BasicSoundBank();
    const variation = bank.defaultModulators.filter(
        (m) => m.destination === GeneratorTypes.variationEffectsSend
    );
    check(
        variation.length === 1 &&
            variation[0].primarySource.index ===
                MIDIControllers.variationDepth &&
            variation[0].transformAmount === 1000,
        "CC 94 to variationEffectsSend is a default modulator"
    );
    const zoneBank = makeBank(sineSample(), {
        [GeneratorTypes.variationEffectsSend]: 400
    });
    const value = (b: BasicSoundBank) =>
        b.instruments[0].zones[0].getGenerator(
            GeneratorTypes.variationEffectsSend,
            -1
        );
    check(
        value(sfeRoundTrip(zoneBank)) === 400,
        "SFe keeps variationEffectsSend"
    );
    check(
        value(sf2RoundTrip(zoneBank)) === -1,
        "SF2 drops variationEffectsSend"
    );
    // A changed list is written to DMOD, and the CC 94 default comes back on load
    bank.defaultModulators = bank.defaultModulators.filter(
        (m) => m.primarySource.index !== MIDIControllers.softPedal
    );
    const back = sf2RoundTrip(bank);
    // CC 71 to filterQOffset is SFe only, SF2 drops it and the reader does not add it back
    check(
        back.defaultModulators.length === bank.defaultModulators.length - 1 &&
            back.defaultModulators.some(
                (m) => m.destination === GeneratorTypes.variationEffectsSend
            ),
        "SF2 with DMOD: the CC 94 default is restored"
    );
}

// An empty default list stays empty in both formats
{
    const bank = makeBank(sineSample());
    bank.defaultModulators = [];
    check(
        sf2RoundTrip(bank).defaultModulators.length === 0,
        "SF2: an empty DMOD stays empty"
    );
    check(
        sfeRoundTrip(bank).defaultModulators.length === 0,
        "SFe: an empty DMOD stays empty"
    );
}

// An unknown choice counts as the default, not as the nearest value
{
    const lowpass = makeBank(sineSample(), {
        [GeneratorTypes.sampleModes]: 1,
        [GeneratorTypes.initialFilterFc]: 6000
    });
    // Files are read without clamping, so the value is stored the same way here
    const unknown = makeBank(
        sineSample(),
        {
            [GeneratorTypes.sampleModes]: 1,
            [GeneratorTypes.initialFilterFc]: 6000
        },
        (zone) =>
            zone.generators.push(
                new Generator(GeneratorTypes.filterType, 9, false)
            )
    );
    const a = await renderLeft(lowpass, note(0, 0.4), 0.5);
    const b = await renderLeft(unknown, note(0, 0.4), 0.5);
    check(
        a.every((v, i) => v === b[i]),
        "filterType 9 plays as the default lowpass"
    );
}

// The SF2 loss report
{
    const plain = makeBank(sineSample(), { [GeneratorTypes.sampleModes]: 1 });
    const none = plain.getSF2Losses();
    check(
        Object.values(none).every((v) => v === 0),
        "a plain bank has no SF2 losses"
    );
    check(
        Object.values(sf2RoundTrip(plain).getSF2Losses()).every((v) => v === 0),
        "a loaded SF2 bank has no SF2 losses"
    );
    const c = curve(16_384);
    const rich = makeBank(
        sineSample(),
        { [GeneratorTypes.sampleModes]: 4, [GeneratorTypes.gain]: 30 },
        (zone, b) => {
            b.addCustomCurves(c);
            // A real CC 20 (the helper's source is the reserved general controller 20, which is ignored and no loss)
            zone.addModulators(
                new Modulator(
                    new ModulatorSource(MIDIControllers.undefinedCC20, c, true),
                    new ModulatorSource(),
                    GeneratorTypes.pan,
                    100,
                    0
                )
            );
        }
    );
    const losses = rich.getSF2Losses();
    check(
        losses.generators === 1 &&
            losses.alternatingLoops === 1 &&
            losses.modulators === 1 &&
            losses.customCurves === 1 &&
            losses.defaultModulators === 0,
        `the losses of an SFe bank are counted (${JSON.stringify(losses)})`
    );
}

// The type follows how the file was read, and isng is always written
{
    const bank = makeBank(sineSample());
    const sfe = new Uint8Array(bank.writeSFe());
    const text = (file: Uint8Array) =>
        String.fromCodePoint(...file.slice(0, 200));
    check(
        text(sfe).includes("isng") && text(sfe).includes("SFe 4"),
        "SFe always writes isng as SFe 4"
    );
    check(
        text(new Uint8Array(bank.writeSF2())).includes("E-mu 10K2"),
        "SF2 writes the bank's own sound engine to isng"
    );
    check(
        SoundBankLoader.fromArrayBuffer(sfe.buffer).type === "sfe",
        "an SFe 4 file has the type sfe"
    );
    // The same file with version 3: read as SF2
    const old = sfe.slice();
    const ifil = text(old).indexOf("ifil");
    old[ifil + 8] = 3;
    check(
        SoundBankLoader.fromArrayBuffer(old.buffer).type === "sf2",
        "an SFe file below version 4 has the type sf2"
    );
}

// The standard default list is for comparing only, a bank gets copies through resetDefaultModulators
{
    const bank = makeBank(sineSample());
    check(
        throws(() => (bank.defaultModulators = SPESSASYNTH_DEFAULT_MODULATORS)),
        "assigning the standard default list throws"
    );
    check(
        throws(() => {
            SPESSASYNTH_DEFAULT_MODULATORS[0].transformAmount = 1;
        }),
        "the standard default modulators can't be changed"
    );
    // A changed list, still using the bank's curves
    bank.defaultModulators = bank.defaultModulators.slice(0, 12);
    bank.resetDefaultModulators();
    check(
        bank.defaultModulators.length ===
            SPESSASYNTH_DEFAULT_MODULATORS.length &&
            bank.customCurves.length === 2 &&
            bank.customCurves.every((c) => c.useCount === linkCount(bank, c)) &&
            Object.values(bank.getSF2Losses()).every((v) => v === 0),
        "resetDefaultModulators restores the list with its own curves"
    );
    bank.resetDefaultModulators();
    check(
        bank.customCurves.length === 2 && !throws(() => bank.writeSFe()),
        "resetting twice keeps two curves and the bank writes"
    );
    bank.destroySoundBank();
    check(
        bank.defaultModulators.length === 0 && bank.customCurves.length === 0,
        "destroySoundBank clears the default modulators and the curves"
    );
}

// A changed default list is written to DMOD with sends of 200, and the loss report sees what comes back
{
    const bank = makeBank(sineSample());
    bank.defaultModulators = bank.defaultModulators.filter(
        (m) => m.destination !== GeneratorTypes.variationEffectsSend
    );
    const file = new Uint8Array(bank.writeSF2());
    // The reverb record of DMOD: source 0x00DB, destination 16, amount 200 (0x00C8)
    const record = [0xdb, 0x00, 0x10, 0x00, 0xc8, 0x00];
    let found = false;
    for (let i = 0; i < file.length - record.length && !found; i++)
        found = record.every((v, k) => file[i + k] === v);
    check(found, "DMOD stores a full reverb send as 200");
    check(
        bank.getSF2Losses().addedModulators === 1,
        "the loss report counts the CC 94 default that an SF2 load adds back"
    );
    const lsb = makeBank(sineSample());
    lsb.presets[0].bankLSB = 5;
    check(
        lsb.getSF2Losses().bankNumbers === 1,
        "the loss report counts a preset with bank MSB 0 and an LSB"
    );
}

// A zone's variation send reaches the GS delay without CC 94
{
    const bank = makeBank(sineSample(), {
        [GeneratorTypes.sampleModes]: 1,
        [GeneratorTypes.variationEffectsSend]: 800
    });
    const dry = makeBank(sineSample(), { [GeneratorTypes.sampleModes]: 1 });
    const renderWet = async (b: BasicSoundBank) => {
        const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
            effectsEnabled: true,
            eventsEnabled: false
        });
        synth.soundBankManager.addSoundBank(b, "main");
        await synth.ready;
        synth.systemExclusive([
            0x41, 0x10, 0x42, 0x12, 0x40, 0x00, 0x7f, 0x00, 0x41, 0xf7
        ]);
        synth.controllerChange(0, MIDIControllers.reverbDepth, 0);
        const count = SAMPLE_RATE * 2;
        const left = new Float32Array(count);
        const right = new Float32Array(count);
        synth.noteOn(0, 69, 127);
        for (let i = 0; i < count; i += QUANTUM) {
            if (i === QUANTUM * 64) synth.noteOff(0, 69);
            synth.process(left, right, i, Math.min(QUANTUM, count - i));
        }
        return left;
    };
    const wet = await renderWet(bank);
    const plain = await renderWet(dry);
    // After the note ends only the delay repeats are left
    check(
        levelDb(wet, 1, 2) > levelDb(plain, 1, 2) + 20,
        `variationEffectsSend alone feeds the GS delay (${levelDb(wet, 1, 2).toFixed(1)} dB against ${levelDb(plain, 1, 2).toFixed(1)} dB)`
    );
}

// Round 3: DLS writing, a file send amount that only the remembered value can restore, CC 94 during a note
{
    const send = (amount: number) =>
        new Modulator(
            ModulatorSource.fromSourceEnum(0x00_db),
            new ModulatorSource(),
            GeneratorTypes.reverbEffectsSend,
            amount,
            0
        );
    const bank = makeBank(sineSample(), {}, (zone) => {
        zone.addModulators(send(350));
    });
    // DLS writing builds temporary zones from the bank's modulators
    let dls: ArrayBuffer | undefined;
    check(
        !throws(() => {
            dls = bank.writeDLS();
        }),
        "a bank with zone modulators writes as DLS"
    );
    const fromDLS = SoundBankLoader.fromArrayBuffer(dls!);
    check(
        fromDLS.presets.length === 1 && !throws(() => fromDLS.writeDLS()),
        "the DLS file loads and writes again"
    );
    check(
        bank.instruments[0].zones[0].modulators.length === 1 &&
            bank.customCurves.every((c) => c.useCount === linkCount(bank, c)),
        "DLS writing leaves the bank's modulators and links alone"
    );

    // The file stores 70. Patch it to 300, which also reads as 1000: the bank forgets the file amount, so it writes 200
    const file = new Uint8Array(bank.writeSF2());
    const record = [0xdb, 0x00, 0x10, 0x00, 70, 0x00];
    let at = -1;
    for (let i = 0; i < file.length - record.length && at < 0; i++)
        if (record.every((v, k) => file[i + k] === v)) at = i;
    file[at + 4] = 0x2c;
    file[at + 5] = 0x01;
    const loaded = SoundBankLoader.fromArrayBuffer(file.slice().buffer);
    const sendOf = (b: BasicSoundBank) =>
        b.instruments[0].zones[0].modulators.find(
            (m) => m.destination === GeneratorTypes.reverbEffectsSend
        )!;
    check(
        at > 0 && sendOf(loaded).transformAmount === 1000,
        "a file send amount of 300 reads as 1000"
    );
    const rewritten = new Uint8Array(loaded.writeSF2());
    check(
        rewritten.length === file.length &&
            rewritten[at + 4] === 200 &&
            rewritten[at + 5] === 0 &&
            rewritten.every(
                (v, i) => i === at + 4 || i === at + 5 || v === file[i]
            ),
        "and is written back as 200, the rest is the same"
    );
    check(
        Object.values(loaded.getSF2Losses()).every((v) => v === 0),
        "the loaded bank reports no SF2 changes"
    );
    // 502 rounds to 500
    sendOf(loaded).transformAmount = 502;
    check(
        loaded.getSF2Losses().sendAmounts === 1 &&
            sendOf(sf2RoundTrip(loaded)).transformAmount === 500,
        "the loss report counts a send amount that rounds (502 reads back as 500)"
    );
    // An unused curve does not survive SF2
    const unused = makeBank(sineSample(), {}, (zone, b) => {
        void zone;
        b.addCustomCurves(curve(16_384));
    });
    check(
        unused.getSF2Losses().customCurves === 1 &&
            sf2RoundTrip(unused).customCurves.length === 2,
        "the loss report counts an unused custom curve"
    );
}
{
    // CC 94 raised while a note sounds must reach its variation send
    const bank = makeBank(sineSample(), { [GeneratorTypes.sampleModes]: 1 });
    const tail = async (duringNote: boolean) => {
        const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
            effectsEnabled: true,
            eventsEnabled: false
        });
        synth.soundBankManager.addSoundBank(bank, "main");
        await synth.ready;
        synth.controllerChange(0, MIDIControllers.reverbDepth, 0);
        if (!duringNote)
            synth.controllerChange(0, MIDIControllers.variationDepth, 127);
        const count = SAMPLE_RATE * 2;
        const left = new Float32Array(count);
        const right = new Float32Array(count);
        synth.noteOn(0, 69, 127);
        for (let i = 0; i < count; i += QUANTUM) {
            if (duringNote && i === QUANTUM * 32)
                synth.controllerChange(0, MIDIControllers.variationDepth, 127);
            if (i === QUANTUM * 128) synth.noteOff(0, 69);
            synth.process(left, right, i, Math.min(QUANTUM, count - i));
        }
        return levelDb(left, 1, 2);
    };
    const before = await tail(false);
    const during = await tail(true);
    check(
        during > -90 && Math.abs(during - before) < 6,
        `CC 94 raised during a note feeds the delay (${during.toFixed(1)} dB, ${before.toFixed(1)} dB when set before the note)`
    );
}

// The GS delay runs from its first use until a reset: nothing cuts its tail, and a reset leaves no tail behind
{
    const bank = makeBank(sineSample(), {
        [GeneratorTypes.sampleModes]: 1,
        [GeneratorTypes.variationEffectsSend]: 800
    });
    type Step = (synth: SpessaSynthProcessor) => void;
    const renderSteps = async (steps: Record<number, Step>) => {
        const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
            effectsEnabled: true,
            eventsEnabled: false
        });
        synth.soundBankManager.addSoundBank(bank, "main");
        await synth.ready;
        synth.controllerChange(0, MIDIControllers.reverbDepth, 0);
        const count = SAMPLE_RATE * 3;
        const left = new Float32Array(count);
        const right = new Float32Array(count);
        for (let i = 0; i < count; i += QUANTUM) {
            steps[i / QUANTUM]?.(synth);
            synth.process(left, right, i, Math.min(QUANTUM, count - i));
        }
        return left;
    };
    const noteOn: Step = (s) => s.noteOn(0, 69, 127);
    const noteOff: Step = (s) => s.noteOff(0, 69);
    const plain = await renderSteps({ 0: noteOn, 64: noteOff });
    // CC 94 = 0 on another channel, after the note, used to stop the delay and freeze its tail
    const interrupted = await renderSteps({
        0: noteOn,
        64: noteOff,
        128: (s) => s.controllerChange(5, MIDIControllers.variationDepth, 0)
    });
    check(
        levelDb(plain, 1, 2) > -90 &&
            Math.abs(levelDb(interrupted, 1, 2) - levelDb(plain, 1, 2)) < 0.5,
        `a CC 94 message on another channel does not cut the delay tail (${levelDb(interrupted, 1, 2).toFixed(1)} dB against ${levelDb(plain, 1, 2).toFixed(1)} dB)`
    );
    // A reset stops the delay. A quiet note afterwards must not bring the old tail back
    const quiet: Step = (s) => {
        s.controllerChange(0, MIDIControllers.reverbDepth, 0);
        s.noteOn(0, 69, 1);
    };
    const quietOff: Step = (s) => s.noteOff(0, 69);
    const afterReset = await renderSteps({
        0: noteOn,
        64: noteOff,
        100: (s) => s.reset(),
        400: quiet,
        420: quietOff
    });
    const fresh = await renderSteps({
        100: (s) => s.reset(),
        400: quiet,
        420: quietOff
    });
    check(
        Math.abs(levelDb(afterReset, 1.5, 3) - levelDb(fresh, 1.5, 3)) < 0.5,
        `a reset leaves no delay tail for a later note (${levelDb(afterReset, 1.5, 3).toFixed(1)} dB against ${levelDb(fresh, 1.5, 3).toFixed(1)} dB)`
    );
}

console.info("Second review:");
{
    // A copy of a standard default modulator has its own curve and can be written
    const attack = SPESSASYNTH_DEFAULT_MODULATORS.find(
        (m) => m.destination === GeneratorTypes.attackVolEnv
    )!;
    const copy = Modulator.copyFrom(attack);
    const ownCurve = copy.primarySource.curve as CustomCurve;
    check(
        ownCurve !== attack.primarySource.curve &&
            ownCurve.isIdentical(attack.primarySource.curve),
        "a copy of a standard default modulator gets its own copy of the curve"
    );
    const bank = makeBank(sineSample(), {}, (zone) => zone.addModulators(copy));
    check(
        (attack.primarySource.curve as CustomCurve).useCount === 0,
        "the standard curve is not linked to the bank"
    );
    bank.addCustomCurves(ownCurve);
    const back = SoundBankLoader.fromArrayBuffer(bank.writeSFe());
    check(
        back.instruments[0].zones[0].modulators.some(
            (m) =>
                m.destination === GeneratorTypes.attackVolEnv &&
                m.primarySource.curve.isIdentical(ownCurve)
        ),
        "the copy is written to SFe and read back with its curve"
    );
    // The old way of making a default list
    const list = SPESSASYNTH_DEFAULT_MODULATORS.map((m) =>
        Modulator.copyFrom(m)
    );
    const other = new BasicSoundBank("sfe", false);
    other.defaultModulators = list;
    check(
        other.defaultModulators.length ===
            SPESSASYNTH_DEFAULT_MODULATORS.length &&
            SPESSASYNTH_DEFAULT_MODULATORS.every((m) =>
                [m.primarySource.curve, m.secondarySource.curve].every(
                    (c) => !(c instanceof CustomCurve) || c.useCount === 0
                )
            ),
        "copies of the whole standard list can be assigned without linking the standard curves"
    );
}
{
    // A zone CC 71 to Q stays as it is after SF2, no gain modulator is added any more (SFe 4.0, section 9.2)
    const cc71 = (amount: number) =>
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
    const bank = makeBank(sineSample());
    bank.presets[0].zones[0].addModulators(cc71(-100));
    const loaded = SoundBankLoader.fromArrayBuffer(bank.writeSF2());
    const presetMods = loaded.presets[0].zones[0].modulators;
    check(
        presetMods.length === 1 &&
            presetMods[0].destination === GeneratorTypes.initialFilterQ &&
            presetMods[0].transformAmount === -100,
        "a preset zone CC 71 to Q of -100 comes back alone, without a gain modulator"
    );
    const losses = loaded.getSF2Losses();
    check(
        losses.modulators === 0 && losses.addedModulators === 0,
        "the preset CC 71 to Q is not a loss"
    );
}

console.info("Final review:");
{
    // A DMOD modulator the SF2 reader ignores supersedes nothing, so the envelope time defaults still come back
    const bank = makeBank(sineSample());
    bank.defaultModulators = [
        new Modulator(
            new ModulatorSource(MIDIControllers.mainVolume, 0, true),
            new ModulatorSource(),
            GeneratorTypes.initialAttenuation,
            100,
            0
        ),
        new Modulator(
            new ModulatorSource(MIDIControllers.attackTime, 0, true),
            new ModulatorSource(),
            GeneratorTypes.attackVolEnv,
            100,
            0
        )
    ];
    const file = new Uint8Array(bank.writeSF2());
    // Point the CC 73 record (source 0x00C9, attackVolEnv) at an SFe generator, which SF2 does not have
    let patched = false;
    for (let i = 0; i < file.length - 10; i++) {
        if (
            file[i] === 0xc9 &&
            file[i + 1] === 0 &&
            file[i + 2] === GeneratorTypes.attackVolEnv &&
            file[i + 3] === 0 &&
            file[i + 4] === 100
        ) {
            file[i + 2] = GeneratorTypes.modEnv2ToPitch;
            patched = true;
        }
    }
    const loaded = SoundBankLoader.fromArrayBuffer(file.buffer);
    check(
        patched &&
            loaded.defaultModulators.filter(
                (m) =>
                    m.usesCustomCurve &&
                    m.destination !== GeneratorTypes.invalid
            ).length === 3,
        "an ignored CC 73 modulator in DMOD does not keep the envelope time defaults out"
    );
}

finish("review_fixes_test");
