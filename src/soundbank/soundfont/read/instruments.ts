import { SpessaLog } from "../../../utils/loggin";
import { RIFFChunk } from "../../../utils/riff_chunk";
import { readLittleEndianIndexed } from "../../../utils/byte_functions/little_endian";
import { readBinaryStringIndexed } from "../../../utils/byte_functions/string";
import { BasicInstrument } from "../../basic_soundbank/basic_instrument";
import type { BasicSample } from "../../basic_soundbank/basic_sample";
import type { Modulator } from "../../basic_soundbank/modulator";
import type { Generator } from "../../basic_soundbank/generator";
import { BasicInstrumentZone } from "../../basic_soundbank/basic_instrument_zone";
import { knownGenerators, readZoneIndex } from "./generators";
import { GeneratorTypes } from "../../basic_soundbank/generator_types";

/**
 * Instrument.ts
 * purpose: parses soundfont instrument and stores them as a class
 */

export class SoundFontInstrument extends BasicInstrument {
    public zoneStartIndex: number;

    public zonesCount = 0;

    /**
     * Creates an instrument
     */
    public constructor(instrumentChunk: RIFFChunk) {
        super();
        this.name = readBinaryStringIndexed(instrumentChunk.data, 20);
        this.zoneStartIndex = readLittleEndianIndexed(instrumentChunk.data, 2);
    }

    public createSoundFontZone(
        modulators: Modulator[],
        generators: Generator[],
        samples: BasicSample[]
    ) {
        const sampleID = generators.find(
            (g) => g.type === GeneratorTypes.sampleID
        );
        if (!sampleID) {
            throw new Error("No sample ID found in instrument zone.");
        }
        // Unsigned, with sampleIDMSB as the top 16 bits (SFe 4.0, section 7.1.1)
        const index = readZoneIndex(
            generators,
            sampleID,
            GeneratorTypes.sampleIDMSB
        );
        const sample = samples[index];
        // A zone whose index refers past the samples is ignored (SFe 4.0, section 7.1.1)
        if (!sample) {
            SpessaLog.warn(
                `Invalid sample ID: ${index}, available samples: ${samples.length}. Ignoring the zone.`
            );
            return;
        }
        const z = new BasicInstrumentZone(this, sample);
        // Unknown generators are ignored, and so is everything after the index, as in SF2 (SFe 4.0, section 7.1.1)
        z.addGenerators(
            ...knownGenerators(
                generators.slice(0, generators.indexOf(sampleID) + 1)
            )
        );
        z.addModulators(...modulators);
        this.zones.push(z);
        return z;
    }
}

/**
 * Reads the instruments
 */
export function readInstruments(
    instrumentChunk: RIFFChunk,
    keepTerminal = false
): SoundFontInstrument[] {
    const instruments: SoundFontInstrument[] = [];
    while (instrumentChunk.data.length > instrumentChunk.data.currentIndex) {
        const instrument = new SoundFontInstrument(instrumentChunk);

        if (instruments.length > 0) {
            const previous = instruments[instruments.length - 1];
            previous.zonesCount =
                instrument.zoneStartIndex - previous.zoneStartIndex;
        }
        instruments.push(instrument);
    }
    // Remove EOI
    if (!keepTerminal) instruments.pop();
    return instruments;
}
