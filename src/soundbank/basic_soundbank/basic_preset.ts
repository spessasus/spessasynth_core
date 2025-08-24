import { Modulator } from "./modulator";
import { isXGDrums } from "../../utils/xg_hacks";

import { BasicGlobalZone } from "./basic_global_zone";
import { BasicPresetZone } from "./basic_preset_zone";
import type { BasicSoundBank } from "./basic_soundbank";
import type { Generator } from "./generator";
import type { KeyRange, SampleAndGenerators } from "../types";
import type { BasicInstrument } from "./basic_instrument";
import type { MIDIPatchNamed } from "./midi_patch";

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
        return this.parentSoundBank.isXGBank && isXGDrums(this.bankMSB);
    }

    /**
     * Checks if this preset is a drum preset
     */
    public get isAnyDrums(): boolean {
        const xg = this.parentSoundBank.isXGBank;

        return (
            this.isGMGSDrum ||
            (xg &&
                isXGDrums(this.bankMSB) &&
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
                this.getSamplesAndGenerators(key, velocity).forEach(
                    (samAndGen) => {
                        samAndGen.sample.getAudioData();
                    }
                );
            }
        }
    }

    /**
     * Checks if the bank and program numbers are the same for the given preset as this one.
     * @param preset The preset to check.
     */
    public isPatchNumberEqual(preset: BasicPreset) {
        return (
            this.program === preset.program &&
            this.bankLSB === preset.bankLSB &&
            this.bankMSB === preset.bankMSB &&
            this.isGMGSDrum === preset.isGMGSDrum
        );
    }

    /**
     * Returns samples and generators for given note
     * @param midiNote the MIDI note number
     * @param velocity the MIDI velocity
     * @returns the returned sound data
     */
    public getSamplesAndGenerators(
        midiNote: number,
        velocity: number
    ): SampleAndGenerators[] {
        if (this.zones.length < 1) {
            return [];
        }

        function isInRange(range: KeyRange, number: number): boolean {
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

        const parsedGeneratorsAndSamples: SampleAndGenerators[] = [];

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
                        // Because otherwise it would overwrite the one in the soundfont!
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
        if (this.isGMGSDrum) {
            return `DRUM:${this.program}`;
        }
        return `${this.bankMSB}:${this.bankLSB}:${this.program}`;
    }

    public toString() {
        return `${this.name} ${this.toMIDIString()}`;
    }
}
