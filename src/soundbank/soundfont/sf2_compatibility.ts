import {
    copyDefaultModulators,
    Modulator,
    SPESSASYNTH_DEFAULT_MODULATORS
} from "../basic_soundbank/modulator";
import type { ModulatorSource } from "../basic_soundbank/modulator_source";
import {
    type GeneratorType,
    GeneratorTypes
} from "../basic_soundbank/generator_types";
import {
    addResonanceCompensation,
    getResonantCompensators
} from "../basic_soundbank/resonance_compensation";
import { CustomCurve } from "../basic_soundbank/custom_curve";
import { ModulatorCurveTypes } from "../enums";
import { MIDIControllers } from "../../midi/enums";
import type { BasicSoundBank } from "../basic_soundbank/basic_soundbank";
import type { BasicPreset } from "../basic_soundbank/basic_preset";
import type { SF2Losses } from "../types";

/**
 * Sf2_compatibility.ts
 * purpose: everything that differs between a plain SoundFont 2 file and the bank model (which is SFe).
 * The binary reading and writing is shared with SFe, the rules are all here:
 * - what an SF2 file can't store (section 9 of the SFe specification), used by the writer and the loss report
 * - what a bank read from SF2 needs changed, used by the reader
 */

// The reverb and chorus sends of the SoundFont 2 default modulators: 200, where the bank model uses 1000
const SF2_SEND_SCALE = 5;

function isEnvelopeTime(s: ModulatorSource) {
    return (
        s.isController(MIDIControllers.attackTime) ||
        s.isController(MIDIControllers.decayTime) ||
        s.isController(MIDIControllers.releaseTime)
    );
}

/**
 * A plain CC 91 to reverb send or CC 93 to chorus send modulator (positive unipolar linear, no amount source).
 * SF2 files store a fifth of its amount.
 */
function isSendModulator(m: Modulator) {
    if (
        m.destination !== GeneratorTypes.reverbEffectsSend &&
        m.destination !== GeneratorTypes.chorusEffectsSend
    ) {
        return false;
    }
    const source = m.primarySource.toSourceEnum();
    return (
        (source === 0x00_db || source === 0x00_dd) &&
        m.secondarySource.toSourceEnum() === 0x0
    );
}

/**
 * If SF2 can store the generator. The generators above endOper and the alternating loop are SFe only.
 * @param type The generator type.
 * @param value The generator value.
 * @internal
 */
export function sf2KeepsGenerator(type: GeneratorType, value: number) {
    return (
        type <= GeneratorTypes.endOper &&
        !(type === GeneratorTypes.sampleModes && value === 4)
    );
}

/**
 * If SF2 can store the modulator. Destinations above endOper and custom curves are SFe only.
 * @param m The modulator.
 * @internal
 */
export function sf2KeepsModulator(m: Modulator) {
    return m.destination <= GeneratorTypes.endOper && !m.usesCustomCurve;
}

/**
 * The old SpessaSynth sf2 effect modulator scaling
 * @param amount
 */
function fromSF2SendAmount(amount: number) {
    return amount <= 1000 ? Math.min(1000, amount * SF2_SEND_SCALE) : amount;
}

// The amount a send modulator of the bank has in an SF2 file
function toSF2SendAmount(m: Modulator, defaults: boolean) {
    const amount = m.transformAmount;
    // Read from SF2 and not changed since: the amount of the file, so the same file is written
    if (
        m.sf2Amount !== undefined &&
        fromSF2SendAmount(m.sf2Amount) === amount
    ) {
        return m.sf2Amount;
    }
    // Otherwise the amount that reads back as this one.
    // A full send has two: the default list gets 200, the SoundFont 2 default it stands for.
    // A zone keeps 1000, which is a full send in every player
    if (defaults && amount === 1000) return 1000 / SF2_SEND_SCALE;
    return amount < 1000 ? Math.round(amount / SF2_SEND_SCALE) : amount;
}

/**
 * The modulators of a zone or of the default list as an SF2 file stores them.
 * @param modulators The modulators of the bank.
 * @param defaults If this is the default list (DMOD).
 * @returns The modulators to write. Send modulators are scaled copies, the rest are the same objects.
 * @internal
 */
