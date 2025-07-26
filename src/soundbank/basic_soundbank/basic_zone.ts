import { generatorTypes } from "./generator_types";
import { Generator } from "./generator";
import { Modulator } from "./modulator";

import type { KeyRange } from "../../utils/global_types";

export class BasicZone {
    /**
     * The zone's velocity range
     * min -1 means that it is a default value
     */
    velRange: KeyRange = { min: -1, max: 127 };

    /**
     * The zone's key range
     * min -1 means that it is a default value
     */
    keyRange: KeyRange = { min: -1, max: 127 };

    /**
     * The zone's generators
     */
    generators: Generator[] = [];
    /**
     * The zone's modulators
     */
    modulators: Modulator[] = [];

    get hasKeyRange(): boolean {
        return this.keyRange.min !== -1;
    }

    get hasVelRange(): boolean {
        return this.velRange.min !== -1;
    }

    /**
     * Adds at the start
     */
    prependGenerator(generator: Generator) {
        this.generators.unshift(generator);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Sets a generator to a given value if preset, otherwise adds a new one.
     */
    setGenerator(type: generatorTypes, value: number) {
        switch (type) {
            case generatorTypes.sampleID:
                throw new Error("Use setSample()");
            case generatorTypes.instrument:
                throw new Error("Use setInstrument()");

            case generatorTypes.velRange:
            case generatorTypes.keyRange:
                throw new Error("Set the range manually");
        }
        const generator = this.generators.find((g) => g.generatorType === type);
        if (generator) {
            generator.generatorValue = value;
        } else {
            this.addGenerators(new Generator(type, value));
        }
    }

    addGenerators(...generators: Generator[]) {
        generators.forEach((g) => {
            switch (g.generatorType) {
                default:
                    this.generators.push(g);
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

    addModulators(...modulators: Modulator[]) {
        this.modulators.push(...modulators);
    }

    getGeneratorValue(
        generatorType: generatorTypes,
        notFoundValue: number
    ): number {
        return (
            this.generators.find((g) => g.generatorType === generatorType)
                ?.generatorValue ?? notFoundValue
        );
    }

    copyFrom(zone: BasicZone) {
        this.generators = [...zone.generators];
        this.modulators = zone.modulators.map((m) => Modulator.copy(m));
        this.velRange = { ...zone.velRange };
        this.keyRange = { ...zone.keyRange };
    }
}
