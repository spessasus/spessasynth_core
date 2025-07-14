import { getModulatorCurveValue, MOD_PRECOMPUTED_LENGTH } from "./modulator_curves.js";
import { VolumeEnvelope } from "./volume_envelope.js";
import { ModulationEnvelope } from "./modulation_envelope.js";
import { Modulator, modulatorSources } from "../../../soundfont/basic_soundfont/modulator.js";
import { NON_CC_INDEX_OFFSET } from "./controller_tables.js";
import { generatorLimits, generatorTypes } from "../../../soundfont/basic_soundfont/generator_types.js";

/**
 * compute_modulator.js
 * purpose: precomputes all curve types and computes modulators
 */

const EFFECT_MODULATOR_TRANSFORM_MULTIPLIER = 1000 / 200;

/**
 * Computes a given modulator
 * @param controllerTable {Int16Array} all midi controllers as 14bit values + the non-controller indexes, starting at 128
 * @param modulator {Modulator} the modulator to compute
 * @param voice {Voice} the voice belonging to the modulator
 * @returns {number} the computed value
 */
export function computeModulator(controllerTable, modulator, voice)
{
    if (modulator.transformAmount === 0)
    {
        modulator.currentValue = 0;
        return 0;
    }
    // mapped to 0-16,384
    let rawSourceValue;
    if (modulator.sourceUsesCC)
    {
        rawSourceValue = controllerTable[modulator.sourceIndex];
    }
    else
    {
        const index = modulator.sourceIndex + NON_CC_INDEX_OFFSET;
        switch (modulator.sourceIndex)
        {
            case modulatorSources.noController:
                rawSourceValue = 16383; // equals to 1
                break;
            
            case modulatorSources.noteOnKeyNum:
                rawSourceValue = voice.midiNote << 7;
                break;
            
            case modulatorSources.noteOnVelocity:
                rawSourceValue = voice.velocity << 7;
                break;
            
            case modulatorSources.polyPressure:
                rawSourceValue = voice.pressure << 7;
                break;
            
            default:
                rawSourceValue = controllerTable[index]; // pitch bend and range are stored in the cc table
                break;
        }
        
    }
    
    const sourceValue = transforms[modulator.sourceCurveType][modulator.sourcePolarity][modulator.sourceDirection][rawSourceValue];
    
    // mapped to 0-127
    let rawSecondSrcValue;
    if (modulator.secSrcUsesCC)
    {
        rawSecondSrcValue = controllerTable[modulator.secSrcIndex];
    }
    else
    {
        const index = modulator.secSrcIndex + NON_CC_INDEX_OFFSET;
        switch (modulator.secSrcIndex)
        {
            case modulatorSources.noController:
                rawSecondSrcValue = 16383; // equals to 1
                break;
            
            case modulatorSources.noteOnKeyNum:
                rawSecondSrcValue = voice.midiNote << 7;
                break;
            
            case modulatorSources.noteOnVelocity:
                rawSecondSrcValue = voice.velocity << 7;
                break;
            
            case modulatorSources.polyPressure:
                rawSecondSrcValue = voice.pressure << 7;
                break;
            
            default:
                rawSecondSrcValue = controllerTable[index]; // pitch bend and range are stored in the cc table
        }
        
    }
    const secondSrcValue = transforms[modulator.secSrcCurveType][modulator.secSrcPolarity][modulator.secSrcDirection][rawSecondSrcValue];
    
    // see the comment for isEffectModulator (modulator.js in basic_soundfont) for explanation
    let transformAmount = modulator.transformAmount;
    if (modulator.isEffectModulator && transformAmount <= 1000)
    {
        transformAmount *= EFFECT_MODULATOR_TRANSFORM_MULTIPLIER;
        transformAmount = Math.min(transformAmount, 1000);
    }
    
    // compute the modulator
    let computedValue = sourceValue * secondSrcValue * transformAmount;
    
    if (modulator.transformType === 2)
    {
        // abs value
        computedValue = Math.abs(computedValue);
    }
    
    // resonant modulator: take its value and ensure that it won't change the final gain
    if (modulator.isDefaultResonantModulator)
    {
        // half the gain, negates the filter
        voice.resonanceOffset = Math.max(0, computedValue / 2);
    }
    
    modulator.currentValue = computedValue;
    return computedValue;
}

/**
 * Computes modulators of a given voice. Source and index indicate what modulators shall be computed
 * @param voice {Voice} the voice to compute modulators for
 * @param sourceUsesCC {number} what modulators should be computed, -1 means all, 0 means modulator source enum 1 means midi controller
 * @param sourceIndex {number} enum for the source
 * @this {MidiAudioChannel}
 */
