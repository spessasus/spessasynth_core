import { Modulator } from "./modulator";
import { isXGDrums } from "../../utils/xg_hacks";

import { BasicGlobalZone } from "./basic_global_zone";
import { BasicPresetZone } from "./basic_preset_zone";
import type { BasicSoundBank } from "./basic_soundbank";
import type { Generator } from "./generator";
import type { KeyRange, SampleAndGenerators } from "../types";
import type { BasicInstrument } from "./basic_instrument";

export class BasicPreset {
    /**
     * The parent soundbank instance
     * Currently used for determining default modulators and XG status
     */
    public readonly parentSoundBank: BasicSoundBank;

    /**
     * The preset's name
     */
    public name: string = "";

    /**
     * The preset's MIDI program number
     */
    public program: number = 0;

    /**
     * The preset's MIDI bank number
     */
    public bank: number = 0;

    /**
     * The preset's zones
     */
    public zones: BasicPresetZone[] = [];

    /**
     * Preset's global zone
     */
    public readonly globalZone: BasicGlobalZone = new BasicGlobalZone();

    /**
     * unused metadata
     */
    public library: number = 0;
    /**
     * unused metadata
     */
    public genre: number = 0;
    /**
     * unused metadata
     */
    public morphology: number = 0;

    /**
     * Creates a new preset representation.
     * @param parentSoundBank the sound bank this preset belongs to.
     */
    public constructor(parentSoundBank: BasicSoundBank) {
        this.parentSoundBank = parentSoundBank;
    }

    /**
     * Checks if this preset is a drum preset
     * @param allowXG if the Yamaha XG system is allowed
     * @param allowSFX if the XG SFX drum preset is allowed
     */
    public isDrumPreset(allowXG: boolean, allowSFX: boolean = false): boolean {
        const xg = allowXG && this.parentSoundBank.isXGBank;
        // sfx is not cool
        return (
            this.bank === 128 ||
            (xg && isXGDrums(this.bank) && (this.bank !== 126 || allowSFX))
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
         * global zone is always first, so it or nothing
         */
        const globalPresetGenerators: Generator[] = [
            ...this.globalZone.generators
        ];

        const globalPresetModulators: Modulator[] = [
            ...this.globalZone.modulators
        ];
        const globalKeyRange = this.globalZone.keyRange;
        const globalVelRange = this.globalZone.velRange;

        // find the preset zones in range
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
            // the global zone is already taken into account earlier
            if (!instrument || instrument.zones.length < 1) {
                return;
            }
            const presetGenerators = presetZone.generators;
            const presetModulators = presetZone.modulators;
            /**
             * global zone is always first, so it or nothing
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
                // add the unique global preset generators (local replace global(

                // add the unique global instrument generators (local replace global)
                addUnique(instrumentGenerators, globalInstrumentGenerators);

                addUniqueMods(presetModulators, globalPresetModulators);
                addUniqueMods(instrumentModulators, globalInstrumentModulators);

                // default mods
                addUniqueMods(
                    instrumentModulators,
                    this.parentSoundBank.defaultModulators
                );

                /**
                 * sum preset modulators to instruments (amount) sf spec page 54
                 */
                const finalModulatorList: Modulator[] = [
                    ...instrumentModulators
                ];
                for (let i = 0; i < presetModulators.length; i++) {
                    const mod = presetModulators[i];
                    const identicalInstrumentModulator =
                        finalModulatorList.findIndex((m) =>
                            Modulator.isIdentical(mod, m)
                        );
                    if (identicalInstrumentModulator !== -1) {
                        // sum the amounts
                        // this makes a new modulator
                        // because otherwise it would overwrite the one in the soundfont!
                        finalModulatorList[identicalInstrumentModulator] =
                            finalModulatorList[
                                identicalInstrumentModulator
                            ].sumTransform(mod);
                    } else {
                        finalModulatorList.push(mod);
                    }
                }

                if (instrumentZone.sample) {
                    // combine both generators and add to the final result
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
}
