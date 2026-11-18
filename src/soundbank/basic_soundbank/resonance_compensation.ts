import {
    DEFAULT_RESONANT_MOD_SOURCE,
    Modulator,
    RESONANT_COMPENSATOR_AMOUNT_SOURCE
} from "./modulator";
import { ModulatorSource } from "./modulator_source";
import { GeneratorTypes } from "./generator_types";
import { MIDIControllers } from "../../midi/enums";
import type { BasicSoundBank } from "./basic_soundbank";

/**
 * Banks made before the `gain` generator relied on the engine keeping CC 71 from changing the level.
 * Gives every CC 71 to resonance modulator (in the default modulators and in every zone) a CC 71 to gain twin at half
 * its amount, unless the list already has a CC 71 to gain modulator. SF2 and DLS drop gain modulators when written,
 * so a round trip gives the same file.
 *
 *
 * The old SpessaSynth "resonant modulator" behavior, now with standard SFe!
 *
 * @param bank The bank to update, an SF2 or DLS bank, or an SFe bank from before version 4.
 * @internal
 */
export function addResonanceCompensation(bank: BasicSoundBank) {
    bank.defaultModulators = [
        ...bank.defaultModulators,
        ...getResonantCompensators(bank.defaultModulators)
    ];
    for (const instrument of bank.instruments) {
        for (const zone of [instrument.globalZone, ...instrument.zones])
            zone.addModulators(...getResonantCompensators(zone.modulators));
    }
    // Preset modulators add to the instrument's ones, and so do their twins
    for (const preset of bank.presets) {
        for (const zone of [preset.globalZone, ...preset.zones])
            zone.addModulators(
                ...getResonantCompensators(zone.modulators, true)
            );
    }
}

/**
 * The compensators a list needs, to be added at its end.
 * @param modulators The list.
 * @param additive If the list is of a preset zone, where the amounts add to the instrument's ones.
 * @internal
 */
export function getResonantCompensators(
    modulators: readonly Modulator[],
    additive = false
) {
    const added = new Array<Modulator>();
    if (
        modulators.some(
            (m) =>
                m.destination === GeneratorTypes.gain &&
                m.primarySource.isController(MIDIControllers.filterResonance)
        )
    ) {
        return added;
    }
    for (const m of modulators) {
        if (
            m.destination !== GeneratorTypes.initialFilterQ ||
            m.primarySource.toSourceEnum() !== DEFAULT_RESONANT_MOD_SOURCE ||
            m.secondarySource.toSourceEnum() !== 0
        ) {
            continue;
        }
        const amount = m.transformAmount;
        if (additive) {
            // Moves the twin of the instrument along with its modulator
            // Exact as long as the summed resonance amount stays positive
            if (amount !== 0)
                added.push(
                    getResonantCompensator(Math.round(amount / 2), false)
                );
            continue;
        }
        // Above 64 (overrides the default compensator, even with 0)
        // Rounded, since the amount is written as a whole number
        added.push(
            getResonantCompensator(Math.round(Math.max(0, amount) / 2), false)
        );
        // A negative amount raises the resonance below 64
        if (amount < 0)
            added.push(getResonantCompensator(Math.round(amount / 2), true));
    }
    return added;
}

function getResonantCompensator(amount: number, below64: boolean) {
    const switchSource = ModulatorSource.fromSourceEnum(
        RESONANT_COMPENSATOR_AMOUNT_SOURCE
    );
    switchSource.isNegative = below64;
    return new Modulator(
        ModulatorSource.fromSourceEnum(DEFAULT_RESONANT_MOD_SOURCE),
        switchSource,
        GeneratorTypes.gain,
        amount,
        0
    );
}
