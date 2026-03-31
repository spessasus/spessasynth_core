import { RIFFChunk } from "../../../utils/riff_chunk";
import { readLittleEndianIndexed } from "../../../utils/byte_functions/little_endian";
import { readBinaryStringIndexed } from "../../../utils/byte_functions/string";
import { BasicPreset } from "../../basic_soundbank/basic_preset";
import type { BasicSoundBank } from "../../basic_soundbank/basic_soundbank";
import type { BasicInstrument } from "../../basic_soundbank/basic_instrument";
import type { Modulator } from "../../basic_soundbank/modulator";
import type { Generator } from "../../basic_soundbank/generator";
import { BasicPresetZone } from "../../basic_soundbank/basic_preset_zone";
import { generatorTypes } from "../../basic_soundbank/generator_types";

/**
 * Parses soundfont presets, also includes function for getting the generators and samples from midi note and velocity
 */

export class SoundFontPreset extends BasicPreset {
    public zoneStartIndex: number;
    public zonesCount = 0;

    /**
     * Creates a preset
     */
    public constructor(presetChunk: RIFFChunk, sf2: BasicSoundBank) {
        super(sf2);
        this.name = readBinaryStringIndexed(presetChunk.data, 20).replace(
            /\d{3}:\d{3}/,
            ""
        ); // Remove those pesky "000:001"

        this.program = readLittleEndianIndexed(presetChunk.data, 2);
        const wBank = readLittleEndianIndexed(presetChunk.data, 2);
        this.bankMSB = wBank & 0x7f;
        this.isGMGSDrum = (wBank & 0x80) > 0;
        this.bankLSB = wBank >> 8;

        this.zoneStartIndex = readLittleEndianIndexed(presetChunk.data, 2);

        // Read the dword
        this.library = readLittleEndianIndexed(presetChunk.data, 4);
        this.genre = readLittleEndianIndexed(presetChunk.data, 4);
        this.morphology = readLittleEndianIndexed(presetChunk.data, 4);
    }

    public createSoundFontZone(
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
        const z = new BasicPresetZone(this, instrument);
        z.addGenerators(...generators);
        z.addModulators(...modulators);
        this.zones.push(z);
        return z;
    }
}

/**
 * Reads the presets
 */
export function readPresets(
    presetChunk: RIFFChunk,
    parent: BasicSoundBank
): SoundFontPreset[] {
    const presets: SoundFontPreset[] = [];
    while (presetChunk.data.length > presetChunk.data.currentIndex) {
        const preset = new SoundFontPreset(presetChunk, parent);
        if (presets.length > 0) {
            const previous = presets[presets.length - 1];
            previous.zonesCount =
                preset.zoneStartIndex - previous.zoneStartIndex;
        }
        presets.push(preset);
    }
    // Remove EOP
    presets.pop();
    return presets;
}
