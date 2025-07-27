import { Modulator } from "../modulator";
import { Generator } from "../generator";
import {
    generatorLimits,
    type GeneratorType,
    generatorTypes
} from "../generator_types";
import { BasicInstrument } from "../basic_instrument";
import type { BasicPreset } from "../basic_preset";

import type { KeyRange } from "../../types";

const notGlobalizedTypes = new Set([
    generatorTypes.velRange,
    generatorTypes.keyRange,
    generatorTypes.instrument,
    generatorTypes.exclusiveClass,
    generatorTypes.endOper,
    generatorTypes.sampleModes,
    generatorTypes.startloopAddrsOffset,
    generatorTypes.startloopAddrsCoarseOffset,
    generatorTypes.endloopAddrsOffset,
    generatorTypes.endloopAddrsCoarseOffset,
    generatorTypes.startAddrsOffset,
    generatorTypes.startAddrsCoarseOffset,
    generatorTypes.endAddrOffset,
    generatorTypes.endAddrsCoarseOffset,
    generatorTypes.initialAttenuation, // written into wsmp, there's no global wsmp
    generatorTypes.fineTune, // written into wsmp, there's no global wsmp
    generatorTypes.coarseTune, // written into wsmp, there's no global wsmp
    generatorTypes.keyNumToVolEnvHold, // KEY TO SOMETHING:
    generatorTypes.keyNumToVolEnvDecay, // cannot be globalized as they modify their respective generators
    generatorTypes.keyNumToModEnvHold, // (for example, keyNumToVolEnvDecay modifies VolEnvDecay)
    generatorTypes.keyNumToModEnvDecay
] as const);
type notGlobalizedTypes =
    typeof notGlobalizedTypes extends Set<infer T> ? T : never;

/**
 * Combines preset into instrument zones.
 * This is a really complex function that attempts to work around the DLS limitations.
 * @param preset the preset to combine.
 * @param globalize if the most used generators should be made global to save on generator count.
 * @returns the new instrument
 */
