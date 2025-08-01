import { RIFFChunk } from "../basic_soundbank/riff_chunk";
import { readLittleEndian } from "../../utils/byte_functions/little_endian";
import { readBytesAsString } from "../../utils/byte_functions/string";
import { BasicInstrument } from "../basic_soundbank/basic_instrument";

import { SoundFontInstrumentZone } from "./instrument_zones";
import type { BasicSample } from "../basic_soundbank/basic_sample";
import type { Modulator } from "../basic_soundbank/modulator";
import type { Generator } from "../basic_soundbank/generator";

/**
 * instrument.ts
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
        this.name = readBytesAsString(instrumentChunk.chunkData, 20);
        this.zoneStartIndex = readLittleEndian(instrumentChunk.chunkData, 2);
    }

    public createSoundFontZone(
        modulators: Modulator[],
        generators: Generator[],
        samples: BasicSample[]
    ): SoundFontInstrumentZone {
        const z = new SoundFontInstrumentZone(
            this,
            modulators,
            generators,
            samples
        );
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
    while (
        instrumentChunk.chunkData.length >
        instrumentChunk.chunkData.currentIndex
    ) {
        const instrument = new SoundFontInstrument(instrumentChunk);

        if (instruments.length > 0) {
            const previous = instruments[instruments.length - 1];
            previous.zonesCount =
                instrument.zoneStartIndex - previous.zoneStartIndex;
        }
        instruments.push(instrument);
    }
    // remove EOI
    instruments.pop();
    return instruments;
}