export function computeModulators(voice, sourceUsesCC = -1, sourceIndex = 0)
{
    const modulators = voice.modulators;
    let generators = voice.generators;
    // apply offsets if enabled
    if (this.generatorOffsetsEnabled)
    {
        generators = new Int16Array(generators);
        for (let i = 0; i < generators.length; i++)
        {
            generators[i] += this.generatorOffsets[i];
        }
    }
    const modulatedGenerators = voice.modulatedGenerators;
    
    if (sourceUsesCC === -1)
    {
        // All modulators mode: compute all modulators
        modulatedGenerators.set(generators);
        modulators.forEach(mod =>
        {
            modulatedGenerators[mod.modulatorDestination] += computeModulator(
                this.midiControllers,
                mod,
                voice
            );
        });
        // apply limits
        for (let gen = 0; gen < modulatedGenerators.length; gen++)
        {
            const limit = generatorLimits[gen];
            if (!limit)
            {
                // skip unused
                continue;
            }
            modulatedGenerators[gen] = Math.min(limit.max, Math.max(limit.min, modulatedGenerators[gen]));
        }
        VolumeEnvelope.recalculate(voice);
        ModulationEnvelope.recalculate(voice);
        return;
    }
    
    // Optimized mode: calculate only modulators that use the given source
    const volenvNeedsRecalculation = new Set([
        generatorTypes.initialAttenuation,
        generatorTypes.delayVolEnv,
        generatorTypes.attackVolEnv,
        generatorTypes.holdVolEnv,
        generatorTypes.decayVolEnv,
        generatorTypes.sustainVolEnv,
        generatorTypes.releaseVolEnv,
        generatorTypes.keyNumToVolEnvHold,
        generatorTypes.keyNumToVolEnvDecay
    ]);
    
    const computedDestinations = new Set();
    
    modulators.forEach(mod =>
    {
        if (
            (mod.sourceUsesCC === sourceUsesCC && mod.sourceIndex === sourceIndex) ||
            (mod.secSrcUsesCC === sourceUsesCC && mod.secSrcIndex === sourceIndex)
        )
        {
            const destination = mod.modulatorDestination;
            if (!computedDestinations.has(destination))
            {
                // Reset this destination
                modulatedGenerators[destination] = generators[destination];
                // compute our modulator
                computeModulator(this.midiControllers, mod, voice);
                // sum the values of all modulators for this destination
                modulators.forEach(m =>
                {
                    if (m.modulatorDestination === destination)
                    {
                        modulatedGenerators[destination] += m.currentValue;
                    }
                });
                // apply limits
                const limits = generatorLimits[destination];
                modulatedGenerators[destination] = Math.max(
                    limits.min,
                    Math.min(modulatedGenerators[destination], limits.max)
                );
                computedDestinations.add(destination);
            }
        }
    });
    
    // Recalculate volume envelope if necessary
    if ([...computedDestinations].some(dest => volenvNeedsRecalculation.has(dest)))
    {
        VolumeEnvelope.recalculate(voice);
    }
    
    ModulationEnvelope.recalculate(voice);
}


/**
 * as follows: transforms[curveType][polarity][direction] is an array
 * @type {Float32Array[][][]}
 */
const transforms = [];

for (let curve = 0; curve < 4; curve++)
{
    transforms[curve] =
        [
            [
                new Float32Array(MOD_PRECOMPUTED_LENGTH),
                new Float32Array(MOD_PRECOMPUTED_LENGTH)
            ],
            [
                new Float32Array(MOD_PRECOMPUTED_LENGTH),
                new Float32Array(MOD_PRECOMPUTED_LENGTH)
            ]
        ];
    for (let i = 0; i < MOD_PRECOMPUTED_LENGTH; i++)
    {
        
        // polarity 0 dir 0
        transforms[curve][0][0][i] = getModulatorCurveValue(
            0,
            curve,
            i / MOD_PRECOMPUTED_LENGTH,
            0
        );
        
        // polarity 1 dir 0
        transforms[curve][1][0][i] = getModulatorCurveValue(
            0,
            curve,
            i / MOD_PRECOMPUTED_LENGTH,
            1
        );
        
        // polarity 0 dir 1
        transforms[curve][0][1][i] = getModulatorCurveValue(
            1,
            curve,
            i / MOD_PRECOMPUTED_LENGTH,
            0
        );
        
        // polarity 1 dir 1
        transforms[curve][1][1][i] = getModulatorCurveValue(
            1,
            curve,
            i / MOD_PRECOMPUTED_LENGTH,
            1
        );
    }
}