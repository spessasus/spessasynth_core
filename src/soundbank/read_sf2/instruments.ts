import { RiffChunk } from "../basic_soundbank/riff_chunk.js";
import { readLittleEndian } from "../../utils/byte_functions/little_endian.js";
import { readBytesAsString } from "../../utils/byte_functions/string.js";
import { BasicInstrument } from "../basic_soundbank/basic_instrument.js";

import { SoundFontInstrumentZone } from "./instrument_zones.js";

/**
 * instrument.js
 * purpose: parses soundfont instrument and stores them as a class
 */

export class SoundFontInstrument extends BasicInstrument {
    zoneStartIndex: number;

    zonesCount: number = 0;

    /**
     * Creates an instrument
     */
    constructor(instrumentChunk: RiffChunk) {
        super();
        this.instrumentName = readBytesAsString(instrumentChunk.chunkData, 20);
        this.zoneStartIndex = readLittleEndian(instrumentChunk.chunkData, 2);
    }

    createZone(): SoundFontInstrumentZone {
        const z = new SoundFontInstrumentZone(this);
        this.instrumentZones.push(z);
        return z;
    }
}

/**
 * Reads the instruments
 */
export function readInstruments(
    instrumentChunk: RiffChunk
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
