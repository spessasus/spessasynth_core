import { BasicPresetZone } from "../../basic_soundbank/basic_preset_zone";
import { Generator } from "../../basic_soundbank/generator";
import { Modulator } from "../../basic_soundbank/modulator";
import type { BasicPreset } from "../../basic_soundbank/basic_preset";
import type { BasicInstrument } from "../../basic_soundbank/basic_instrument";
import type { SoundFontPreset } from "./presets";
import { generatorTypes } from "../../basic_soundbank/generator_types";

/**
 * Preset_zones.ts
 * purpose: reads preset zones from soundfont and gets their respective samples and generators and modulators
 */

export class SoundFontPresetZone extends BasicPresetZone {
    /**
     * Creates a zone (preset)
     */
    public constructor(
        preset: BasicPreset,
        modulators: Modulator[],
        generators: Generator[],
        instruments: BasicInstrument[]
    ) {
        const instrumentID = generators.find(
            (g) => g.generatorType === generatorTypes.instrument
        );
        let instrument;
        if (instrumentID) {
            instrument = instruments[instrumentID.generatorValue];
        } else {
            throw new Error("No instrument ID found in preset zone.");
        }
        if (!instrument) {
            throw new Error(
                `Invalid instrument ID: ${instrumentID.generatorValue}, available instruments: ${instruments.length}`
            );
        }
        super(preset, instrument);
        this.addGenerators(...generators);
        this.addModulators(...modulators);
    }
}

/**
 * Reads the given preset zone
 */
export function applyPresetZones(
    indexes: { mod: number[]; gen: number[] },
    presetGens: Generator[],
    presetMods: Modulator[],
    instruments: BasicInstrument[],
    presets: SoundFontPreset[]
) {
    const genStartIndexes = indexes.gen;
    const modStartIndexes = indexes.mod;

    let modIndex = 0;
    let genIndex = 0;
    for (const preset of presets) {
        for (let i = 0; i < preset.zonesCount; i++) {
            const gensStart = genStartIndexes[genIndex++];
            const gensEnd = genStartIndexes[genIndex];
            const gens = presetGens.slice(gensStart, gensEnd);
            const modsStart = modStartIndexes[modIndex++];
            const modsEnd = modStartIndexes[modIndex];
            const mods = presetMods.slice(modsStart, modsEnd);
            // Check for global zone
            if (
                gens.some((g) => g.generatorType === generatorTypes.instrument)
            ) {
                // Regular zone
                preset.createSoundFontZone(mods, gens, instruments);
            } else {
                // global zone
                preset.globalZone.addGenerators(...gens);
                preset.globalZone.addModulators(...mods);
            }
        }
    }
}
