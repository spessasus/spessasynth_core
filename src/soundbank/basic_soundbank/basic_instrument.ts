import { BasicInstrumentZone } from "./basic_instrument_zone";
import { SpessaLog } from "../../utils/loggin";
import { type BasicPreset } from "./basic_preset";
import type { BasicSample } from "./basic_sample";
import {
    GeneratorLimits,
    type GeneratorType,
    GeneratorTypes
} from "./generator_types";
import { Modulator } from "./modulator";
import type { ExtendedSF2Chunks } from "../soundfont/write/types";
import { writeWord } from "../../utils/byte_functions/little_endian";
import { ConsoleColors } from "../../utils/other";
import { BasicZone } from "./basic_zone";

export const INST_BYTE_SIZE = 22;

const notGlobalizedTypes = new Set([
    GeneratorTypes.velRange,
    GeneratorTypes.keyRange,
    GeneratorTypes.instrument,
    GeneratorTypes.sampleID,
    GeneratorTypes.exclusiveClass,
    GeneratorTypes.endOper,
    GeneratorTypes.sampleModes,
    GeneratorTypes.startloopAddrsOffset,
    GeneratorTypes.startloopAddrsCoarseOffset,
    GeneratorTypes.endloopAddrsOffset,
    GeneratorTypes.endloopAddrsCoarseOffset,
    GeneratorTypes.startAddrsOffset,
    GeneratorTypes.startAddrsCoarseOffset,
    GeneratorTypes.endAddrOffset,
    GeneratorTypes.endAddrsCoarseOffset,
    GeneratorTypes.initialAttenuation, // Written into wsmp, there's no global wsmp
    GeneratorTypes.fineTune, // Written into wsmp, there's no global wsmp
    GeneratorTypes.coarseTune, // Written into wsmp, there's no global wsmp
    GeneratorTypes.keyNumToVolEnvHold, // KEY TO SOMETHING:
    GeneratorTypes.keyNumToVolEnvDecay, // Cannot be globalized as they modify their respective generators
    GeneratorTypes.keyNumToModEnvHold, // (for example, keyNumToVolEnvDecay modifies VolEnvDecay)
    GeneratorTypes.keyNumToModEnvDecay
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
    public readonly globalZone = new BasicZone();
    /**
     * Instrument's linked presets (the presets that use it)
     * note that duplicates are allowed since one preset can use the same instrument multiple times.
     */
    public readonly linkedTo: BasicPreset[] = [];

    /**
     * How many presets is this instrument used by
     */
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
        for (const z of this.zones) z.useCount++;
    }

    /**
     * Unlinks the instrument from a given preset
     * @param preset the preset to unlink from
     */
    public unlinkFrom(preset: BasicPreset) {
        const index = this.linkedTo.indexOf(preset);
        if (index === -1) {
            SpessaLog.warn(
                `Cannot unlink ${preset.name} from ${this.name}: not linked.`
            );
            return;
        }
        this.linkedTo.splice(index, 1);
        for (const z of this.zones) z.useCount--;
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
        for (const z of this.zones) z.sample.unlinkFrom(this);
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
     * This means trying to move as many generators and modulators
     * to the global zone as possible to reduce clutter and the count of parameters.
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
            const defaultForChecked = GeneratorLimits[checkedType]?.def || 0;
            occurrencesForValues[defaultForChecked] = 0;
            for (const zone of this.zones) {
                const value = zone.getGenerator(checkedType, undefined);
                if (value === undefined) {
                    occurrencesForValues[defaultForChecked]++;
                } else {
                    if (occurrencesForValues[value] === undefined) {
                        occurrencesForValues[value] = 1;
                    } else {
                        occurrencesForValues[value]++;
                    }
                }

                // If the checked type has the keyNumTo something generator set, it cannot be globalized.
                let relativeCounterpart;
                switch (checkedType) {
                    default: {
                        continue;
                    }

                    case GeneratorTypes.decayVolEnv: {
                        relativeCounterpart =
                            GeneratorTypes.keyNumToVolEnvDecay;
                        break;
                    }
                    case GeneratorTypes.holdVolEnv: {
                        relativeCounterpart = GeneratorTypes.keyNumToVolEnvHold;
                        break;
                    }
                    case GeneratorTypes.decayModEnv: {
                        relativeCounterpart =
                            GeneratorTypes.keyNumToModEnvDecay;
                        break;
                    }
                    case GeneratorTypes.holdModEnv: {
                        relativeCounterpart = GeneratorTypes.keyNumToModEnvHold;
                    }
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
                // [value, occurrences]
                let valueToGlobalize: [string, number] = ["0", 0];

                for (const [value, count] of Object.entries(
                    occurrencesForValues
                )) {
                    if (count > valueToGlobalize[1]) {
                        valueToGlobalize = [value, count];
                    }
                }
                const targetValue = Number.parseInt(valueToGlobalize[0]);

                // If the global value is the default value just remove it, no need to add it
                if (targetValue !== defaultForChecked) {
                    globalZone.setGenerator(checkedType, targetValue, false);
                }
                // Remove from the zones
                for (const z of this.zones) {
                    const genValue = z.getGenerator(checkedType, undefined);
                    if (genValue === undefined) {
                        // That type does not exist at all here.
                        // Since we're globalizing, we need to add the default here.
                        if (targetValue !== defaultForChecked) {
                            z.setGenerator(checkedType, defaultForChecked);
                        }
                    } else {
                        if (genValue === targetValue) {
                            // That exact value exists. Since it's global now, remove it
                            z.setGenerator(checkedType, null);
                        }
                    }
                }
            }
        }

        // Globalize only modulators that exist in all zones
        const modulators =
            this.zones.length === 0
                ? []
                : this.zones[0].modulators.map((m) => Modulator.copyFrom(m));
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

    public write(instData: ExtendedSF2Chunks, index: number) {
        SpessaLog.info(`%cWriting ${this.name}...`, ConsoleColors.info);
        // Encode to UTF-8
        const encoder = new TextEncoder();
        const encodedText = encoder.encode(this.name);
        if (encodedText.length <= 20)
        {
            instData.pdta.set(encodedText,instData.pdta.currentIndex);
        } 
        else if (encodedText.length <= 40)
        {
            instData.pdta.set(encodedText.slice(0,20),instData.pdta.currentIndex);
            instData.xdta.set(encodedText.slice(20),instData.xdta.currentIndex);
        } 
        else 
        {
            instData.pdta.set(encodedText.slice(0,20),instData.pdta.currentIndex);
            instData.xdta.set(encodedText.slice(20,40),instData.xdta.currentIndex);
        }
        instData.pdta.currentIndex += 20;
        instData.xdta.currentIndex += 20;        
        // Inst start index
        writeWord(instData.pdta, index & 0xff_ff);
        writeWord(instData.xdta, index >>> 16);
    }
}
