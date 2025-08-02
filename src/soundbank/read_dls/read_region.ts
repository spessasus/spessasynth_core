import {
    readLittleEndian,
    signedInt16
} from "../../utils/byte_functions/little_endian";
import {
    findRIFFListType,
    readRIFFChunk,
    RIFFChunk
} from "../basic_soundbank/riff_chunk";
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
    while (chunk.chunkData.length > chunk.chunkData.currentIndex) {
        regionChunks.push(readRIFFChunk(chunk.chunkData));
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
    const keyMin = readLittleEndian(regionHeader.chunkData, 2);
    const keyMax = readLittleEndian(regionHeader.chunkData, 2);
    // Vel range
    let velMin = readLittleEndian(regionHeader.chunkData, 2);
    let velMax = readLittleEndian(regionHeader.chunkData, 2);

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
    readLittleEndian(waveLinkChunk.chunkData, 2);
    // Phase group
    readLittleEndian(waveLinkChunk.chunkData, 2);
    // Channel
    readLittleEndian(waveLinkChunk.chunkData, 4);
    // SampleID
    const sampleID = readLittleEndian(waveLinkChunk.chunkData, 4);
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
    readLittleEndian(regionHeader.chunkData, 2);

    // KeyGroup: essentially exclusive class
    const exclusive = readLittleEndian(regionHeader.chunkData, 2);
    if (exclusive !== 0) {
        zone.addGenerators(
            new Generator(generatorTypes.exclusiveClass, exclusive)
        );
    }

    // Lart
    const lart = findRIFFListType(regionChunks, "lart");
    const lar2 = findRIFFListType(regionChunks, "lar2");
    readLart.call(this, lart, lar2, zone);

    // Wsmp: wave sample chunk
    const waveSampleChunk = regionChunks.find((c) => c.header === "wsmp");
    if (!waveSampleChunk) {
        this.parsingError("No wavesample chunk in region.");
        return;
    }
    // CbSize
    readLittleEndian(waveSampleChunk.chunkData, 4);
    const originalKey = readLittleEndian(waveSampleChunk.chunkData, 2);

    // SFineTune
    const pitchCorrection = signedInt16(
        waveSampleChunk.chunkData[waveSampleChunk.chunkData.currentIndex++],
        waveSampleChunk.chunkData[waveSampleChunk.chunkData.currentIndex++]
    );

    // Gain correction: Each unit of gain represents 1/655360 dB
    // It is set after linking the sample
    const gainCorrection = readLittleEndian(waveSampleChunk.chunkData, 4);
    // Convert to signed and turn into attenuation (invert)
    const dbCorrection = (gainCorrection | 0) / -655360;

    // Skip options
    readLittleEndian(waveSampleChunk.chunkData, 4);

    // Read loop count (always one or zero)
    const loopsAmount = readLittleEndian(waveSampleChunk.chunkData, 4);
    let loopingMode;
    const loop = { start: 0, end: 0 };
    if (loopsAmount === 0) {
        // No loop
        loopingMode = 0;
    } else {
        // Ignore cbSize
        readLittleEndian(waveSampleChunk.chunkData, 4);
        // Loop type: loop normally or loop until release (like soundfont)
        const loopType = readLittleEndian(waveSampleChunk.chunkData, 4); // Why is it long?
        if (loopType === 0) {
            loopingMode = 1;
        } else {
            loopingMode = 3;
        }
        loop.start = readLittleEndian(waveSampleChunk.chunkData, 4);
        const loopLength = readLittleEndian(waveSampleChunk.chunkData, 4);
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
