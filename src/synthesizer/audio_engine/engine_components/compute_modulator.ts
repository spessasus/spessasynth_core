import { generatorLimits } from "../../../soundbank/basic_soundbank/generator_types";
import type { MIDIChannel } from "./midi_channel";
import type { Voice } from "./voice"; /**
 * Compute_modulator.ts
 * purpose: contains a function for computing all modulators
 */

/**
 * Compute_modulator.ts
 * purpose: contains a function for computing all modulators
 */

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
        for (let i = 0; i < modulators.length; i++) {
            const mod = modulators[i];
            // Prevent -32k overflow
            // Testcase: gm.dls polysynth
            modulatedGenerators[mod.destination] = Math.min(
                32_767,
                Math.max(
                    -32_768,
                    modulatedGenerators[mod.destination] +
                        voice.computeModulator(this.midiControllers, i)
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
        return;
    }

    // Optimized mode: calculate only modulators that use the given source
    const sourceCC = !!sourceUsesCC;

    for (let i = 0; i < modulators.length; i++) {
        const mod = modulators[i];
        // If the modulator is influenced by the change
        if (
            (mod.primarySource.isCC === sourceCC &&
                mod.primarySource.index === sourceIndex) ||
            (mod.secondarySource.isCC === sourceCC &&
                mod.secondarySource.index === sourceIndex)
        ) {
            const destination = mod.destination;
            let outputValue = generators[destination];
            // Compute our modulator
            voice.computeModulator(this.midiControllers, i);

            // Sum the values of all modulators for this destination
            for (let j = 0; j < modulators.length; j++) {
                if (modulators[j].destination === destination) {
                    outputValue += voice.modulatorValues[j];
                }
            }
            // Apply the limits instantly to prevent -32k overflow
            // Testcase: gm.dls polysynth
            const limits = generatorLimits[destination];
            modulatedGenerators[destination] = Math.max(
                limits.min,
                Math.min(outputValue, limits.max)
            );
        }
    }
}
