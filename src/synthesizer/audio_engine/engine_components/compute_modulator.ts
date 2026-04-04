import { generatorLimits } from "../../../soundbank/basic_soundbank/generator_types";
import type { MIDIChannel } from "./midi_channel";
import type { Voice } from "./voice";
import { modulatorSources } from "../../../soundbank/enums";
import { NON_CC_INDEX_OFFSET } from "./controller_tables";
import { customControllers } from "../../enums";

/**
 * Compute_modulator.ts
 * purpose: contains a function for computing all modulators
 */
const EFFECT_MODULATOR_TRANSFORM_MULTIPLIER = 1000 / 200;

/**
 * Computes a given modulator
 * @param voice the voice of this modulator.
 * @param pitchWheel the pitch wheel value, as channel determines if it's a per-note or a global value.
 * @param modulatorIndex the modulator to compute
 * @returns the computed value
 */
export function computeModulator(
    this: MIDIChannel,
    voice: Voice,
    pitchWheel: number,
    modulatorIndex: number
) {
    const modulator = voice.modulators[modulatorIndex];
    if (modulator.transformAmount === 0) {
        voice.modulatorValues[modulatorIndex] = 0;
        return 0;
    }
    const sourceValue = modulator.primarySource.getValue(
        this.midiControllers,
        pitchWheel,
        voice
    );
    const secondSrcValue = modulator.secondarySource.getValue(
        this.midiControllers,
        pitchWheel,
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

    // Modulation depth
    if (modulator.isModWheelModulator) {
        computedValue *=
            this.customControllers[customControllers.modulationMultiplier];
    }

    voice.modulatorValues[modulatorIndex] = computedValue;
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

    const pitch = this.perNotePitch
        ? this.pitchWheels[voice.realKey]
        : this.midiControllers[
              modulatorSources.pitchWheel + NON_CC_INDEX_OFFSET
          ];

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
                        this.computeModulator(voice, pitch, i)
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
            this.computeModulator(voice, pitch, i);

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
