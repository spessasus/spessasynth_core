import { Modulator } from "../modulator";
import { Generator } from "../generator";
import { generatorLimits, generatorTypes } from "../generator_types";
import { BasicInstrument } from "../basic_instrument";
import type { BasicPreset } from "../basic_preset";

import type { KeyRange } from "../../types";

/**
 * Combines preset into instrument zones.
 * This is a really complex function that attempts to work around the DLS limitations.
 * @param preset the preset to combine.
 * @returns the new instrument
 */
export function combineZones(preset: BasicPreset): BasicInstrument {
    const addUnique = (main: Generator[], adder: Generator[]) => {
        main.push(
            ...adder.filter(
                (g) => !main.find((mg) => mg.generatorType === g.generatorType)
            )
        );
    };

    const subtractRanges = (r1: KeyRange, r2: KeyRange): KeyRange => {
        return { min: Math.max(r1.min, r2.min), max: Math.min(r1.max, r2.max) };
    };

    const addUniqueMods = (main: Modulator[], adder: Modulator[]) => {
        main.push(
            ...adder.filter(
                (m) => !main.find((mm) => Modulator.isIdentical(m, mm))
            )
        );
    };

    const outputInstrument = new BasicInstrument();

    const globalPresetGenerators: Generator[] = [];
    const globalPresetModulators: Modulator[] = [];
    // Find the global zone and apply ranges, generators, and modulators
    const globalPresetZone = preset.globalZone;
    globalPresetGenerators.push(...globalPresetZone.generators);
    globalPresetModulators.push(...globalPresetZone.modulators);
    const globalPresetKeyRange = globalPresetZone.keyRange;
    const globalPresetVelRange = globalPresetZone.velRange;
    // For each non-global preset zone
    for (const presetZone of preset.zones) {
        if (!presetZone.instrument) {
            throw new Error("No instrument in a preset zone.");
        }
        // Use global ranges if not provided
        let presetZoneKeyRange = presetZone.keyRange;
        if (!presetZone.hasKeyRange) {
            presetZoneKeyRange = globalPresetKeyRange;
        }
        let presetZoneVelRange = presetZone.velRange;
        if (!presetZone.hasVelRange) {
            presetZoneVelRange = globalPresetVelRange;
        }
        // Add unique generators and modulators from the global zone
        const presetGenerators = presetZone.generators.map(
            (g) => new Generator(g.generatorType, g.generatorValue)
        );
        addUnique(presetGenerators, globalPresetGenerators);
        const presetModulators = [...presetZone.modulators];
        addUniqueMods(presetModulators, globalPresetModulators);
        const instrument = presetZone.instrument;
        const iZones = instrument.zones;

        const globalInstGenerators: Generator[] = [];
        const globalInstModulators: Modulator[] = [];
        const globalInstZone = instrument.globalZone;
        globalInstGenerators.push(...globalInstZone.generators);
        globalInstModulators.push(...globalInstZone.modulators);
        const globalInstKeyRange = globalInstZone.keyRange;
        const globalInstVelRange = globalInstZone.velRange;
        // For each non-global instrument zone
        for (const instZone of iZones) {
            if (!instZone.sample) {
                throw new Error("No sample in an instrument zone.");
            }
            // Use global ranges if not provided
            let instZoneKeyRange = instZone.keyRange;
            if (!instZone.hasKeyRange) {
                instZoneKeyRange = globalInstKeyRange;
            }
            let instZoneVelRange = instZone.velRange;
            if (!instZone.hasVelRange) {
                instZoneVelRange = globalInstVelRange;
            }
            instZoneKeyRange = subtractRanges(
                instZoneKeyRange,
                presetZoneKeyRange
            );
            instZoneVelRange = subtractRanges(
                instZoneVelRange,
                presetZoneVelRange
            );

            // If either of the zones is out of range (i.e.m min larger than the max),
            // Then we discard that zone
            if (
                instZoneKeyRange.max < instZoneKeyRange.min ||
                instZoneVelRange.max < instZoneVelRange.min
            ) {
                continue;
            }

            // Add unique generators and modulators from the global zone
            const instGenerators = instZone.generators.map(
                (g) => new Generator(g.generatorType, g.generatorValue)
            );
            addUnique(instGenerators, globalInstGenerators);
            const instModulators = [...instZone.modulators];
            addUniqueMods(instModulators, globalInstModulators);

            /**
             * Sum preset modulators to instruments (amount) sf spec page 54
             */
            const finalModList: Modulator[] = [...instModulators];
            for (const mod of presetModulators) {
                const identicalInstMod = finalModList.findIndex((m) =>
                    Modulator.isIdentical(mod, m)
                );
                if (identicalInstMod !== -1) {
                    // Sum the amounts
                    // (this makes a new modulator)
                    // Because otherwise it would overwrite the one in the soundfont!
                    finalModList[identicalInstMod] =
                        finalModList[identicalInstMod].sumTransform(mod);
                } else {
                    finalModList.push(mod);
                }
            }

            // Clone the generators as the values are modified during DLS conversion (keyNumToSomething)
            let finalGenList = instGenerators.map(
                (g) => new Generator(g.generatorType, g.generatorValue)
            );
            for (const gen of presetGenerators) {
                if (
                    gen.generatorType === generatorTypes.velRange ||
                    gen.generatorType === generatorTypes.keyRange ||
                    gen.generatorType === generatorTypes.instrument ||
                    gen.generatorType === generatorTypes.endOper ||
                    gen.generatorType === generatorTypes.sampleModes
                ) {
                    continue;
                }
                const identicalInstGen = instGenerators.findIndex(
                    (g) => g.generatorType === gen.generatorType
                );
                if (identicalInstGen !== -1) {
                    // If exists, sum to that generator
                    const newAmount =
                        finalGenList[identicalInstGen].generatorValue +
                        gen.generatorValue;
                    finalGenList[identicalInstGen] = new Generator(
                        gen.generatorType,
                        newAmount
                    );
                } else {
                    // If not, sum to the default generator
                    const newAmount =
                        generatorLimits[gen.generatorType].def +
                        gen.generatorValue;
                    finalGenList.push(
                        new Generator(gen.generatorType, newAmount)
                    );
                }
            }

            // Remove unwanted
            finalGenList = finalGenList.filter(
                (g) =>
                    g.generatorType !== generatorTypes.sampleID &&
                    g.generatorType !== generatorTypes.keyRange &&
                    g.generatorType !== generatorTypes.velRange &&
                    g.generatorType !== generatorTypes.endOper &&
                    g.generatorType !== generatorTypes.instrument &&
                    g.generatorValue !== generatorLimits[g.generatorType].def
            );

            // Create the zone and copy over values
            const zone = outputInstrument.createZone(instZone.sample);
            zone.keyRange = instZoneKeyRange;
            zone.velRange = instZoneVelRange;
            if (zone.keyRange.min === 0 && zone.keyRange.max === 127) {
                zone.keyRange.min = -1;
            }
            if (zone.velRange.min === 0 && zone.velRange.max === 127) {
                zone.velRange.min = -1;
            }
            zone.addGenerators(...finalGenList);
            zone.addModulators(...finalModList);
        }
    }
    return outputInstrument;
}
