/**
 * Instrument_zones.ts
 * purpose: reads instrument zones from soundfont and gets their respective samples and generators and modulators
 */
import type { SoundFontInstrument } from "./instruments";
import type { BasicSample } from "../../basic_soundbank/basic_sample";
import type { Modulator } from "../../basic_soundbank/modulator";
import type { Generator } from "../../basic_soundbank/generator";
import { generatorTypes } from "../../basic_soundbank/generator_types";

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
            // Check for global zone
            if (gens.some((g) => g.generatorType === generatorTypes.sampleID)) {
                // Regular zone
                instrument.createSoundFontZone(mods, gens, samples);
            } else {
                // global zone
                instrument.globalZone.addGenerators(...gens);
                instrument.globalZone.addModulators(...mods);
            }
        }
    }
}
