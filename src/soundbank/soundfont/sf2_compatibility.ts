import {
    copyDefaultModulators,
    DecodedModulator,
    DEFAULT_RESONANT_MOD_AMOUNT_SOURCE,
    DEFAULT_RESONANT_MOD_SOURCE,
    isIllegalSource,
    Modulator,
    SPESSASYNTH_DEFAULT_MODULATORS
} from "../basic_soundbank/modulator";
import { ModulatorSource } from "../basic_soundbank/modulator_source";
import { Generator } from "../basic_soundbank/generator";
import {
    type GeneratorType,
    GeneratorTypes,
    INSTRUMENT_ONLY_GENERATORS,
    PRE_VOICE_GENERATORS
} from "../basic_soundbank/generator_types";
import { CustomCurve } from "../basic_soundbank/custom_curve";
import {
    ModulatorControllerSources,
    ModulatorCurveTypes,
    ModulatorTransformTypes
} from "../enums";
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

// The initial attenuation of an SF2 file is 2.5 times the centibels of the bank (the EMU8000 factor of 0.4)
const SF2_ATTENUATION_SCALE = 0.4;

// The amount 0 twin of the default CC 71 to filterQOffset modulator, it turns that one off in a zone (SFe 4.0, section 9.2)
const resonanceTwin = () =>
    new DecodedModulator(
        DEFAULT_RESONANT_MOD_SOURCE,
        DEFAULT_RESONANT_MOD_AMOUNT_SOURCE,
        GeneratorTypes.filterQOffset,
        0,
        0
    );

// If an instrument zone of an SF2 file without DMOD gets the twin.
// It needs a CC 71 to initialFilterQ modulator with any SF2 curve. Ignored modulators don't count
function hasResonanceModulator(modulators: readonly Modulator[]) {
    return modulators.some(
        (m) =>
            !isIgnoredModulator(m) &&
            m.destination === GeneratorTypes.initialFilterQ &&
            m.primarySource.isController(MIDIControllers.filterResonance) &&
            m.primarySource.curveType <= ModulatorCurveTypes.switch &&
            m.secondarySource.curveType <= ModulatorCurveTypes.switch
    );
}

function isEnvelopeTime(s: ModulatorSource) {
    return (
        s.isController(MIDIControllers.attackTime) ||
        s.isController(MIDIControllers.decayTime) ||
        s.isController(MIDIControllers.releaseTime)
    );
}

/**
 * A plain CC 91 to reverb send or CC 93 to chorus send modulator (positive unipolar linear, no amount source,
 * linear transform). SF2 files store a fifth of its amount.
 */
function isSendModulator(m: Modulator) {
    if (m.transformType !== 0 || m.secondarySource.toSourceEnum() !== 0x0) {
        return false;
    }
    const source = m.primarySource.toSourceEnum();
    return (
        (source === 0x00_db &&
            m.destination === GeneratorTypes.reverbEffectsSend) ||
        (source === 0x00_dd &&
            m.destination === GeneratorTypes.chorusEffectsSend)
    );
}

// The amount of 50 cents in the default modulator is 1600, SF2 has 50
const SF2_DEPTH_SCALE = 32;

function isDepthRange(s: ModulatorSource) {
    return (
        !s.isCC && s.index === ModulatorControllerSources.modulationDepthRange
    );
}

// The pitch destinations of a mod wheel vibrato
function isVibratoDestination(m: Modulator) {
    return (
        m.destination === GeneratorTypes.modLfoToPitch ||
        m.destination === GeneratorTypes.vibLfoToPitch
    );
}

/**
 * Makes an SF2 mod wheel vibrato modulator follow RPN 5: the Modulation Depth Range becomes its amount source,
 * and its amount is multiplied by 32. Other modulators are left alone.
 * @param m The modulator, changed in place.
 * @internal
 */
