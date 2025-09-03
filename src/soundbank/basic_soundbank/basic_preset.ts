import { MOD_BYTE_SIZE, Modulator } from "./modulator";
import { BankSelectHacks } from "../../utils/midi_hacks";

import { BasicGlobalZone } from "./basic_global_zone";
import { BasicPresetZone } from "./basic_preset_zone";
import type { BasicSoundBank } from "./basic_soundbank";
import { GEN_BYTE_SIZE, Generator } from "./generator";
import type { GenericRange, VoiceSynthesisData } from "../types";
import { BasicInstrument } from "./basic_instrument";
import {
    type MIDIPatch,
    type MIDIPatchNamed,
    MIDIPatchTools
} from "./midi_patch";
import { generatorLimits, generatorTypes } from "./generator_types";
import { BAG_BYTE_SIZE } from "./basic_zone";
import type { IndexedByteArray } from "../../utils/indexed_array";
import type {
    ExtendedSF2Chunks,
    SoundFontWriteIndexes
} from "../soundfont/write/types";
import { SpessaSynthInfo } from "../../utils/loggin";
import { consoleColors } from "../../utils/other";
import { writeBinaryStringIndexed } from "../../utils/byte_functions/string";
import {
    writeDword,
    writeWord
} from "../../utils/byte_functions/little_endian";

export const PHDR_BYTE_SIZE = 38;

export class BasicPreset implements MIDIPatchNamed {
    /**
     * The parent soundbank instance
     * Currently used for determining default modulators and XG status
     */
    public readonly parentSoundBank: BasicSoundBank;

    /**
     * The preset's name
     */
    public name = "";

    public program = 0;

    public bankMSB = 0;

    public bankLSB = 0;

    public isGMGSDrum = false;

    /**
     * The preset's zones
     */
    public zones: BasicPresetZone[] = [];

    /**
     * Preset's global zone
     */
    public readonly globalZone: BasicGlobalZone;

    /**
     * Unused metadata
     */
    public library = 0;
    /**
     * Unused metadata
     */
    public genre = 0;
    /**
     * Unused metadata
     */
    public morphology = 0;

    /**
     * Creates a new preset representation.
     * @param parentSoundBank the sound bank this preset belongs to.
     * @param globalZone optional, a global zone to use.
     */
    public constructor(
        parentSoundBank: BasicSoundBank,
        globalZone = new BasicGlobalZone()
    ) {
        this.parentSoundBank = parentSoundBank;
        this.globalZone = globalZone;
    }

    public get isXGDrums() {
        return (
            this.parentSoundBank.isXGBank &&
            BankSelectHacks.isXGDrums(this.bankMSB)
        );
    }

    /**
     * Checks if this preset is a drum preset
     */
    public get isAnyDrums(): boolean {
        const xg = this.parentSoundBank.isXGBank;

        return (
            this.isGMGSDrum ||
            (xg &&
                BankSelectHacks.isXGDrums(this.bankMSB) &&
                // SFX is not a drum preset, only for exact match
                this.bankMSB !== 126)
        );
    }

    // Unlinks everything from this preset
    public delete() {
        this.zones.forEach((z) => z.instrument?.unlinkFrom(this));
    }

    /**
     * Deletes an instrument zone from this preset
     * @param index the zone's index to delete
     */
    public deleteZone(index: number) {
        this.zones[index]?.instrument?.unlinkFrom(this);
        this.zones.splice(index, 1);
    }

