import { RiffChunk } from "../basic_soundbank/riff_chunk";
import { readLittleEndian } from "../../utils/byte_functions/little_endian";
import { readBytesAsString } from "../../utils/byte_functions/string";
import { BasicPreset } from "../basic_soundbank/basic_preset";
import { SoundFontPresetZone } from "./preset_zones";
import type { BasicSoundBank } from "../basic_soundbank/basic_soundbank";
import type { BasicInstrument } from "../basic_soundbank/basic_instrument";
import type { Modulator } from "../basic_soundbank/modulator";
import type { Generator } from "../basic_soundbank/generator";

/**
 * parses soundfont presets, also includes function for getting the generators and samples from midi note and velocity
 */

export class SoundFontPreset extends BasicPreset {
    zoneStartIndex: number;
    zonesCount: number = 0;

    /**
     * Creates a preset
     */
    constructor(presetChunk: RiffChunk, sf2: BasicSoundBank) {
        super(sf2);
        this.presetName = readBytesAsString(presetChunk.chunkData, 20).replace(
            /\d{3}:\d{3}/,
            ""
        ); // remove those pesky "000:001"

        this.program = readLittleEndian(presetChunk.chunkData, 2);
        this.bank = readLittleEndian(presetChunk.chunkData, 2);
        this.zoneStartIndex = readLittleEndian(presetChunk.chunkData, 2);

        // read the dword
        this.library = readLittleEndian(presetChunk.chunkData, 4);
        this.genre = readLittleEndian(presetChunk.chunkData, 4);
        this.morphology = readLittleEndian(presetChunk.chunkData, 4);
    }

    createSoundFontZone(
        modulators: Modulator[],
        generators: Generator[],
        instruments: BasicInstrument[]
    ): SoundFontPresetZone {
        const z = new SoundFontPresetZone(
            this,
            modulators,
            generators,
            instruments
        );
        this.presetZones.push(z);
        return z;
    }
}

/**
 * Reads the presets
 */
export function readPresets(
    presetChunk: RiffChunk,
    parent: BasicSoundBank
): SoundFontPreset[] {
    const presets: SoundFontPreset[] = [];
    while (presetChunk.chunkData.length > presetChunk.chunkData.currentIndex) {
        const preset = new SoundFontPreset(presetChunk, parent);
        if (presets.length > 0) {
            const previous = presets[presets.length - 1];
            previous.zonesCount =
                preset.zoneStartIndex - previous.zoneStartIndex;
        }
        presets.push(preset);
    }
    // remove EOP
    presets.pop();
    return presets;
}
