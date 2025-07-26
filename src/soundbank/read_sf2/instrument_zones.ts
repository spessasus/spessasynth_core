/**
 * instrument_zones.js
 * purpose: reads instrument zones from soundfont and gets their respective samples and generators and modulators
 */
import { BasicInstrumentZone } from "../basic_soundbank/basic_instrument_zone.js";
import { generatorTypes } from "../basic_soundbank/generator_types.js";
import type { SoundFontInstrument } from "./instruments.ts";
import type { BasicSample } from "../basic_soundbank/basic_sample.ts";
import type { Modulator } from "../basic_soundbank/modulator.ts";
import type { Generator } from "../basic_soundbank/generator.ts";

export class SoundFontInstrumentZone extends BasicInstrumentZone {
    /**
     * Creates a zone (instrument)
     */
    constructor(inst: SoundFontInstrument) {
        super(inst);
    }

    /**
     * Loads the zone's sample
     */
    getSample(samples: BasicSample[]) {
        const sampleID = this.generators.find(
            (g) => g.generatorType === generatorTypes.sampleID
        );
        if (sampleID) {
            this.setSample(samples[sampleID.generatorValue]);
        }
    }
}

/**
 * Reads the given instrument zone
 */
export function applyInstrumentZones(
    indexes: { mod: number[]; gen: number[] },
    instrumentGenerators: Generator[],
    instrumentModulators: Modulator[],
    samples: BasicSample[],
    instruments: SoundFontInstrument[]
) {
    const genStartIndexes = indexes.gen;
    const modStartIndexes = indexes.mod;

    let modIndex = 0;
    let genIndex = 0;
    for (const instrument of instruments) {
        for (let i = 0; i < instrument.zonesCount; i++) {
            const gensStart = genStartIndexes[genIndex++];
            const gensEnd = genStartIndexes[genIndex];
            const gens = instrumentGenerators.slice(gensStart, gensEnd);
            const modsStart = modStartIndexes[modIndex++];
            const modsEnd = modStartIndexes[modIndex];
            const mods = instrumentModulators.slice(modsStart, modsEnd);
            // check for global zone
            if (gens.find((g) => g.generatorType === generatorTypes.sampleID)) {
                // regular zone
                const zone = instrument.createZone();
                zone.addGenerators(...gens);
                zone.addModulators(...mods);
                zone.getSample(samples);
            } else {
                // global zone
                instrument.globalZone.addGenerators(...gens);
                instrument.globalZone.addModulators(...mods);
            }
        }
    }
}