    /**
     * Creates a new preset zone and returns it.
     * @param instrument the instrument to use in the zone.
     */
    public createZone(instrument: BasicInstrument): BasicPresetZone {
        const z = new BasicPresetZone(this, instrument);
        this.zones.push(z);
        return z;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Preloads all samples for a given range
     */
    public preload(keyMin: number, keyMax: number) {
        for (let key = keyMin; key < keyMax + 1; key++) {
            for (let velocity = 0; velocity < 128; velocity++) {
                this.getSynthesisData(key, velocity).forEach(
                    (synthesisData) => {
                        synthesisData.sample.getAudioData();
                    }
                );
            }
        }
    }

    /**
     * Checks if the bank and program numbers are the same for the given preset as this one.
     * @param preset The preset to check.
     */
    public matches(preset: MIDIPatch) {
        return MIDIPatchTools.matches(this, preset);
    }

    public getSize() {
        const modCount =
            this.zones.reduce(
                (count, zone) => zone.modulators.length + count,
                0
            ) + this.globalZone.modulators.length;
        const genCount =
            this.zones.reduce((count, zone) => zone.getGenCount() + count, 0) +
            this.globalZone.getGenCount();
        return {
            mod: modCount * MOD_BYTE_SIZE,
            bag: (this.zones.length + 1) * BAG_BYTE_SIZE, // global zone
            gen: genCount * GEN_BYTE_SIZE,
            hdr: PHDR_BYTE_SIZE
        };
    }

    /**
     * Returns the synthesis data from this preset
     * @param midiNote the MIDI note number
     * @param velocity the MIDI velocity
     * @returns the returned sound data
     */
    public getSynthesisData(
        midiNote: number,
        velocity: number
    ): VoiceSynthesisData[] {
        if (this.zones.length < 1) {
            return [];
        }

        function isInRange(range: GenericRange, number: number): boolean {
            return number >= range.min && number <= range.max;
        }

        function addUnique(main: Generator[], adder: Generator[]) {
            main.push(
                ...adder.filter(
                    (g) =>
                        !main.find((mg) => mg.generatorType === g.generatorType)
                )
            );
        }

        function addUniqueMods(main: Modulator[], adder: Modulator[]) {
            main.push(
                ...adder.filter(
                    (m) => !main.find((mm) => Modulator.isIdentical(m, mm))
                )
            );
        }

        const parsedGeneratorsAndSamples: VoiceSynthesisData[] = [];

        /**
         * Global zone is always first, so it or nothing
         */
        const globalPresetGenerators: Generator[] = [
            ...this.globalZone.generators
        ];

        const globalPresetModulators: Modulator[] = [
            ...this.globalZone.modulators
        ];
        const globalKeyRange = this.globalZone.keyRange;
        const globalVelRange = this.globalZone.velRange;

        // Find the preset zones in range
        const presetZonesInRange = this.zones.filter(
            (currentZone) =>
                isInRange(
                    currentZone.hasKeyRange
                        ? currentZone.keyRange
                        : globalKeyRange,
                    midiNote
                ) &&
                isInRange(
                    currentZone.hasVelRange
                        ? currentZone.velRange
                        : globalVelRange,
                    velocity
                )
        );

        presetZonesInRange.forEach((presetZone) => {
            const instrument = presetZone.instrument;
            // The global zone is already taken into account earlier
            if (!instrument || instrument.zones.length < 1) {
                return;
            }
            const presetGenerators = presetZone.generators;
            const presetModulators = presetZone.modulators;
            /**
             * Global zone is always first, so it or nothing
             */
            const globalInstrumentGenerators: Generator[] = [
                ...instrument.globalZone.generators
            ];
            const globalInstrumentModulators = [
                ...instrument.globalZone.modulators
            ];
            const globalKeyRange = instrument.globalZone.keyRange;
            const globalVelRange = instrument.globalZone.velRange;

            const instrumentZonesInRange = instrument.zones.filter(
                (currentZone) =>
                    isInRange(
                        currentZone.hasKeyRange
                            ? currentZone.keyRange
                            : globalKeyRange,
                        midiNote
                    ) &&
                    isInRange(
                        currentZone.hasVelRange
                            ? currentZone.velRange
                            : globalVelRange,
                        velocity
                    )
            );

            instrumentZonesInRange.forEach((instrumentZone) => {
                const instrumentGenerators = [...instrumentZone.generators];
                const instrumentModulators = [...instrumentZone.modulators];

                addUnique(presetGenerators, globalPresetGenerators);
                // Add the unique global preset generators (local replace global(

                // Add the unique global instrument generators (local replace global)
                addUnique(instrumentGenerators, globalInstrumentGenerators);

                addUniqueMods(presetModulators, globalPresetModulators);
                addUniqueMods(instrumentModulators, globalInstrumentModulators);

                // Default mods
                addUniqueMods(
                    instrumentModulators,
                    this.parentSoundBank.defaultModulators
                );

                /**
                 * Sum preset modulators to instruments (amount) sf spec page 54
                 */
                const finalModulatorList: Modulator[] = [
                    ...instrumentModulators
                ];
                for (const mod of presetModulators) {
                    const identicalInstrumentModulator =
                        finalModulatorList.findIndex((m) =>
                            Modulator.isIdentical(mod, m)
                        );
                    if (identicalInstrumentModulator !== -1) {
                        // Sum the amounts
                        // This makes a new modulator
                        // Because otherwise it would overwrite the one in the sound bank!
                        finalModulatorList[identicalInstrumentModulator] =
                            finalModulatorList[
                                identicalInstrumentModulator
                            ].sumTransform(mod);
                    } else {
                        finalModulatorList.push(mod);
                    }
                }

                if (instrumentZone.sample) {
                    // Combine both generators and add to the final result
                    parsedGeneratorsAndSamples.push({
                        instrumentGenerators: instrumentGenerators,
                        presetGenerators: presetGenerators,
                        modulators: finalModulatorList,
                        sample: instrumentZone.sample
                    });
                }
            });
        });
        return parsedGeneratorsAndSamples;
    }

    /**
     * BankMSB:bankLSB:program:isGMGSDrum
     */
    public toMIDIString() {
        return MIDIPatchTools.toMIDIString(this);
    }

    public toString() {
        return MIDIPatchTools.toNamedMIDIString(this);
    }

    /**
     * Combines preset into an instrument, flattening the preset zones into instrument zones.
     * This is a really complex function that attempts to work around the DLS limitations of only having the instrument layer.
     * @returns The instrument containing the flattened zones. In theory, it should exactly the same as this preset.
     */
    public toFlattenedInstrument(): BasicInstrument {
        const addUnique = (main: Generator[], adder: Generator[]) => {
            main.push(
                ...adder.filter(
                    (g) =>
                        !main.find((mg) => mg.generatorType === g.generatorType)
                )
            );
        };

        const subtractRanges = (
            r1: GenericRange,
            r2: GenericRange
        ): GenericRange => {
            return {
                min: Math.max(r1.min, r2.min),
                max: Math.min(r1.max, r2.max)
            };
        };

        const addUniqueMods = (main: Modulator[], adder: Modulator[]) => {
            main.push(
                ...adder.filter(
                    (m) => !main.find((mm) => Modulator.isIdentical(m, mm))
                )
            );
        };

        const outputInstrument = new BasicInstrument();
        outputInstrument.name = this.name;

        const globalPresetGenerators: Generator[] = [];
        const globalPresetModulators: Modulator[] = [];
        // Find the global zone and apply ranges, generators, and modulators
        const globalPresetZone = this.globalZone;
        globalPresetGenerators.push(...globalPresetZone.generators);
        globalPresetModulators.push(...globalPresetZone.modulators);
        const globalPresetKeyRange = globalPresetZone.keyRange;
        const globalPresetVelRange = globalPresetZone.velRange;
        // For each non-global preset zone
        for (const presetZone of this.zones) {
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
                        g.generatorValue !==
                            generatorLimits[g.generatorType].def
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

    public write(
        genData: IndexedByteArray,
        modData: IndexedByteArray,
        bagData: ExtendedSF2Chunks,
        phdrData: ExtendedSF2Chunks,
        indexes: SoundFontWriteIndexes,
        bank: BasicSoundBank
    ) {
        SpessaSynthInfo(`%cWriting ${this.name}...`, consoleColors.info);
        // Split up the name
        writeBinaryStringIndexed(phdrData.pdta, this.name.substring(0, 20), 20);
        writeBinaryStringIndexed(phdrData.xdta, this.name.substring(20), 20);

        writeWord(phdrData.pdta, this.program);
        let wBank = this.bankMSB;
        if (this.isGMGSDrum) {
            // Drum flag
            wBank = 0x80;
        } else if (this.bankMSB === 0) {
            // If bank MSB is zero, write bank LSB (XG)
            wBank = this.bankLSB;
        }
        writeWord(phdrData.pdta, wBank);
        // Skip wBank and wProgram
        phdrData.xdta.currentIndex += 4;

        writeWord(phdrData.pdta, indexes.hdr & 0xffff);
        writeWord(phdrData.xdta, indexes.hdr >> 16);

        // 3 unused dword, spec says to keep em so we do
        writeDword(phdrData.pdta, this.library);
        writeDword(phdrData.pdta, this.genre);
        writeDword(phdrData.pdta, this.morphology);
        phdrData.xdta.currentIndex += 12;

        indexes.hdr += this.zones.length + 1; // + global zone

        this.globalZone.write(genData, modData, bagData, indexes, bank);
        this.zones.forEach((z) =>
            z.write(genData, modData, bagData, indexes, bank)
        );
    }
}
