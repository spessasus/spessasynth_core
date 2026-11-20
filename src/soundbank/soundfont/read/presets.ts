import { SpessaLog } from "../../../utils/loggin";
import { RIFFChunk } from "../../../utils/riff_chunk";
import { readLittleEndianIndexed } from "../../../utils/byte_functions/little_endian";
import { readBinaryStringIndexed } from "../../../utils/byte_functions/string";
import { BasicPreset } from "../../basic_soundbank/basic_preset";
import type { BasicSoundBank } from "../../basic_soundbank/basic_soundbank";
import type { BasicInstrument } from "../../basic_soundbank/basic_instrument";
import type { Modulator } from "../../basic_soundbank/modulator";
import type { Generator } from "../../basic_soundbank/generator";
import { BasicPresetZone } from "../../basic_soundbank/basic_preset_zone";
import { knownGenerators, readZoneIndex } from "./generators";
import { GeneratorTypes } from "../../basic_soundbank/generator_types";

/**
 * Parses soundfont presets
 */

export class SoundFontPreset extends BasicPreset {
    public zoneStartIndex: number;
    public zonesCount = 0;

    /**
     * Creates a preset
     */
    public constructor(presetChunk: RIFFChunk, sf2: BasicSoundBank) {
        super(sf2);
        this.name = readBinaryStringIndexed(presetChunk.data, 20);

        this.program = readLittleEndianIndexed(presetChunk.data, 2);
        const wBank = readLittleEndianIndexed(presetChunk.data, 2);
        this.bankMSB = wBank & 0x7f;
        this.isGMGSDrum = (wBank & 0x80) > 0;
        // Bit 15 is reserved
        this.bankLSB = (wBank >> 8) & 0x7f;

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
            (g) => g.type === GeneratorTypes.instrument
        );
        if (!instrumentID) {
            throw new Error("No instrument ID found in preset zone.");
        }
        // Unsigned, with instrumentMSB as the top 16 bits (SFe 4.0, section 7.1.1)
        const index = readZoneIndex(
            generators,
            instrumentID,
            GeneratorTypes.instrumentMSB
        );
        const instrument = instruments[index];
        // A zone whose index refers past the instruments is ignored (SFe 4.0, section 7.1.1)
        if (!instrument) {
            SpessaLog.warn(
                `Invalid instrument ID: ${index}, available instruments: ${instruments.length}. Ignoring the zone.`
            );
            return;
        }
        const z = new BasicPresetZone(this, instrument);
        // Unknown generators are ignored, and so is everything after the index, as in SF2 (SFe 4.0, section 7.1.1)
        z.addGenerators(
            ...knownGenerators(
                generators.slice(0, generators.indexOf(instrumentID) + 1)
            )
        );
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
    keepTerminal = false
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
    if (!keepTerminal) presets.pop();
    return presets;
}
