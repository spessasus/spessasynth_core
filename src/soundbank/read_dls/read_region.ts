import {
    readLittleEndianIndexed,
    signedInt16
} from "../../utils/byte_functions/little_endian";
import {
    findRIFFListType,
    readRIFFChunk,
    RIFFChunk
} from "../../utils/riff_chunk";
import { Generator } from "../basic_soundbank/generator";
import { SpessaSynthWarn } from "../../utils/loggin";
import type { DownloadableSounds } from "./downloadable_sounds";
import type { DLSInstrument } from "./dls_instrument";
import { readLart } from "./read_lart";
import type { DLSSample } from "./dls_sample";
import { generatorTypes } from "../basic_soundbank/generator_types";

export function readRegion(
    this: DownloadableSounds,
    chunk: RIFFChunk,
    instrument: DLSInstrument
) {
    // Regions are essentially instrument zones

    /**
     * Read chunks in the region
     */
    const regionChunks: RIFFChunk[] = [];
    while (chunk.data.length > chunk.data.currentIndex) {
        regionChunks.push(readRIFFChunk(chunk.data));
    }

    // Region header
    const regionHeader = regionChunks.find((c) => c.header === "rgnh");

    if (!regionHeader) {
        SpessaSynthWarn(
            "Invalid DLS region: missing 'rgnh' chunk! Discarding..."
        );
        return;
    }
    // Key range
    const keyMin = readLittleEndianIndexed(regionHeader.data, 2);
    const keyMax = readLittleEndianIndexed(regionHeader.data, 2);
    // Vel range
    let velMin = readLittleEndianIndexed(regionHeader.data, 2);
    let velMax = readLittleEndianIndexed(regionHeader.data, 2);

    // A fix for not cool files
    if (velMin === 0 && velMax === 0) {
        velMax = 127;
        velMin = 0;
    }
    // Cannot do the same to key zones sadly

    // Wave link
    const waveLinkChunk = regionChunks.find((c) => c.header === "wlnk");
    if (waveLinkChunk === undefined) {
        // No wave link means no sample. What? Why is it even here then?
        return undefined;
    }

    // Flags
    readLittleEndianIndexed(waveLinkChunk.data, 2);
    // Phase group
    readLittleEndianIndexed(waveLinkChunk.data, 2);
    // Channel
    readLittleEndianIndexed(waveLinkChunk.data, 4);
    // SampleID
    const sampleID = readLittleEndianIndexed(waveLinkChunk.data, 4);
    // Hacky cast, but works
    const sample: DLSSample = this.samples[sampleID] as DLSSample;
    if (sample === undefined) {
        throw new Error("Invalid sample ID!");
    }

    // Create zone
    const zone = instrument.createZone(sample);
    // Apply ranges
    zone.keyRange = { min: keyMin, max: keyMax };
    zone.velRange = { min: velMin, max: velMax };

    // FusOptions: no idea about that one???
    readLittleEndianIndexed(regionHeader.data, 2);

    // KeyGroup: essentially exclusive class
    const exclusive = readLittleEndianIndexed(regionHeader.data, 2);
    if (exclusive !== 0) {
        zone.addGenerators(
            new Generator(generatorTypes.exclusiveClass, exclusive)
        );
    }

    // Lart
    const lart = findRIFFListType(regionChunks, "lart");
    const lar2 = findRIFFListType(regionChunks, "lar2");
    readLart.call(this, zone, lart, lar2);

    // Wsmp: wave sample chunk
    const waveSampleChunk = regionChunks.find((c) => c.header === "wsmp");
    if (!waveSampleChunk) {
        this.parsingError("No wavesample chunk in region.");
        return;
    }
    // CbSize
    readLittleEndianIndexed(waveSampleChunk.data, 4);
    const originalKey = readLittleEndianIndexed(waveSampleChunk.data, 2);

    // SFineTune
    const pitchCorrection = signedInt16(
        waveSampleChunk.data[waveSampleChunk.data.currentIndex++],
        waveSampleChunk.data[waveSampleChunk.data.currentIndex++]
    );

    // Gain correction: Each unit of gain represents 1/655360 dB
    // It is set after linking the sample
    const gainCorrection = readLittleEndianIndexed(waveSampleChunk.data, 4);
    // Convert to signed and turn into attenuation (invert)
    const dbCorrection = (gainCorrection | 0) / -655360;

    // Skip options
    readLittleEndianIndexed(waveSampleChunk.data, 4);

    // Read loop count (always one or zero)
    const loopsAmount = readLittleEndianIndexed(waveSampleChunk.data, 4);
    let loopingMode;
    const loop = { start: 0, end: 0 };
    if (loopsAmount === 0) {
        // No loop
        loopingMode = 0;
    } else {
        // Ignore cbSize
        readLittleEndianIndexed(waveSampleChunk.data, 4);
        // Loop type: loop normally or loop until release (like soundfont)
        const loopType = readLittleEndianIndexed(waveSampleChunk.data, 4); // Why is it long?
        if (loopType === 0) {
            loopingMode = 1;
        } else {
            loopingMode = 3;
        }
        loop.start = readLittleEndianIndexed(waveSampleChunk.data, 4);
        const loopLength = readLittleEndianIndexed(waveSampleChunk.data, 4);
        loop.end = loop.start + loopLength;
    }

    // This correction overrides the sample gain correction
    const actualDbCorrection = dbCorrection || sample.sampleDbAttenuation;
    // Convert to centibels
    const attenuation = (actualDbCorrection * 10) / 0.4; // Make sure to apply EMU correction

    zone.setWaveSample(
        attenuation,
        loopingMode,
        loop,
        originalKey,
        sample,
        pitchCorrection
    );
}