export function combineZones(
    preset: BasicPreset,
    globalize: boolean = true
): BasicInstrument {
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
    // find the global zone and apply ranges, generators, and modulators
    const globalPresetZone = preset.globalZone;
    globalPresetGenerators.push(...globalPresetZone.generators);
    globalPresetModulators.push(...globalPresetZone.modulators);
    const globalPresetKeyRange = globalPresetZone.keyRange;
    const globalPresetVelRange = globalPresetZone.velRange;
    // for each non-global preset zone
    for (const presetZone of preset.zones) {
        if (!presetZone.instrument) {
            throw new Error("No instrument in a preset zone.");
        }
        // use global ranges if not provided
        let presetZoneKeyRange = presetZone.keyRange;
        if (!presetZone.hasKeyRange) {
            presetZoneKeyRange = globalPresetKeyRange;
        }
        let presetZoneVelRange = presetZone.velRange;
        if (!presetZone.hasVelRange) {
            presetZoneVelRange = globalPresetVelRange;
        }
        // add unique generators and modulators from the global zone
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
        // for each non-global instrument zone
        for (const instZone of iZones) {
            if (!instZone.sample) {
                throw new Error("No sample in an instrument zone.");
            }
            // use global ranges if not provided
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

            // if either of the zones is out of range (i.e.m min larger than the max),
            // then we discard that zone
            if (
                instZoneKeyRange.max < instZoneKeyRange.min ||
                instZoneVelRange.max < instZoneVelRange.min
            ) {
                continue;
            }

            // add unique generators and modulators from the global zone
            const instGenerators = instZone.generators.map(
                (g) => new Generator(g.generatorType, g.generatorValue)
            );
            addUnique(instGenerators, globalInstGenerators);
            const instModulators = [...instZone.modulators];
            addUniqueMods(instModulators, globalInstModulators);

            /**
             * sum preset modulators to instruments (amount) sf spec page 54
             */
            const finalModList: Modulator[] = [...instModulators];
            for (const mod of presetModulators) {
                const identicalInstMod = finalModList.findIndex((m) =>
                    Modulator.isIdentical(mod, m)
                );
                if (identicalInstMod !== -1) {
                    // sum the amounts
                    // (this makes a new modulator)
                    // because otherwise it would overwrite the one in the soundfont!
                    finalModList[identicalInstMod] =
                        finalModList[identicalInstMod].sumTransform(mod);
                } else {
                    finalModList.push(mod);
                }
            }

            // clone the generators as the values are modified during DLS conversion (keyNumToSomething)
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
                    // if exists, sum to that generator
                    const newAmount =
                        finalGenList[identicalInstGen].generatorValue +
                        gen.generatorValue;
                    finalGenList[identicalInstGen] = new Generator(
                        gen.generatorType,
                        newAmount
                    );
                } else {
                    // if not, sum to the default generator
                    const newAmount =
                        generatorLimits[gen.generatorType].def +
                        gen.generatorValue;
                    finalGenList.push(
                        new Generator(gen.generatorType, newAmount)
                    );
                }
            }

            // remove unwanted
            finalGenList = finalGenList.filter(
                (g) =>
                    g.generatorType !== generatorTypes.sampleID &&
                    g.generatorType !== generatorTypes.keyRange &&
                    g.generatorType !== generatorTypes.velRange &&
                    g.generatorType !== generatorTypes.endOper &&
                    g.generatorType !== generatorTypes.instrument &&
                    g.generatorValue !== generatorLimits[g.generatorType].def
            );

            // create the zone and copy over values
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
    const globalZone = outputInstrument.globalZone;
    if (globalize) {
        // create a global zone and add repeating generators to it
        // also modulators
        // iterate over every type of generator
        for (let checkedType = 0; checkedType < 58; checkedType++) {
            // not these though
            if (notGlobalizedTypes.has(checkedType as notGlobalizedTypes)) {
                continue;
            }
            let occurrencesForValues: Record<number, number> = {};
            const defaultForChecked = generatorLimits[checkedType]?.def || 0;
            occurrencesForValues[defaultForChecked] = 0;
            for (const z of outputInstrument.zones) {
                const gen = z.generators.find(
                    (g) => g.generatorType === checkedType
                );
                if (gen) {
                    const value = gen.generatorValue;
                    if (occurrencesForValues[value] === undefined) {
                        occurrencesForValues[value] = 1;
                    } else {
                        occurrencesForValues[value]++;
                    }
                } else {
                    occurrencesForValues[defaultForChecked]++;
                }

                // if the checked type has the keyNumTo something generator set, it cannot be globalized.
                let relativeCounterpart;
                switch (checkedType) {
                    default:
                        continue;

                    case generatorTypes.decayVolEnv:
                        relativeCounterpart =
                            generatorTypes.keyNumToVolEnvDecay;
                        break;
                    case generatorTypes.holdVolEnv:
                        relativeCounterpart = generatorTypes.keyNumToVolEnvHold;
                        break;
                    case generatorTypes.decayModEnv:
                        relativeCounterpart =
                            generatorTypes.keyNumToModEnvDecay;
                        break;
                    case generatorTypes.holdModEnv:
                        relativeCounterpart = generatorTypes.keyNumToModEnvHold;
                }
                const relative = z.generators.find(
                    (g) => g.generatorType === relativeCounterpart
                );
                if (relative !== undefined) {
                    occurrencesForValues = {};
                    break;
                }
            }
            // if at least one occurrence, find the most used one and add it to global
            if (Object.keys(occurrencesForValues).length > 0) {
                const entries = Object.entries(occurrencesForValues);
                // [value, occurrences]
                const valueToGlobalize = entries.reduce(
                    (max, curr) => {
                        if (max[1] < curr[1]) {
                            return curr;
                        }
                        return max;
                    },
                    ["0", 0]
                );
                const targetValue = parseInt(valueToGlobalize[0]);

                // if the global value is the default value just remove it, no need to add it
                if (targetValue !== defaultForChecked) {
                    globalZone.addGenerators(
                        new Generator(checkedType as GeneratorType, targetValue)
                    );
                }
                // remove from the zones
                outputInstrument.zones.forEach((z) => {
                    const gen = z.generators.findIndex(
                        (g) => g.generatorType === checkedType
                    );
                    if (gen !== -1) {
                        if (z.generators[gen].generatorValue === targetValue) {
                            // That exact value exists. Since it's global now, remove it
                            z.generators.splice(gen, 1);
                        }
                    } else {
                        // That type does not exist at all here.
                        // Since we're globalizing, we need to add the default here.
                        if (targetValue !== defaultForChecked) {
                            z.addGenerators(
                                new Generator(
                                    checkedType as GeneratorType,
                                    defaultForChecked
                                )
                            );
                        }
                    }
                });
            }
        }

        // globalize only modulators that exist in all zones
        const firstZone = outputInstrument.zones[0];
        const modulators = firstZone.modulators.map((m) => Modulator.copy(m));
        for (const checkedModulator of modulators) {
            let existsForAllZones = true;
            for (const zone of outputInstrument.zones) {
                if (!existsForAllZones) {
                    continue;
                }
                // check if that zone has an existing modulator
                const mod = zone.modulators.find((m) =>
                    Modulator.isIdentical(m, checkedModulator)
                );
                if (!mod) {
                    // does not exist for this zone, so it's not global.
                    existsForAllZones = false;
                }
                // exists.
            }
            if (existsForAllZones) {
                globalZone.addModulators(Modulator.copy(checkedModulator));
                // delete it from local zones.
                for (const zone of outputInstrument.zones) {
                    const modulator = zone.modulators.find((m) =>
                        Modulator.isIdentical(m, checkedModulator)
                    );
                    if (!modulator) {
                        continue;
                    }
                    // Check if the amount is correct.
                    // If so, delete it since it's global.
                    // If not, then it will simply override global as it's identical.
                    if (
                        modulator.transformAmount ===
                        checkedModulator.transformAmount
                    ) {
                        zone.modulators.splice(
                            zone.modulators.indexOf(modulator),
                            1
                        );
                    }
                }
            }
        }
    }
    return outputInstrument;
}
