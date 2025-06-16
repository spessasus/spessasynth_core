import { RiffChunk } from "../basic_soundfont/riff_chunk.js";
import { readLittleEndian } from "../../utils/byte_functions/little_endian.js";
import { readBytesAsString } from "../../utils/byte_functions/string.js";
import { BasicInstrument } from "../basic_soundfont/basic_instrument.js";

import { InstrumentZone } from "./instrument_zones.js";

/**
 * instrument.js
 * purpose: parses soundfont instrument and stores them as a class
 */

export class Instrument extends BasicInstrument
{
    /**
     * @type {number}
     */
    zoneStartIndex;
    /**
     * @type {number}
     */
    zonesCount = 0;
    
    /**
     * Creates an instrument
     * @param instrumentChunk {RiffChunk}
     */
    constructor(instrumentChunk)
    {
        super();
        this.instrumentName = readBytesAsString(instrumentChunk.chunkData, 20);
        this.zoneStartIndex = readLittleEndian(instrumentChunk.chunkData, 2);
    }
    
    /**
     * @returns {InstrumentZone}
     */
    createZone()
    {
        const z = new InstrumentZone(this);
        this.instrumentZones.push(z);
        return z;
    }
}

/**
 * Reads the instruments
 * @param instrumentChunk {RiffChunk}
 * @returns {Instrument[]}
 */
export function readInstruments(instrumentChunk)
{
    /**
     * @type {Instrument[]}
     */
    let instruments = [];
    while (instrumentChunk.chunkData.length > instrumentChunk.chunkData.currentIndex)
    {
        let instrument = new Instrument(instrumentChunk);
        
        if (instruments.length > 0)
        {
            const previous = instruments[instruments.length - 1];
            previous.zonesCount = instrument.zoneStartIndex - previous.zoneStartIndex;
        }
        instruments.push(instrument);
    }
    // remove EOI
    instruments.pop();
    return instruments;
}