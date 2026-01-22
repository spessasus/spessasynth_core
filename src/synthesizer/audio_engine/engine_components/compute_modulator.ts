import { ModulationEnvelope } from "./dsp_chain/modulation_envelope";
import { Modulator } from "../../../soundbank/basic_soundbank/modulator";
import { generatorLimits, type GeneratorType } from "../../../soundbank/basic_soundbank/generator_types";
import type { MIDIChannel } from "./midi_channel";
import type { Voice } from "./voice";

/**
 * Compute_modulator.ts
 * purpose: precomputes all curve types and computes modulators
 */

const EFFECT_MODULATOR_TRANSFORM_MULTIPLIER = 1000 / 200;

/**
 * Computes a given modulator
 * @param controllerTable all midi controllers as 14bit values + the non-controller indexes, starting at 128
 * @param modulator the modulator to compute
 * @param voice the voice belonging to the modulator
 * @returns the computed value
 */
export function computeModulator(
    controllerTable: Int16Array,
    modulator: Modulator,
    voice: Voice
): number {
    if (modulator.transformAmount === 0) {
        modulator.currentValue = 0;
        return 0;
    }
    const sourceValue = modulator.primarySource.getValue(
        controllerTable,
        voice
    );
    const secondSrcValue = modulator.secondarySource.getValue(
        controllerTable,
        voice
    );

    // See the comment for isEffectModulator (modulator.ts in basic_soundbank) for explanation
    let transformAmount = modulator.transformAmount;
    if (modulator.isEffectModulator && transformAmount <= 1000) {
        transformAmount *= EFFECT_MODULATOR_TRANSFORM_MULTIPLIER;
        transformAmount = Math.min(transformAmount, 1000);
    }

    // Compute the modulator
    let computedValue = sourceValue * secondSrcValue * transformAmount;

    if (modulator.transformType === 2) {
        // Abs value
        computedValue = Math.abs(computedValue);
    }

    // Resonant modulator: take its value and ensure that it won't change the final gain
    if (modulator.isDefaultResonantModulator) {
        // Half the gain, negates the filter
        voice.resonanceOffset = Math.max(0, computedValue / 2);
    }

    modulator.currentValue = computedValue;
    return computedValue;
}

/**
 * Computes modulators of a given voice. Source and index indicate what modulators shall be computed.
 * @param voice the voice to compute modulators for.
 * @param sourceUsesCC what modulators should be computed, -1 means all, 0 means modulator source enum 1 means midi controller.
 * @param sourceIndex enum for the source.
 */
export function computeModulators(
    this: MIDIChannel,
    voice: Voice,
    sourceUsesCC: -1 | 0 | 1 = -1,
    sourceIndex = 0
) {
    const modulators = voice.modulators;
    let generators = voice.generators;
    // Apply offsets if enabled
    if (this.generatorOffsetsEnabled) {
        generators = new Int16Array(generators);
        for (let i = 0; i < generators.length; i++) {
            generators[i] += this.generatorOffsets[i];
        }
    }
    const modulatedGenerators = voice.modulatedGenerators;

    if (sourceUsesCC === -1) {
        // All modulators mode: compute all modulators
        modulatedGenerators.set(generators);
        for (const mod of modulators) {
            // Prevent -32k overflow
            // Testcase: gm.dls polysynth
            modulatedGenerators[mod.destination] = Math.min(
                32_767,
                Math.max(
                    -32_768,
                    modulatedGenerators[mod.destination] +
                        computeModulator(this.midiControllers, mod, voice)
                )
            );
        }
        // Apply limits
        for (let gen = 0; gen < modulatedGenerators.length; gen++) {
            const limit = generatorLimits[gen];
            if (!limit) {
                // Skip unused
                continue;
            }
            modulatedGenerators[gen] = Math.min(
                limit.max,
                Math.max(limit.min, modulatedGenerators[gen])
            );
        }
        ModulationEnvelope.recalculate(voice);
        return;
    }

    // Optimized mode: calculate only modulators that use the given source
    const computedDestinations = new Set<GeneratorType>();

    const sourceCC = !!sourceUsesCC;

    for (const mod of modulators) {
        if (
            (mod.primarySource.isCC === sourceCC &&
                mod.primarySource.index === sourceIndex) ||
            (mod.secondarySource.isCC === sourceCC &&
                mod.secondarySource.index === sourceIndex)
        ) {
            const destination = mod.destination;
            if (!computedDestinations.has(destination)) {
                // Reset this destination
                let outputValue = generators[destination];
                // Compute our modulator
                computeModulator(this.midiControllers, mod, voice);
                // Sum the values of all modulators for this destination
                for (const m of modulators) {
                    if (m.destination === destination) {
                        outputValue += m.currentValue;
                    }
                }
                // Apply the limits instantly to prevent -32k overflow
                // Testcase: gm.dls polysynth
                const limits = generatorLimits[destination];
                modulatedGenerators[destination] = Math.max(
                    limits.min,
                    Math.min(outputValue, limits.max)
                );
                computedDestinations.add(destination);
            }
        }
    }

    ModulationEnvelope.recalculate(voice);
}
