import { RIFFChunk } from "../../../utils/riff_chunk";
import { readLittleEndianIndexed } from "../../../utils/byte_functions/little_endian";
import { readBinaryStringIndexed } from "../../../utils/byte_functions/string";
import { BasicInstrument } from "../../basic_soundbank/basic_instrument";

import { SoundFontInstrumentZone } from "./instrument_zones";
import type { BasicSample } from "../../basic_soundbank/basic_sample";
import type { Modulator } from "../../basic_soundbank/modulator";
import type { Generator } from "../../basic_soundbank/generator";

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
