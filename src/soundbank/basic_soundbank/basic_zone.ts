import {
    generatorLimits,
    type GeneratorType,
    generatorTypes
} from "./generator_types";
import { Generator } from "./generator";
import { Modulator } from "./modulator";

import type { GenericRange } from "../types";
import type { IndexedByteArray } from "../../utils/indexed_array";
import type {
    ExtendedSF2Chunks,
    SoundFontWriteIndexes
} from "../soundfont/write/types";
import type { BasicSoundBank } from "./basic_soundbank";
import { writeWord } from "../../utils/byte_functions/little_endian";

export const BAG_BYTE_SIZE = 4;

export class BasicZone {
    /**
     * The zone's velocity range.
     * min -1 means that it is a default value
     */
    public velRange: GenericRange = { min: -1, max: 127 };

    /**
     * The zone's key range.
     * min -1 means that it is a default value.
     */
    public keyRange: GenericRange = { min: -1, max: 127 };

    /**
     * The zone's generators.
     */
    public generators: Generator[] = [];
    /**
     * The zone's modulators.
     */
    public modulators: Modulator[] = [];

    public get hasKeyRange(): boolean {
        return this.keyRange.min !== -1;
    }

    public get hasVelRange(): boolean {
        return this.velRange.min !== -1;
    }

    /**
     * The current tuning in cents, taking in both coarse and fine generators.
     */
    public get fineTuning() {
        const currentCoarse = this.getGenerator(generatorTypes.coarseTune, 0);
        const currentFine = this.getGenerator(generatorTypes.fineTune, 0);
        return currentCoarse * 100 + currentFine;
    }

    /**
     * The current tuning in cents, taking in both coarse and fine generators.
     */
    public set fineTuning(tuningCents: number) {
        const coarse = Math.trunc(tuningCents / 100);
        const fine = tuningCents % 100;
        this.setGenerator(generatorTypes.coarseTune, coarse);
        this.setGenerator(generatorTypes.fineTune, fine);
    }

    /**
     * Adds to a given generator, or its default value.
     */
    public addToGenerator(type: GeneratorType, value: number, validate = true) {
        const genValue = this.getGenerator(type, generatorLimits[type].def);
        this.setGenerator(type, value + genValue, validate);
    }

    /**
     * Sets a generator to a given value if preset, otherwise adds a new one.
     */
    public setGenerator(
        type: GeneratorType,
        value: number | null,
        validate = true
    ) {
        switch (type) {
            case generatorTypes.sampleID:
                throw new Error("Use setSample()");
            case generatorTypes.instrument:
                throw new Error("Use setInstrument()");

            case generatorTypes.velRange:
            case generatorTypes.keyRange:
                throw new Error("Set the range manually");
        }
        if (value === null) {
            this.generators = this.generators.filter(
                (g) => g.generatorType !== type
            );
            return;
        }
        const index = this.generators.findIndex(
            (g) => g.generatorType === type
        );
        if (index >= 0) {
            this.generators[index] = new Generator(type, value, validate);
        } else {
            this.addGenerators(new Generator(type, value, validate));
        }
    }

    /**
     * Adds generators to the zone.
     * @param generators
     */
    public addGenerators(...generators: Generator[]) {
        generators.forEach((g) => {
            switch (g.generatorType) {
                default:
                    this.generators.push(g);
                    break;

                case generatorTypes.sampleID:
                case generatorTypes.instrument:
                    // Don't add these, they already have their own properties
                    break;

                case generatorTypes.velRange:
                    this.velRange.min = g.generatorValue & 0x7f;
                    this.velRange.max = (g.generatorValue >> 8) & 0x7f;
                    break;

                case generatorTypes.keyRange:
                    this.keyRange.min = g.generatorValue & 0x7f;
                    this.keyRange.max = (g.generatorValue >> 8) & 0x7f;
            }
        });
    }

    public addModulators(...modulators: Modulator[]) {
        this.modulators.push(...modulators);
    }

    public getGenerator<K>(
        generatorType: GeneratorType,
        notFoundValue: number | K
    ): number | K {
        return (
            this.generators.find((g) => g.generatorType === generatorType)
                ?.generatorValue ?? notFoundValue
        );
    }

    public copyFrom(zone: BasicZone) {
        this.generators = zone.generators.map(
            (g) => new Generator(g.generatorType, g.generatorValue, false)
        );
        this.modulators = zone.modulators.map(
            Modulator.copyFrom.bind(Modulator)
        );
        this.velRange = { ...zone.velRange };
        this.keyRange = { ...zone.keyRange };
    }

    public getGenCount() {
        let count = this.generators.filter(
            (g) =>
                g.generatorType !== generatorTypes.sampleID &&
                g.generatorType !== generatorTypes.instrument &&
                g.generatorType !== generatorTypes.keyRange &&
                g.generatorType !== generatorTypes.velRange
        ).length;
        if (this.hasVelRange) {
            count++;
        }
        if (this.hasKeyRange) {
            count++;
        }
        return count;
    }

    public write(
        genData: IndexedByteArray,
        modData: IndexedByteArray,
        bagData: ExtendedSF2Chunks,
        indexes: SoundFontWriteIndexes,
        bank: BasicSoundBank
    ) {
        const generatorIndex = indexes.gen;
        const modulatorIndex = indexes.mod;
        // Bottom WORD: regular ibag
        writeWord(bagData.pdta, generatorIndex & 0xffff);
        writeWord(bagData.pdta, modulatorIndex & 0xffff);
        // Top WORD: extended ibag
        writeWord(bagData.xdta, generatorIndex >> 16);
        writeWord(bagData.xdta, modulatorIndex >> 16);
        indexes.bag++;

        // Write generators and modulators
        const gens = this.getWriteGenerators(bank);
        gens.forEach((g) => g.write(genData, indexes));
        this.modulators.forEach((m) => m.write(modData, indexes));
    }

    /**
     * Filters the generators and prepends the range generators.
     */
    protected getWriteGenerators(bank: BasicSoundBank) {
        const generators = this.generators.filter(
            (g) =>
                g.generatorType !== generatorTypes.sampleID &&
                g.generatorType !== generatorTypes.instrument &&
                g.generatorType !== generatorTypes.keyRange &&
                g.generatorType !== generatorTypes.velRange
        );

        // Instrument and preset zones use this parameter!
        // So "use" it here to please eslint
        if (!bank) {
            throw new Error("No bank provided! ");
        }
        void bank;

        // Unshift vel then key (to make key first)
        if (this.hasVelRange) {
            generators.unshift(
                new Generator(
                    generatorTypes.velRange,
                    (this.velRange.max << 8) | Math.max(this.velRange.min, 0),
                    false
                )
            );
        }
        if (this.hasKeyRange) {
            generators.unshift(
                new Generator(
                    generatorTypes.keyRange,
                    (this.keyRange.max << 8) | Math.max(this.keyRange.min, 0),
                    false
                )
            );
        }
        return generators;
    }
}