export function followModulationDepth(m: Modulator) {
    // CC 1 as the source, no amount source and an amount that fits after scaling
    if (
        !m.primarySource.isController(MIDIControllers.modulationWheel) ||
        m.secondarySource.toSourceEnum() !== 0x0 ||
        !isVibratoDestination(m) ||
        m.transformAmount < -1023 ||
        m.transformAmount > 1023
    ) {
        return;
    }
    m.secondarySource.index = ModulatorControllerSources.modulationDepthRange;
    m.transformAmount *= SF2_DEPTH_SCALE;
}

/**
 * The modulator as a format without the Modulation Depth Range stores it (SF2 and DLS).
 * @param m The modulator.
 * @returns The same modulator if it does not use the range, a copy without the amount source and with a
 * 32 times smaller amount (limited to -1023 to 1023) if it is a mod wheel vibrato with a pitch destination,
 * and undefined if it can't be stored.
 * @internal
 */
export function withoutModulationDepth(m: Modulator) {
    if (isDepthRange(m.primarySource)) return undefined;
    if (!isDepthRange(m.secondarySource)) return m;
    // The amount source must be the plain range (0x0011), another form would change meaning without it
    if (
        !m.primarySource.isController(MIDIControllers.modulationWheel) ||
        !isVibratoDestination(m) ||
        m.secondarySource.toSourceEnum() !==
            ModulatorControllerSources.modulationDepthRange
    ) {
        return undefined;
    }
    const copy = Modulator.copyFrom(m);
    copy.secondarySource.index = ModulatorControllerSources.noController;
    copy.secondarySource.curveType = ModulatorCurveTypes.linear;
    copy.secondarySource.isBipolar = false;
    copy.secondarySource.isNegative = false;
    copy.transformAmount = Math.max(
        -1023,
        Math.min(1023, Math.round(m.transformAmount / SF2_DEPTH_SCALE))
    );
    return copy;
}

/**
 * If SF2 can store the generator. The generators above endOper are SFe only.
 * The sampleModes values outside 0 to 3 are written in another form, see {@link toSF2Generator}.
 * @param type The generator type.
 * @internal
 */
export function sf2KeepsGenerator(type: GeneratorType) {
    return type <= GeneratorTypes.endOper;
}

/**
 * If SF2 can store the modulator. Destinations above endOper and custom curves are SFe only,
 * and so is the Modulation Depth Range, except for the mod wheel vibrato that follows it.
 * Ignored modulators are not written either (SFe 4.0, section 9.1).
 * @param m The modulator.
 * @param preset If the modulator is in a preset zone.
 * @internal
 */
export function sf2KeepsModulator(m: Modulator, preset = false) {
    return (
        !isIgnoredModulator(m, preset) &&
        m.destination <= GeneratorTypes.endOper &&
        !m.usesCustomCurve &&
        withoutModulationDepth(m) !== undefined
    );
}

/**
 * The amount of a send modulator of the default form, read from an SF2 file: five times the file amount,
 * never above a full send and never below the SHORT range.
 * @param amount The amount in the file.
 */
function fromSF2SendAmount(amount: number) {
    return Math.max(-32_768, Math.min(1000, amount * SF2_SEND_SCALE));
}

// The amount a send modulator of the bank has in an SF2 file: a fifth of it, rounded
function toSF2SendAmount(amount: number) {
    return Math.round(amount / SF2_SEND_SCALE);
}

/**
 * The initial attenuation of an SF2 file in the unit of the bank, true centibels.
 * The EMU8000 attenuation is 0.4 of what the file says, so the factor lives here and not in the synthesizer.
 * @param value The generator value of the file.
 * @internal
 */
export function fromSF2Attenuation(value: number) {
    return Math.round(value * SF2_ATTENUATION_SCALE);
}

/**
 * The generator as an SF2 file stores it. The initial attenuation is the inverse of {@link fromSF2Attenuation}.
 * @param g The generator of the bank.
 * @returns The same generator, or a copy with the scaled value if it is the initial attenuation.
 * @internal
 */
