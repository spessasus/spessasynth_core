import { Modulator } from "./modulator";
import { BankSelectHacks } from "../../utils/midi_hacks";

import { BasicGlobalZone } from "./basic_global_zone";
import { BasicPresetZone } from "./basic_preset_zone";
import type { BasicSoundBank } from "./basic_soundbank";
import { Generator } from "./generator";
import type { GenericRange, VoiceParameters } from "../types";
import { BasicInstrument } from "./basic_instrument";
import {
    type MIDIPatch,
    type MIDIPatchNamed,
    MIDIPatchTools
} from "./midi_patch";
import {
    defaultGeneratorValues,
    generatorLimits,
    GENERATORS_AMOUNT,
    generatorTypes
} from "./generator_types";
import type { ExtendedSF2Chunks } from "../soundfont/write/types";
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
            this.isGMGSDrum || (xg && BankSelectHacks.isXGDrums(this.bankMSB))
        );
    }

    private static isInRange(range: GenericRange, number: number): boolean {
        return number >= range.min && number <= range.max;
    }

    private static addUniqueModulators(main: Modulator[], adder: Modulator[]) {
        for (const addedMod of adder) {
            if (!main.some((mm) => Modulator.isIdentical(addedMod, mm)))
                main.push(addedMod);
        }
    }

    private static subtractRanges(
        r1: GenericRange,
        r2: GenericRange
    ): GenericRange {
        return {
            min: Math.max(r1.min, r2.min),
            max: Math.min(r1.max, r2.max)
        };
    }

    /**
     * Unlinks everything from this preset.
     */
    public delete() {
        for (const z of this.zones) z.instrument?.unlinkFrom(this);
    }

    /**
     * Deletes an instrument zone from this preset.
     * @param index the zone's index to delete.
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
     * Preloads (loads and caches synthesis data) for a given key range.
     */
    public preload(keyMin: number, keyMax: number) {
        for (let key = keyMin; key < keyMax + 1; key++) {
            for (let velocity = 0; velocity < 128; velocity++) {
                for (const synthesisData of this.getVoiceParameters(
                    key,
                    velocity
                )) {
                    synthesisData.sample.getAudioData();
                }
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

    /**
     * Returns the voice synthesis data for this preset.
     * @param midiNote the MIDI note number.
     * @param velocity the MIDI velocity.
     * @returns the returned sound data.
     */
    public getVoiceParameters(
        midiNote: number,
        velocity: number
    ): VoiceParameters[] {
        const voiceParameters = new Array<VoiceParameters>();
        for (const presetZone of this.zones) {
            // Filter zones out of range
            if (
                !BasicPreset.isInRange(
                    // Local range overrides over global
                    presetZone.hasKeyRange
                        ? presetZone.keyRange
                        : this.globalZone.keyRange,
                    midiNote
                ) ||
                !BasicPreset.isInRange(
                    // Local range overrides over global
                    presetZone.hasVelRange
                        ? presetZone.velRange
                        : this.globalZone.velRange,
                    velocity
                )
            ) {
                continue;
            }

            const instrument = presetZone.instrument;
            if (!instrument || instrument.zones.length === 0) {
                continue;
            }

            // Preset generator list (offsets)
            const presetGenerators = new Int16Array(GENERATORS_AMOUNT);
            // Firstly set global generators
            for (const generator of this.globalZone.generators) {
                presetGenerators[generator.generatorType] =
                    generator.generatorValue;
            }
            // Then local, which will override them!
            for (const generator of presetZone.generators) {
                presetGenerators[generator.generatorType] =
                    generator.generatorValue;
            }

            // Preset modulators (add global to local)
            const presetModulators = [...presetZone.modulators];
            BasicPreset.addUniqueModulators(
                presetModulators,
                this.globalZone.modulators
            );

            for (const instZone of instrument.zones) {
                if (
                    !BasicPreset.isInRange(
                        instZone.hasKeyRange
                            ? instZone.keyRange
                            : instrument.globalZone.keyRange,
                        midiNote
                    ) ||
                    !BasicPreset.isInRange(
                        instZone.hasVelRange
                            ? instZone.velRange
                            : instrument.globalZone.velRange,
                        velocity
                    )
                ) {
                    continue;
                }

                // Modulators
                const modulators = [...instZone.modulators];
                // Add unique from global zone
                BasicPreset.addUniqueModulators(
                    modulators,
                    instrument.globalZone.modulators
                );

                // Add unique default modulators
                BasicPreset.addUniqueModulators(
                    modulators,
                    this.parentSoundBank.defaultModulators
                );

                // Sum preset and instrument modulators (sum their amounts) sf spec page 54, section 9.5
                for (const presetMod of presetModulators) {
                    // Find a matching modulator to sum
                    const matchIndex = modulators.findIndex((m) =>
                        Modulator.isIdentical(presetMod, m)
                    );
                    if (matchIndex === -1) {
                        // No match, add directly
                        modulators.push(presetMod);
                    } else {
                        // An identical instrument modulator, add the amounts
                        // This makes a new modulator
                        // Because otherwise it would overwrite the one in the sound bank!
                        // Replaces the original instrument modulator
                        modulators[matchIndex] =
                            modulators[matchIndex].sumTransform(presetMod);
                    }
                }

                // Default generator values
                const generators = new Int16Array(defaultGeneratorValues);
                // Overridden by global generators
                for (const generator of instrument.globalZone.generators) {
                    generators[generator.generatorType] =
                        generator.generatorValue;
                }
                // Overridden by local generators!
                for (const generator of instZone.generators) {
                    generators[generator.generatorType] =
                        generator.generatorValue;
                }

                // Sum the generators
                for (let i = 0; i < generators.length; i++) {
                    // Limits are applied in the compute_modulator function
                    // Clamp to prevent short from overflowing
                    // Testcase: Sega Genesis soundfont (spessasynth/#169) adds 20,999 and the default 13,500 to initialFilterFc
                    // Which is more than 32k
                    generators[i] = Math.max(
                        -32_768,
                        Math.min(32_767, generators[i] + presetGenerators[i])
                    );
                }

                // EMU initial attenuation correction, multiply initial attenuation by 0.4!
                // All EMU sound cards have this quirk, and all sf2 editors and players emulate it too
                generators[generatorTypes.initialAttenuation] = Math.floor(
                    generators[generatorTypes.initialAttenuation] * 0.4
                );

                voiceParameters.push({
                    sample: instZone.sample,
                    generators,
                    modulators
                });
            }
        }
        return voiceParameters;
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
                        !main.some((mg) => mg.generatorType === g.generatorType)
                )
            );
        };

        const addUniqueMods = (main: Modulator[], adder: Modulator[]) => {
            main.push(
                ...adder.filter(
                    (m) => !main.some((mm) => Modulator.isIdentical(m, mm))
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
                instZoneKeyRange = BasicPreset.subtractRanges(
                    instZoneKeyRange,
                    presetZoneKeyRange
                );
                instZoneVelRange = BasicPreset.subtractRanges(
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
                    if (identicalInstMod === -1) {
                        finalModList.push(mod);
                    } else {
                        // Sum the amounts
                        // (this makes a new modulator)
                        // Because otherwise it would overwrite the one in the soundfont!
                        finalModList[identicalInstMod] =
                            finalModList[identicalInstMod].sumTransform(mod);
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
                    if (identicalInstGen === -1) {
                        // If not, sum to the default generator
                        const newAmount =
                            generatorLimits[gen.generatorType].def +
                            gen.generatorValue;
                        finalGenList.push(
                            new Generator(gen.generatorType, newAmount)
                        );
                    } else {
                        // If exists, sum to that generator
                        const newAmount =
                            finalGenList[identicalInstGen].generatorValue +
                            gen.generatorValue;
                        finalGenList[identicalInstGen] = new Generator(
                            gen.generatorType,
                            newAmount
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

    // noinspection JSUnusedGlobalSymbols
    /**
     * Writes the SF2 header
     * @param phdrData
     * @param index
     */
    public write(phdrData: ExtendedSF2Chunks, index: number) {
        SpessaSynthInfo(`%cWriting ${this.name}...`, consoleColors.info);
        // Split up the name
        writeBinaryStringIndexed(phdrData.pdta, this.name.slice(0, 20), 20);
        writeBinaryStringIndexed(phdrData.xdta, this.name.slice(20), 20);

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

        writeWord(phdrData.pdta, index & 0xff_ff);
        writeWord(phdrData.xdta, index >> 16);

        // 3 unused dword, spec says to keep em so we do
        writeDword(phdrData.pdta, this.library);
        writeDword(phdrData.pdta, this.genre);
        writeDword(phdrData.pdta, this.morphology);
        phdrData.xdta.currentIndex += 12;
    }
}
