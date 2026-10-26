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
import { writeBinaryStringIndexed } from "../../utils/byte_functions/string";
import { writeWord } from "../../utils/byte_functions/little_endian";
import { ConsoleColors } from "../../utils/other";
import { BasicZone } from "./basic_zone";

export const INST_BYTE_SIZE = 22;

const notGlobalizedTypes: ReadonlySet<GeneratorType> = new Set([
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
] as GeneratorType[]);

// noinspection JSUnusedGlobalSymbols
/**
 * This class represents a single instrument, a layer below the BasicPreset.
 *
 * > **Note**
 * >
 * > Despite the name, this isn't what the MIDI selects. BasicPreset is the actual "instrument".
 *
 * @group Sound Banks
 */
export class BasicInstrument {
    /**
     * The name of this instrument.
     */
    public name = "";
    /**
     * The instrument's local zones.
     * These are limited to specific key/velocity ranges and contain associated samples.
     */
    public zones: BasicInstrumentZone[] = [];
    /**
     * Instrument's global zone.
     * Its parameters are overridden by the local zone parameters.
     */
    public readonly globalZone = new BasicZone();
    /**
     * Instrument's linked presets (the presets that use it).
     *
     * > **Note**
     * >
     * > Duplicate entries are allowed since one preset can use the same instrument multiple times.
     */
    public readonly linkedTo: BasicPreset[] = [];

    /**
     * How many presets is this instrument used by.
     */
    public get useCount(): number {
        return this.linkedTo.length;
    }

    /**
     * Creates a new instrument zone, adds it to this instrument and returns it.
     * @param sample The sample to associate with the zone.
     */
    public createZone(sample: BasicSample): BasicInstrumentZone {
        const zone = new BasicInstrumentZone(this, sample);
        this.zones.push(zone);
        return zone;
    }

    /**
     * Links the instrument ta a given preset.
     * @param preset The preset to link to.
     * @internal
     */
    public linkTo(preset: BasicPreset) {
        this.linkedTo.push(preset);
        for (const z of this.zones) z.useCount++;
    }

    // Public API, spessafont consumes it
    /**
     * Unlinks the instrument from a given preset.
     * @param preset The preset to unlink from.
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

    /**
     * Deletes unused zones of the instrument.
     * @internal
     */
    public deleteUnusedZones() {
        this.zones = this.zones.filter((z) => {
            const stays = z.useCount > 0;
            if (!stays) {
                z.sample.unlinkFrom(this);
            }
            return stays;
        });
    }

    /**
     * Unlinks everything from this instrument.
     * @internal
     */
    public delete() {
        if (this.useCount > 0) {
            throw new Error(
                `Cannot delete an instrument that is used by: ${this.linkedTo.map((p) => p.name).toString()}.`
            );
        }
        for (const z of this.zones) z.sample.unlinkFrom(this);
    }

    /**
     * Deletes a given instrument zone if it has no uses.
     * @param index The index of the zone to delete.
     * @param force Force deletes the zone instead of the safe deletion.
     * @returns True if the zone has been deleted, false otherwise.
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
     *
     * If fully successful, this should have no effect on the audio produced.
     */
    public globalize() {
        const globalZone = this.globalZone;

        // Create a global zone and add repeating generators to it
        // Also modulators
        // Iterate over every type of SF2 generator
        for (let type = 0; type <= GeneratorTypes.overridingRootKey; type++) {
            const checkedType = type as GeneratorType;
            // Not these though
            if (notGlobalizedTypes.has(checkedType)) {
                continue;
            }
            const limit = GeneratorLimits[checkedType] as
                | (typeof GeneratorLimits)[GeneratorType]
                | undefined;
            // Unused generator
            if (!limit) continue;
            const defaultForChecked = limit.def;

            // If the checked type has the keyNumTo something generator set, it cannot be globalized.
            let relativeCounterpart: GeneratorType | undefined;
            switch (checkedType) {
                default: {
                    break;
                }

                case GeneratorTypes.decayVolEnv: {
                    relativeCounterpart = GeneratorTypes.keyNumToVolEnvDecay;
                    break;
                }
                case GeneratorTypes.holdVolEnv: {
                    relativeCounterpart = GeneratorTypes.keyNumToVolEnvHold;
                    break;
                }
                case GeneratorTypes.decayModEnv: {
                    relativeCounterpart = GeneratorTypes.keyNumToModEnvDecay;
                    break;
                }
                case GeneratorTypes.holdModEnv: {
                    relativeCounterpart = GeneratorTypes.keyNumToModEnvHold;
                }
            }
            if (
                relativeCounterpart !== undefined &&
                [globalZone, ...this.zones].some(
                    (z) =>
                        z.getGenerator(relativeCounterpart, undefined) !==
                        undefined
                )
            ) {
                continue;
            }

            // The effective value of each zone: local,
            // Then the existing global one, then the default
            const globalValue = globalZone.getGenerator(
                checkedType,
                defaultForChecked
            );
            const effectiveValues = this.zones.map((z) =>
                z.getGenerator(checkedType, globalValue)
            );
            if (effectiveValues.length === 0) continue;

            // Find the most used value and make it global
            const occurrencesForValues = new Map<number, number>();
            let targetValue = effectiveValues[0];
            let targetCount = 0;
            for (const value of effectiveValues) {
                const count = (occurrencesForValues.get(value) ?? 0) + 1;
                occurrencesForValues.set(value, count);
                if (count > targetCount) {
                    targetValue = value;
                    targetCount = count;
                }
            }

            // If the global value is the default value just remove it, no need to add it
            globalZone.setGenerator(
                checkedType,
                targetValue === defaultForChecked ? null : targetValue,
                false
            );
            // Zones with the global value do not need it, others keep their effective value
            for (let i = 0; i < this.zones.length; i++) {
                const value = effectiveValues[i];
                this.zones[i].setGenerator(
                    checkedType,
                    value === targetValue ? null : value,
                    false
                );
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
                // Every zone overrides the global one, so the existing global amount does not matter
                const existingGlobal = globalZone.modulators.find((m) =>
                    Modulator.isIdentical(m, checkedModulator)
                );
                if (existingGlobal)
                    existingGlobal.transformAmount =
                        checkedModulator.transformAmount;
                else
                    globalZone.addModulators(
                        Modulator.copyFrom(checkedModulator)
                    );
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

    /**
     * @internal
     * @param instData
     * @param index
     */
    public write(instData: ExtendedSF2Chunks, index: number) {
        SpessaLog.info(`%cWriting ${this.name}...`, ConsoleColors.info);
        // Split up the name
        writeBinaryStringIndexed(instData.pdta, this.name.slice(0, 20), 20);
        writeBinaryStringIndexed(instData.xdta, this.name.slice(20), 20);
        // Inst start index
        writeWord(instData.pdta, index & 0xff_ff);
        writeWord(instData.xdta, index >>> 16);
    }
}
