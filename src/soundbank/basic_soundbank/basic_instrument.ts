import { BasicGlobalZone } from "./basic_global_zone";
import { BasicInstrumentZone } from "./basic_instrument_zone";
import { SpessaSynthWarn } from "../../utils/loggin";
import type { BasicPreset } from "./basic_preset";
import type { BasicSample } from "./basic_sample";
import {
    generatorLimits,
    type GeneratorType,
    generatorTypes
} from "./generator_types";
import { Modulator } from "./modulator";

const notGlobalizedTypes = new Set([
    generatorTypes.velRange,
    generatorTypes.keyRange,
    generatorTypes.instrument,
    generatorTypes.sampleID,
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
    generatorTypes.initialAttenuation, // Written into wsmp, there's no global wsmp
    generatorTypes.fineTune, // Written into wsmp, there's no global wsmp
    generatorTypes.coarseTune, // Written into wsmp, there's no global wsmp
    generatorTypes.keyNumToVolEnvHold, // KEY TO SOMETHING:
    generatorTypes.keyNumToVolEnvDecay, // Cannot be globalized as they modify their respective generators
    generatorTypes.keyNumToModEnvHold, // (for example, keyNumToVolEnvDecay modifies VolEnvDecay)
    generatorTypes.keyNumToModEnvDecay
] as const);
type notGlobalizedTypes =
    typeof notGlobalizedTypes extends Set<infer T> ? T : never;

// noinspection JSUnusedGlobalSymbols
/**
 * Represents a single instrument
 */
export class BasicInstrument {
    /**
     * The instrument's name
     */
    public name = "";
    /**
     * The instrument's zones
     */
    public zones: BasicInstrumentZone[] = [];
    /**
     * Instrument's global zone
     */
    public readonly globalZone: BasicGlobalZone = new BasicGlobalZone();
    /**
     * Instrument's linked presets (the presets that use it)
     * note that duplicates are allowed since one preset can use the same instrument multiple times
     */
    public readonly linkedTo: BasicPreset[] = [];

    // How many presets is this instrument used by
    public get useCount(): number {
        return this.linkedTo.length;
    }

    /**
     * Creates a new instrument zone and returns it.
     * @param sample The sample to use in the zone.
     */
    public createZone(sample: BasicSample): BasicInstrumentZone {
        const zone = new BasicInstrumentZone(this, sample);
        this.zones.push(zone);
        return zone;
    }

    /**
     * Links the instrument ta a given preset
     * @param preset the preset to link to
     */
    public linkTo(preset: BasicPreset) {
        this.linkedTo.push(preset);
        this.zones.forEach((z) => z.useCount++);
    }

    /**
     * Unlinks the instrument from a given preset
     * @param preset the preset to unlink from
     */
    public unlinkFrom(preset: BasicPreset) {
        const index = this.linkedTo.indexOf(preset);
        if (index < 0) {
            SpessaSynthWarn(
                `Cannot unlink ${preset.name} from ${this.name}: not linked.`
            );
            return;
        }
        this.linkedTo.splice(index, 1);
        this.zones.forEach((z) => z.useCount--);
    }

    // Deletes unused zones of the instrument
    public deleteUnusedZones() {
        this.zones = this.zones.filter((z) => {
            const stays = z.useCount > 0;
            if (!stays) {
                z.sample.unlinkFrom(this);
            }
            return stays;
        });
    }

    // Unlinks everything from this instrument
    public delete() {
        if (this.useCount > 0) {
            throw new Error(
                `Cannot delete an instrument that is used by: ${this.linkedTo.map((p) => p.name).toString()}.`
            );
        }
        this.zones.forEach((z) => z.sample.unlinkFrom(this));
    }

    /**
     * Deletes a given instrument zone if it has no uses
     * @param index the index of the zone to delete
     * @param force ignores the use count and deletes forcibly
     * @returns if the zone has been deleted
     */
    public deleteZone(index: number, force = false): boolean {
        const zone = this.zones[index];
        zone.useCount -= 1;
        if (zone.useCount < 1 || force) {
            zone.sample.unlinkFrom(this);
            this.zones.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Globalizes the instrument *in-place.*
     * This means trying to move as many generators and modulators to the global zone as possible to reduce clutter and the count of parameters.
     */
    public globalize() {
        const globalZone = this.globalZone;

        // Create a global zone and add repeating generators to it
        // Also modulators
        // Iterate over every type of generator
        for (
            let checkedType: GeneratorType = 0;
            checkedType < 58;
            checkedType++
        ) {
            // Not these though
            if (notGlobalizedTypes.has(checkedType as notGlobalizedTypes)) {
                continue;
            }
            checkedType = checkedType as GeneratorType;
            let occurrencesForValues: Record<number, number> = {};
            const defaultForChecked = generatorLimits[checkedType]?.def || 0;
            occurrencesForValues[defaultForChecked] = 0;
            for (const zone of this.zones) {
                const value = zone.getGenerator(checkedType, undefined);
                if (value !== undefined) {
                    if (occurrencesForValues[value] === undefined) {
                        occurrencesForValues[value] = 1;
                    } else {
                        occurrencesForValues[value]++;
                    }
                } else {
                    occurrencesForValues[defaultForChecked]++;
                }

                // If the checked type has the keyNumTo something generator set, it cannot be globalized.
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
                const relative = zone.getGenerator(
                    relativeCounterpart,
                    undefined
                );
                if (relative !== undefined) {
                    occurrencesForValues = {};
                    break;
                }
            }
            // If at least one occurrence, find the most used one and add it to global
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

                // If the global value is the default value just remove it, no need to add it
                if (targetValue !== defaultForChecked) {
                    globalZone.setGenerator(checkedType, targetValue, false);
                }
                // Remove from the zones
                this.zones.forEach((z) => {
                    const genValue = z.getGenerator(checkedType, undefined);
                    if (genValue !== undefined) {
                        if (genValue === targetValue) {
                            // That exact value exists. Since it's global now, remove it
                            z.setGenerator(checkedType, undefined);
                        }
                    } else {
                        // That type does not exist at all here.
                        // Since we're globalizing, we need to add the default here.
                        if (targetValue !== defaultForChecked) {
                            z.setGenerator(checkedType, defaultForChecked);
                        }
                    }
                });
            }
        }

        // Globalize only modulators that exist in all zones
        const firstZone = this.zones[0];
        const modulators = firstZone.modulators.map((m) =>
            Modulator.copyFrom(m)
        );
        for (const checkedModulator of modulators) {
            let existsForAllZones = true;
            for (const zone of this.zones) {
                if (!existsForAllZones) {
                    continue;
                }
                // Check if that zone has an existing modulator
                const mod = zone.modulators.find((m) =>
                    Modulator.isIdentical(m, checkedModulator)
                );
                if (!mod) {
                    // Does not exist for this zone, so it's not global.
                    existsForAllZones = false;
                }
                // Exists.
            }
            if (existsForAllZones) {
                globalZone.addModulators(Modulator.copyFrom(checkedModulator));
                // Delete it from local zones.
                for (const zone of this.zones) {
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
}
