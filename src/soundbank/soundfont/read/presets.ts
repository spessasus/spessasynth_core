import { RIFFChunk } from "../../../utils/riff_chunk";
import { readLittleEndianIndexed } from "../../../utils/byte_functions/little_endian";
import { decodeUtf8 } from "../../../utils/byte_functions/string";
import { BasicPreset } from "../../basic_soundbank/basic_preset";
import { IndexedByteArray } from "../../../utils/indexed_array";
import type { BasicSoundBank } from "../../basic_soundbank/basic_soundbank";
import type { BasicInstrument } from "../../basic_soundbank/basic_instrument";
import type { Modulator } from "../../basic_soundbank/modulator";
import type { Generator } from "../../basic_soundbank/generator";
import { BasicPresetZone } from "../../basic_soundbank/basic_preset_zone";
import { GeneratorTypes } from "../../basic_soundbank/generator_types";

/**
 * Parses soundfont presets, also includes function for getting the generators and samples from midi note and velocity
 */

export class SoundFontPreset extends BasicPreset {
    public zoneStartIndex: number;
    public zonesCount = 0;

    /**
     * Creates a preset
     */
    public constructor(presetChunk: RIFFChunk, sf2: BasicSoundBank, xphdrChunk: RIFFChunk | undefined) {
        super(sf2);

        const presetNameArray = new IndexedByteArray(40);
        presetNameArray.set(presetChunk.data.slice(presetChunk.data.currentIndex, presetChunk.data.currentIndex + 20), 0)
        presetChunk.data.currentIndex += 20;
        if (xphdrChunk) {
            presetNameArray.set(xphdrChunk.data.slice(xphdrChunk.data.currentIndex, xphdrChunk.data.currentIndex + 20), 20);
            xphdrChunk.data.currentIndex += 20;
        }
        const decodedName = decodeUtf8(presetNameArray) ?? "Preset";
        this.name = decodedName.replace(
            /\d{3}:\d{3}/,
            ""
        ); // Remove those pesky "000:001"

        this.program = readLittleEndianIndexed(presetChunk.data, 2); 
        const wBank = readLittleEndianIndexed(presetChunk.data, 2);
        this.bankMSB = wBank & 0x7f;
        this.isGMGSDrum = (wBank & 0x80) > 0;
        this.bankLSB = wBank >> 8;
        // Skip wProgram and wBank on xdta for now 
        if (xphdrChunk) {
            xphdrChunk.data.currentIndex += 4;
        }

        this.zoneStartIndex = readLittleEndianIndexed(presetChunk.data, 2);
        if (xphdrChunk)
        {
            const xZoneStartIndex = readLittleEndianIndexed(xphdrChunk.data, 2);
            this.zoneStartIndex += xZoneStartIndex << 16;
        }
        // Read the dword
        this.library = readLittleEndianIndexed(presetChunk.data, 4);
        this.genre = readLittleEndianIndexed(presetChunk.data, 4);
        this.morphology = readLittleEndianIndexed(presetChunk.data, 4);
        // Skip unused variables
        if (xphdrChunk) {
            xphdrChunk.data.currentIndex += 12;
        }
    }

    public createSoundFontZone(
        modulators: Modulator[],
        generators: Generator[],
        instruments: BasicInstrument[]
    ) {
        const instrumentID = generators.find(
            (g) => g.type === GeneratorTypes.instrument
        );
        let instrument;
        if (instrumentID) {
            instrument = instruments[instrumentID.value];
        } else {
            throw new Error("No instrument ID found in preset zone.");
        }
        if (!instrument) {
            throw new Error(
                `Invalid instrument ID: ${instrumentID.value}, available instruments: ${instruments.length}`
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
    parent: BasicSoundBank,
    useXdta = false,
    xdtaChunk: RIFFChunk | undefined = undefined,
    is64Bit = false
): SoundFontPreset[] {
    console.log(is64Bit);
    const presets: SoundFontPreset[] = [];
    while (presetChunk.data.length > presetChunk.data.currentIndex) {
        let preset;
        if (useXdta && xdtaChunk) {
            preset = new SoundFontPreset(presetChunk, parent, xdtaChunk);
        } else {
            preset = new SoundFontPreset(presetChunk, parent, undefined);
        }
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
