import { BasicPresetZone } from "../basic_soundbank/basic_preset_zone.js";
import { Generator } from "../basic_soundbank/generator.js";
import { Modulator } from "../basic_soundbank/modulator.js";
import { generatorTypes } from "../basic_soundbank/generator_types.js";

/**
 * preset_zones.js
 * purpose: reads preset zones from soundfont and gets their respective samples and generators and modulators
 */

export class PresetZone extends BasicPresetZone {
    /**
     * Creates a zone (preset)
     * @param preset {BasicPreset}
     */
    constructor(preset) {
        super(preset);
    }

    /**
     * grab the instrument
     * @param instruments {BasicInstrument[]}
     */
    getInstrument(instruments) {
        const instrumentID = this.generators.find(
            (g) => g.generatorType === generatorTypes.instrument
        );
        if (instrumentID) {
            this.setInstrument(instruments[instrumentID.generatorValue]);
        }
    }
}

/**
 * Reads the given preset zone
 * @param indexes {{mod: number[], gen: number[]}}
 * @param presetGens {Generator[]}
 * @param instruments {BasicInstrument[]}
 * @param presetMods {Modulator[]}
 * @param presets {Preset[]}
 */
export function applyPresetZones(
    indexes,
    presetGens,
    presetMods,
    instruments,
    presets
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
            // check for global zone
            if (
                gens.find(
                    (g) => g.generatorType === generatorTypes.instrument
                ) !== undefined
            ) {
                // regular zone
                const zone = preset.createZone();
                zone.addGenerators(...gens);
                zone.addModulators(...mods);
                zone.getInstrument(instruments);
            } else {
                // global zone
                preset.globalZone.addGenerators(...gens);
                preset.globalZone.addModulators(...mods);
            }
        }
    }
}
