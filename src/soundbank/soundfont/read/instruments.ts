import { RIFFChunk } from "../../../utils/riff_chunk";
import { readLittleEndianIndexed } from "../../../utils/byte_functions/little_endian";
import { decodeUtf8 } from "../../../utils/byte_functions/string";
import { BasicInstrument } from "../../basic_soundbank/basic_instrument";
import { IndexedByteArray } from "../../../utils/indexed_array";
import type { BasicSample } from "../../basic_soundbank/basic_sample";
import type { Modulator } from "../../basic_soundbank/modulator";
import type { Generator } from "../../basic_soundbank/generator";
import { BasicInstrumentZone } from "../../basic_soundbank/basic_instrument_zone";
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
    public constructor(instChunk: RIFFChunk, xinstChunk: RIFFChunk | undefined) {
        super();

        const instNameArray = new IndexedByteArray(40);
        instNameArray.set(instChunk.data.slice(instChunk.data.currentIndex, instChunk.data.currentIndex + 20), 0)
        instChunk.data.currentIndex += 20;
        if (xinstChunk) {
            instNameArray.set(xinstChunk.data.slice(xinstChunk.data.currentIndex, xinstChunk.data.currentIndex + 20), 20);
            xinstChunk.data.currentIndex += 20;
        }
        const decodedName = decodeUtf8(instNameArray) ?? "Instrument";
        this.name = decodedName;
        this.zoneStartIndex = readLittleEndianIndexed(instChunk.data, 2);
        if (xinstChunk)
        {
            const xZoneStartIndex = readLittleEndianIndexed(xinstChunk.data, 2);
            this.zoneStartIndex += xZoneStartIndex << 16;
        }
    }

    public createSoundFontZone(
        modulators: Modulator[],
        generators: Generator[],
        samples: BasicSample[]
    ) {
        const sampleID = generators.find(
            (g) => g.type === GeneratorTypes.sampleID
        );
        let sample;
        if (sampleID) {
            sample = samples[sampleID.value];
        } else {
            throw new Error("No sample ID found in instrument zone.");
        }
        if (!sample) {
            throw new Error(
                `Invalid sample ID: ${sampleID.value}, available samples: ${samples.length}`
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
    instrumentChunk: RIFFChunk,
    useXdta = false,
    xdtaChunk: RIFFChunk | undefined = undefined,
    is64Bit = false
): SoundFontInstrument[] {
    console.log(is64Bit);
    const instruments: SoundFontInstrument[] = [];
    while (instrumentChunk.data.length > instrumentChunk.data.currentIndex) {
        let instrument;
        if (useXdta && xdtaChunk) {
            instrument = new SoundFontInstrument(instrumentChunk, xdtaChunk);
        } else {
            instrument = new SoundFontInstrument(instrumentChunk, undefined);
        }
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
