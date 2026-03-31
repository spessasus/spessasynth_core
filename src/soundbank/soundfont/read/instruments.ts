import { RIFFChunk } from "../../../utils/riff_chunk";
import { readLittleEndianIndexed } from "../../../utils/byte_functions/little_endian";
import { readBinaryStringIndexed } from "../../../utils/byte_functions/string";
import { BasicInstrument } from "../../basic_soundbank/basic_instrument";
import type { BasicSample } from "../../basic_soundbank/basic_sample";
import type { Modulator } from "../../basic_soundbank/modulator";
import type { Generator } from "../../basic_soundbank/generator";
import { BasicInstrumentZone } from "../../basic_soundbank/basic_instrument_zone";
import { generatorTypes } from "../../basic_soundbank/generator_types";

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
            (g) => g.generatorType === generatorTypes.sampleID
        );
        let sample;
        if (sampleID) {
            sample = samples[sampleID.generatorValue];
        } else {
            throw new Error("No sample ID found in instrument zone.");
        }
        if (!sample) {
            throw new Error(
                `Invalid sample ID: ${sampleID.generatorValue}, available samples: ${samples.length}`
            );
        }
        const z = new BasicInstrumentZone(this, sample);
        z.addGenerators(...generators);
        z.addModulators(...modulators);
        this.zones.push(z);
        return z;
    }
}

/**
 * Reads the instruments
 */
export function readInstruments(
    instrumentChunk: RIFFChunk
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
    instruments.pop();
    return instruments;
}