export function toSF2Generator(g: Generator) {
    if (g.type === GeneratorTypes.initialAttenuation) {
        return new Generator(
            g.type,
            Math.max(
                -32_768,
                Math.min(32_767, Math.round(g.value / SF2_ATTENUATION_SCALE))
            ),
            false
        );
    }
    // SF2 reads only the two lowest bits of sampleModes. The alternating loop becomes a forward loop
    // And any other value outside 0 to 3 becomes 0, written so the zone does not inherit the global zone's value (SFe 4.0, section 9.1)
    if (g.type === GeneratorTypes.sampleModes && (g.value < 0 || g.value > 3)) {
        return new Generator(g.type, g.value === 4 ? 1 : 0, false);
    }
    return g;
}

/**
 * The modulators of a zone or of the default list as an SF2 file stores them.
 * @param modulators The modulators of the bank.
 * @param preset If they are the modulators of a preset zone.
 * @returns The modulators to write. Send modulators are scaled copies, the rest are the same objects.
 * @internal
 */
export function toSF2Modulators(
    modulators: readonly Modulator[],
    preset = false
) {
    const written = new Array<Modulator>();
    for (const m of modulators) {
        if (!sf2KeepsModulator(m, preset)) continue;
        // A mod wheel vibrato that follows RPN 5 is already a copy
        const plain = withoutModulationDepth(m) ?? m;
        const amount = isSendModulator(plain)
            ? toSF2SendAmount(plain.transformAmount)
            : plain.transformAmount;
        if (amount === plain.transformAmount) {
            written.push(plain);
        } else {
            const scaled = Modulator.copyFrom(plain);
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
    const unmatched = [...bank.defaultModulators];
    // One to one: every default is matched by exactly one modulator of the bank
    for (const d of SPESSASYNTH_DEFAULT_MODULATORS) {
        const index = unmatched.findIndex((m) =>
            Modulator.isIdentical(d, m, true)
        );
        if (index === -1) return true;
        unmatched.splice(index, 1);
    }
    return unmatched.length > 0;
}

/**
 * The `wBank` of a preset in an SF2 file: 128 for drums, else the bank MSB, or the bank LSB if the MSB is 0 (XG).
 * @param preset The preset.
 * @internal
 */
export function getSF2BankNumber(preset: BasicPreset) {
    if (preset.isGMGSDrum) return 0x80;
    // A bank number is 7 bits, so a larger one from the API is limited instead of turning into another preset
    return Math.max(
        0,
        Math.min(127, preset.bankMSB === 0 ? preset.bankLSB : preset.bankMSB)
    );
}

/**
 * The times 5 scaling of the send modulators of the default form, and the mod wheel vibrato following RPN 5.
 */
function fromSF2Modulators(modulators: readonly Modulator[]) {
    for (const m of modulators) {
        followModulationDepth(m);
        if (isSendModulator(m)) {
            m.transformAmount = fromSF2SendAmount(m.transformAmount);
        }
    }
}

/**
 * The default modulators the SF2 reader adds to a list read from DMOD,
 * since SF2 can't store them.
 */
function restoredDefaults(read: readonly Modulator[]) {
    // An empty list means no default modulators
    if (read.length === 0) return { modulators: [], curves: [] };
    const defaults = copyDefaultModulators();
    // A modulator that is ignored supersedes nothing (SFe 4.0, section 9.2)
    const valid = read.filter((m) => !isIgnoredModulator(m));
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
 * @internal
 */
export function fromSF2DefaultModulators(
    bank: BasicSoundBank,
    read: Modulator[]
) {
    fromSF2Modulators(read);
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
    preset = false
) {
    const written = modulators.filter((m) => sf2KeepsModulator(m, preset));
    return {
        lost: modulators.filter((m) => {
            // An ignored modulator is not written (SFe 4.0, section 9.1), it never applied, so it is not a loss
            if (isIgnoredModulator(m, preset)) return false;
            if (!sf2KeepsModulator(m, preset)) {
                return !restored.some((r) => Modulator.isIdentical(r, m, true));
            }
            // A mod wheel vibrato that reads back with another amount
            if (!isDepthRange(m.secondarySource)) return false;
            const read = Modulator.copyFrom(withoutModulationDepth(m) ?? m);
            followModulationDepth(read);
            return !Modulator.isIdentical(read, m, true);
        }),
        added: restored.filter(
            (r) => !modulators.some((m) => Modulator.isIdentical(r, m, true))
        ).length,
        changedSends: written.filter(
            (m) =>
                isSendModulator(m) &&
                fromSF2SendAmount(toSF2SendAmount(m.transformAmount)) !==
                    m.transformAmount
        ).length
    };
}

// Every generator a destination can be, the invalid one and endOper aside
const KNOWN_DESTINATIONS = new Set<number>(Object.values(GeneratorTypes));
KNOWN_DESTINATIONS.delete(GeneratorTypes.invalid);
KNOWN_DESTINATIONS.delete(GeneratorTypes.endOper);

// A modulator that SFe 4.0 ignores (section 7.4), the SF2 writer drops these (SFe 4.0, section 9.1).
// The reader gives most of them the invalid destination. The rest are an unknown transform or destination,
// A destination no modulator can change (or an instrument-only one in a preset zone),
// An unknown source type, or an illegal or reserved controller as a source
function isIgnoredModulator(m: Modulator, preset = false) {
    return (
        !KNOWN_DESTINATIONS.has(m.destination) ||
        PRE_VOICE_GENERATORS.has(m.destination) ||
        (preset && INSTRUMENT_ONLY_GENERATORS.has(m.destination)) ||
        (m.transformType !== ModulatorTransformTypes.linear &&
            m.transformType !== ModulatorTransformTypes.absolute) ||
        [m.primarySource, m.secondarySource].some(
            (s) =>
                s.curveType > ModulatorCurveTypes.custom || isIllegalSource(s)
        )
    );
}

/**
 * Counts what changes when the bank is written as SF2 and read back.
 * What the SF2 reader recreates as it was (the envelope time and variation send defaults)
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
    const writesDMOD = sf2NeedsDefaultModulators(bank);
    if (writesDMOD) {
        const defaults = bank.defaultModulators;
        const changes = roundTripChanges(
            defaults,
            // What the reader keeps
            restoredDefaults(defaults.filter((m) => sf2KeepsModulator(m)))
                .modulators
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
                if (g.type === GeneratorTypes.sampleModes) {
                    // 4 is written as a forward loop, other values outside 0 to 3 as 0
                    if (g.value === 4) losses.alternatingLoops++;
                    else if (g.value < 0 || g.value > 3) losses.generators++;
                } else if (!sf2KeepsGenerator(g.type)) losses.generators++;
            }
            // Without DMOD the reader gives an instrument zone with CC 71 to Q the resonance twin again
            const restored =
                !writesDMOD &&
                i >= presetCount &&
                hasResonanceModulator(
                    zone.modulators.filter((m) => sf2KeepsModulator(m))
                )
                    ? [resonanceTwin()]
                    : [];
            const changes = roundTripChanges(
                zone.modulators,
                restored,
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
        const read = p.isGMGSDrum ? 0 : getSF2BankNumber(p);
        return read !== p.bankMSB || p.bankLSB !== 0;
    }).length;
    return losses;
}

/**
 * Updates SF2 bank to SFe format as the spec describes.
 * The zone modulators to initialFilterQ stay as they are, they lower the level with the resonance as in SF2 (SFe 4.0, section 9.2).
 * @param bank The bank that was read.
 * @param hasDMOD If the file had a DMOD chunk. Its list has no CC 71 to filterQOffset, so the zones get no twin.
 * @internal
 */
export function upgradeSF2Bank(bank: BasicSoundBank, hasDMOD: boolean) {
    for (const element of [...bank.presets, ...bank.instruments]) {
        for (const zone of [element.globalZone, ...element.zones])
            fromSF2Modulators(zone.modulators);
    }
    if (hasDMOD) return;
    // Resonance (the last step): a zone with its own CC 71 to Q turns the default CC 71 to filterQOffset off.
    // That way the resonance is not doubled. Instrument zones only, a global zone covers its local zones
    for (const instrument of bank.instruments) {
        for (const zone of [instrument.globalZone, ...instrument.zones]) {
            if (hasResonanceModulator(zone.modulators))
                zone.addModulators(resonanceTwin());
        }
    }
}
