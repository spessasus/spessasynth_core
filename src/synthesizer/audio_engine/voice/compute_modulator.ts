import {
    GeneratorLimits,
    GENERATORS_AMOUNT,
    type GeneratorType,
    GeneratorTypes
} from "../../../soundbank/basic_soundbank/generator_types";
import type { MIDIChannel } from "../channel/midi_channel";
import type { Voice } from "./voice";

/**
 * Buffer for the generators with the NRPN offsets applied,
 * To avoid allocating on the audio thread.
 */
const OFFSET_GENERATORS = new Int16Array(GENERATORS_AMOUNT);

/**
 * Buffer for the unclamped sums of the generators and their modulators.
 * Only the final sum saturates, so the order of the modulators never matters.
 * It is a float buffer so the fractions are only cut once. The single source path sums the float
 * modulator values too, so both paths give the same result.
 */
const GENERATOR_SUMS = new Float64Array(GENERATORS_AMOUNT);

/**
 * The final value of a generator after its modulators.
 * sampleModes is truncated toward zero and any value other than 0 to 4 means 0 (SFe 4.0, section 7.1).
 * @param generator The generator type.
 * @param sum The generator plus its modulators.
 */
function finalGeneratorValue(generator: GeneratorType, sum: number) {
    if (generator === GeneratorTypes.sampleModes) {
        const mode = Math.trunc(sum);
        return mode >= 0 && mode <= 4 ? mode : 0;
    }
    // InitialFilterFc is left unclamped since only the final cutoff is limited
    // (SFe 4.0, section 8.1.2)
    const limit =
        generator === GeneratorTypes.initialFilterFc
            ? undefined
            : GeneratorLimits[generator];
    return limit
        ? Math.min(limit.max, Math.max(limit.min, sum))
        : // Unused generator or initialFilterFc, only prevent the overflow
          Math.min(32_767, Math.max(-32_768, sum));
}

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
        this,
        pitchWheel,
        voice
    );
    const secondSrcValue = modulator.secondarySource.getValue(
        this,
        pitchWheel,
        voice
    );

    const transformAmount = modulator.transformAmount;

    // Compute the modulator
    let computedValue = sourceValue * secondSrcValue * transformAmount;

    if (modulator.transformType === 2) {
        // Abs value
        computedValue = Math.abs(computedValue);
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
    if (this.generators.offsetsEnabled) {
        const g = this.generators.offsets;
        OFFSET_GENERATORS.set(generators);
        generators = OFFSET_GENERATORS;
        for (let i = 0; i < generators.length; i++) {
            // An Int16Array wraps, so a negative offset would turn -32768 (instant) into a long time
            generators[i] = Math.min(
                32_767,
                Math.max(-32_768, generators[i] + g[i])
            );
        }
    }
    const modulatedGenerators = voice.modulatedGenerators;

    const pitch = this.perNotePitch
        ? this.pitchWheels[voice.midiNote]
        : this._midiParameters.pitchWheel;

    if (sourceUsesCC === -1) {
        // All modulators mode: compute all modulators
        // Sum without limits first, only the final sum saturates (SFe 4.0, section 7.1)
        GENERATOR_SUMS.set(generators);
        for (let i = 0; i < modulators.length; i++) {
            GENERATOR_SUMS[modulators[i].destination] += this.computeModulator(
                voice,
                pitch,
                i
            );
        }
        // Apply limits, an unused generator only saturates
        // Testcase: gm.dls polysynth
        for (let gen = 0; gen < modulatedGenerators.length; gen++) {
            modulatedGenerators[gen] = finalGeneratorValue(
                gen as GeneratorType,
                GENERATOR_SUMS[gen]
            );
        }
        return;
    }

    // Optimized mode: calculate only modulators that use the given source
    const sourceCC = !!sourceUsesCC;

    for (let i = 0; i < modulators.length; i++) {
        const mod = modulators[i];
        // If the modulator is influenced by the change
        if (!(
            (mod.primarySource.isCC === sourceCC &&
                mod.primarySource.index === sourceIndex) ||
            (mod.secondarySource.isCC === sourceCC &&
                mod.secondarySource.index === sourceIndex)
        )) {
            continue;
        }
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
        modulatedGenerators[destination] = finalGeneratorValue(
            destination,
            outputValue
        );
    }
}