export function toSF2Modulators(
    modulators: readonly Modulator[],
    defaults: boolean
) {
    const written = new Array<Modulator>();
    for (const m of modulators) {
        if (!sf2KeepsModulator(m)) continue;
        const amount = isSendModulator(m)
            ? toSF2SendAmount(m, defaults)
            : m.transformAmount;
        if (amount === m.transformAmount) {
            written.push(m);
        } else {
            const scaled = Modulator.copyFrom(m);
            scaled.transformAmount = amount;
            written.push(scaled);
        }
    }
    return written;
}

/**
 * If the DMOD chunk of an SF2 file is needed: SF2 does not write unchanged default modulators.
 * Removing a default modulator is a change too.
 * @param bank The bank to check.
 * @internal
 */
export function sf2NeedsDefaultModulators(bank: BasicSoundBank) {
    return (
        bank.defaultModulators.length !==
            SPESSASYNTH_DEFAULT_MODULATORS.length ||
        bank.defaultModulators.some(
            (mod) =>
                !SPESSASYNTH_DEFAULT_MODULATORS.some((m) =>
                    Modulator.isIdentical(m, mod, true)
                )
        )
    );
}

/**
 * The `wBank` of a preset in an SF2 file: 128 for drums, else the bank MSB, or the bank LSB if the MSB is 0 (XG).
 * @param preset The preset.
 * @internal
 */
export function getSF2BankNumber(preset: BasicPreset) {
    if (preset.isGMGSDrum) return 0x80;
    return preset.bankMSB === 0 ? preset.bankLSB : preset.bankMSB;
}

/**
 * The old times 5 effect send scaling SpessaSynth always did.
 */
function scaleSends(modulators: readonly Modulator[]) {
    for (const m of modulators) {
        if (isSendModulator(m)) {
            // Read only for everyone else, the reader is the one place that sets it on a finished modulator
            (m as { sf2Amount?: number }).sf2Amount = m.transformAmount;
            m.transformAmount = fromSF2SendAmount(m.transformAmount);
        }
    }
}

/**
 * The default modulators the SF2 reader adds to a list read from DMOD,
 * Since SF2 can't store them.
 */
function restoredDefaults(read: readonly Modulator[]) {
    // An empty list means no default modulators
    if (read.length === 0) return { modulators: [], curves: [] };
    const defaults = copyDefaultModulators();
    // A modulator the reader ignored supersedes nothing
    const valid = read.filter((m) => m.destination !== GeneratorTypes.invalid);
    // The envelope times come back unless the list has a CC 72, 73 or 75 modulator of its own (even with amount 0)
    const hasEnvelopeTime = valid.some(
        (m) =>
            isEnvelopeTime(m.primarySource) || isEnvelopeTime(m.secondarySource)
    );
    // The same for the variation send and CC 94
    const hasVariation = valid.some(
        (m) =>
            m.primarySource.isController(MIDIControllers.variationDepth) ||
            m.secondarySource.isController(MIDIControllers.variationDepth)
    );
    const modulators = defaults.modulators.filter((m) =>
        m.destination === GeneratorTypes.variationEffectsSend
            ? !hasVariation
            : !hasEnvelopeTime && isEnvelopeTime(m.primarySource)
    );
    const curves = defaults.curves.filter((c) =>
        modulators.some(
            (m) => m.primarySource.curve === c || m.secondarySource.curve === c
        )
    );
    return { modulators, curves };
}

/**
 * Turns the default modulators read from the DMOD chunk of an SF2 file into the list of the bank.
 * @param bank The bank being read, it receives the curves of the added modulators.
 * @param read The modulators of the chunk.
 * @returns The default modulators of the bank.
 * The resonance compensation is added later, by {@link upgradeSF2Bank}.
 * @internal
 */
export function fromSF2DefaultModulators(
    bank: BasicSoundBank,
    read: Modulator[]
) {
    scaleSends(read);
    const restored = restoredDefaults(read);
    bank.addCustomCurves(...restored.curves);
    return [...read, ...restored.modulators];
}

