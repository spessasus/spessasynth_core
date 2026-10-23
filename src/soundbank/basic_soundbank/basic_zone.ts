import {
    GeneratorLimits,
    type GeneratorType,
    GeneratorTypes
} from "./generator_types";
import { Generator } from "./generator";
import { Modulator } from "./modulator";

import type { GenericRange } from "../types";
import type { BasicSoundBank } from "./basic_soundbank";

export const BAG_BYTE_SIZE = 4;

/**
 * Represents a single zone with parameters, modulators and a specified key and velocity range.
 *
 * @group Sound Banks.Zones
 */
export class BasicZone {
    /**
     * The zone's velocity range.
     * min -1 means that it is a default value.
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

    /**
     * True if this zone has a key range explicitly set.
     */
    public get hasKeyRange(): boolean {
        return this.keyRange.min !== -1;
    }

    /**
     * True if this zone has a velocity range explicitly set.
     */
    public get hasVelRange(): boolean {
        return this.velRange.min !== -1;
    }

    /**
     * The current tuning in cents, taking in both coarse and fine generators.
     * Setting this value updates both generators accordingly.
     */
    public get fineTuning() {
        const currentCoarse = this.getGenerator(GeneratorTypes.coarseTune, 0);
        const currentFine = this.getGenerator(GeneratorTypes.fineTune, 0);
        return currentCoarse * 100 + currentFine;
    }

    /**
     * The current tuning in cents, taking in both coarse and fine generators.
     * Setting this value updates both generators accordingly.
     */
    public set fineTuning(tuningCents: number) {
        const coarse = Math.trunc(tuningCents / 100);
        const fine = tuningCents % 100;
        this.setGenerator(GeneratorTypes.coarseTune, coarse);
        this.setGenerator(GeneratorTypes.fineTune, fine);
    }

    /**
     * Adds to a given generator, or its default value.
     * @param type The generator type.
     * @param value The value to add.
     * @param validate If the value should be clamped to allowed limits.
     */
    public addToGenerator(type: GeneratorType, value: number, validate = true) {
        const genValue = this.getGenerator(type, GeneratorLimits[type].def);
        this.setGenerator(type, value + genValue, validate);
    }

    /**
     * Sets a generator to a given value, overwriting existing one if present.
     * @param type The generator type.
     * @param value The value to set. Set to `null` to remove this generator (set as "unset").
     * @param validate If the value should be clamped to allowed limits.
     */
    public setGenerator(
        type: GeneratorType,
        value: number | null,
        validate = true
    ) {
        switch (type) {
            case GeneratorTypes.sampleID: {
                throw new Error("Use setSample()");
            }
            case GeneratorTypes.instrument: {
                throw new Error("Use setInstrument()");
            }

            case GeneratorTypes.velRange:
            case GeneratorTypes.keyRange: {
                throw new Error("Set the range manually");
            }
        }
        if (value === null) {
            this.generators = this.generators.filter((g) => g.type !== type);
            return;
        }
        const index = this.generators.findIndex((g) => g.type === type);
        if (index === -1) {
            this.addGenerators(new Generator(type, value, validate));
        } else {
            this.generators[index] = new Generator(type, value, validate);
        }
    }

    /**
     * Adds generators to the zone. Performs a sanity check to only add value generators, not ranges or indexes.
     * @param generators The generators to add.
     * @internal
     */
    public addGenerators(...generators: Generator[]) {
        for (const g of generators) {
            switch (g.type) {
                default: {
                    this.generators.push(g);
                    break;
                }

                case GeneratorTypes.sampleID:
                case GeneratorTypes.instrument: {
                    // Don't add these, they already have their own properties
                    break;
                }

                case GeneratorTypes.velRange: {
                    this.velRange.min = g.value & 0x7f;
                    this.velRange.max = (g.value >> 8) & 0x7f;
                    break;
                }

                case GeneratorTypes.keyRange: {
                    this.keyRange.min = g.value & 0x7f;
                    this.keyRange.max = (g.value >> 8) & 0x7f;
                }
            }
        }
    }

    /**
     * Adds modulators to the zone.
     * @param modulators The modulators to add.
     * @internal
     */
    public addModulators(...modulators: Modulator[]) {
        this.modulators.push(...modulators);
    }

    /**
     * Gets a generator value.
     * @param generatorType The generator type.
     * @param notFoundValue If the generator is not found, this value is returned.
     * A default value can be passed here, or `null` for example,
     * to check if the generator is set.
     * @returns The generator value or the provided fallback value.
     */
    public getGenerator<K>(
        generatorType: GeneratorType,
        notFoundValue: number | K
    ): number | K {
        return (
            this.generators.find((g) => g.type === generatorType)?.value ??
            notFoundValue
        );
    }

    /**
     * Copies the parameters from another zone.
     * @param zone The zone to copy from.
     * @internal
     */
    public copyFrom(zone: BasicZone) {
        this.generators = zone.generators.map(
            (g) => new Generator(g.type, g.value, false)
        );
        this.modulators = zone.modulators.map(
            Modulator.copyFrom.bind(Modulator)
        );
        this.velRange = { ...zone.velRange };
        this.keyRange = { ...zone.keyRange };
    }

    /**
     * Filters the generators and prepends the range generators.
     * @internal
     */
    public getWriteGenerators(bank: BasicSoundBank) {
        const generators = this.generators.filter(
            (g) =>
                g.type !== GeneratorTypes.sampleID &&
                g.type !== GeneratorTypes.instrument &&
                g.type !== GeneratorTypes.keyRange &&
                g.type !== GeneratorTypes.velRange
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
                    GeneratorTypes.velRange,
                    (this.velRange.max << 8) | Math.max(this.velRange.min, 0),
                    false
                )
            );
        }
        if (this.hasKeyRange) {
            generators.unshift(
                new Generator(
                    GeneratorTypes.keyRange,
                    (this.keyRange.max << 8) | Math.max(this.keyRange.min, 0),
                    false
                )
            );
        }
        return generators;
    }
}
