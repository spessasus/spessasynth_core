/**
 * instrument_zones.js
 * purpose: reads instrument zones from soundfont and gets their respective samples and generators and modulators
 */
import { BasicInstrumentZone } from "../basic_soundbank/basic_instrument_zone";
import type { SoundFontInstrument } from "./instruments";
import type { BasicSample } from "../basic_soundbank/basic_sample";
import type { Modulator } from "../basic_soundbank/modulator";
import type { Generator } from "../basic_soundbank/generator";
import type { BasicInstrument } from "../basic_soundbank/basic_instrument";
import { generatorTypes } from "../basic_soundbank/generator_types";

export class SoundFontInstrumentZone extends BasicInstrumentZone {
    /**
     * Creates a zone (instrument)
     */
    public constructor(
        inst: BasicInstrument,
        modulators: Modulator[],
        generators: Generator[],
        samples: BasicSample[]
    ) {
        const sampleID = generators.find(
            (g) => g.generatorType === generatorTypes.sampleID
        );
        let sample = undefined;
        if (sampleID) {
            sample = samples[sampleID.generatorValue];
        } else {
            throw new Error("No sample ID found in instrument zone.");
        }
        super(inst, sample);
        this.addGenerators(...generators);
        this.addModulators(...modulators);
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
                instrument.createSoundFontZone(mods, gens, samples);
            } else {
                // global zone
                instrument.globalZone.addGenerators(...gens);
                instrument.globalZone.addModulators(...mods);
            }
        }
    }
}