// What an SF2 round trip does to a list of modulators.
// Lost: the ones SF2 can't store and the reader does not bring back.
// Added: the ones the reader adds that the list does not have.
// Changed sends: the send modulators whose amount reads back differently (the file stores a fifth, rounded).
function roundTripChanges(
    modulators: readonly Modulator[],
    restored: readonly Modulator[],
    defaults: boolean,
    preset = false
) {
    const written = modulators.filter((m) => sf2KeepsModulator(m));
    const back = [...restored, ...getResonantCompensators(written, preset)];
    return {
        lost: modulators.filter(
            (m) =>
                // A source type no reader knows is written, and ignored when read
                hasUnknownSourceType(m) ||
                (!sf2KeepsModulator(m) &&
                    !back.some((r) => Modulator.isIdentical(r, m, true)))
        ),
        added: back.filter(
            (r) => !modulators.some((m) => Modulator.isIdentical(r, m, true))
        ).length,
        changedSends: written.filter(
            (m) =>
                isSendModulator(m) &&
                fromSF2SendAmount(toSF2SendAmount(m, defaults)) !==
                    m.transformAmount
        ).length
    };
}

function hasUnknownSourceType(m: Modulator) {
    return [m.primarySource, m.secondarySource].some(
        (s) => s.curveType > ModulatorCurveTypes.custom
    );
}

/**
 * Counts what changes when the bank is written as SF2 and read back.
 * What the SF2 reader recreates as it was (the resonance compensation, the envelope time and variation send defaults)
 * is not counted.
 * @param bank The bank to check.
 * @internal
 */
export function getSF2LossesInternal(bank: BasicSoundBank) {
    const losses: SF2Losses = {
        generators: 0,
        alternatingLoops: 0,
        modulators: 0,
        defaultModulators: 0,
        customCurves: 0,
        addedModulators: 0,
        sendAmounts: 0,
        bankNumbers: 0
    };
    const lost = new Array<Modulator>();
    if (sf2NeedsDefaultModulators(bank)) {
        const defaults = bank.defaultModulators;
        const changes = roundTripChanges(
            defaults,
            // What the reader keeps: an unknown source type is written, and ignored when read
            restoredDefaults(
                defaults.filter(
                    (m) => sf2KeepsModulator(m) && !hasUnknownSourceType(m)
                )
            ).modulators,
            true
        );
        losses.defaultModulators = changes.lost.length;
        losses.addedModulators += changes.added;
        losses.sendAmounts += changes.changedSends;
        lost.push(...changes.lost);
    }
    const presetCount = bank.presets.length;
    for (const [i, element] of [
        ...bank.presets,
        ...bank.instruments
    ].entries()) {
        for (const zone of [element.globalZone, ...element.zones]) {
            for (const g of zone.generators) {
                if (g.type === GeneratorTypes.sampleModes && g.value === 4)
                    losses.alternatingLoops++;
                else if (!sf2KeepsGenerator(g.type, g.value))
                    losses.generators++;
            }
            const changes = roundTripChanges(
                zone.modulators,
                [],
                false,
                i < presetCount
            );
            losses.modulators += changes.lost.length;
            losses.addedModulators += changes.added;
            losses.sendAmounts += changes.changedSends;
            lost.push(...changes.lost);
        }
    }
    // SF2 stores no curves. The only ones that come back are those of the default modulators the reader restores
    const lostSet = new Set(lost);
    const kept = new Set<CustomCurve>();
    for (const m of bank.defaultModulators) {
        if (lostSet.has(m)) continue;
        for (const curve of [m.primarySource.curve, m.secondarySource.curve])
            if (curve instanceof CustomCurve) kept.add(curve);
    }
    losses.customCurves = bank.customCurves.filter(
        (curve) => !kept.has(curve)
    ).length;
    // An SF2 file stores one bank number, which reads back as the bank MSB
    losses.bankNumbers = bank.presets.filter((p) => {
        const read = p.isGMGSDrum ? 0 : getSF2BankNumber(p) & 0x7f;
        return read !== p.bankMSB || p.bankLSB !== 0;
    }).length;
    return losses;
}

/**
 * Updates SF2 bank to SFe format as the spec describes.
 * @param bank The bank that was read.
 * @internal
 */
export function upgradeSF2Bank(bank: BasicSoundBank) {
    for (const element of [...bank.presets, ...bank.instruments]) {
        for (const zone of [element.globalZone, ...element.zones])
            scaleSends(zone.modulators);
    }
    // Banks from before gain get the CC 71 compensation as modulators
    addResonanceCompensation(bank);
}
