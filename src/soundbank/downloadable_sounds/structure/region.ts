import { DownloadableSoundsArticulation } from "./articulation";
import type { GenericRange } from "../../types";
import { WaveSample } from "./wave_sample";
import { WaveLink } from "./wave_link";
import {
    type RIFFChunk,
    writeRIFFChunkParts,
    writeRIFFChunkRaw
} from "../../../utils/riff_chunk";
import { SpessaSynthWarn } from "../../../utils/loggin";
import {
    readLittleEndianIndexed,
    writeWord
} from "../../../utils/byte_functions/little_endian";
import { DLSVerifier } from "./dls_verifier";
import type { DownloadableSoundsSample } from "./sample";
import { IndexedByteArray } from "../../../utils/indexed_array";
import type { BasicInstrumentZone } from "../../basic_soundbank/basic_instrument_zone";
import type { BasicSample } from "../../basic_soundbank/basic_sample";
import type { BasicInstrument } from "../../basic_soundbank/basic_instrument";
import {
    generatorLimits,
    generatorTypes
} from "../../basic_soundbank/generator_types";

export class DownloadableSoundsRegion extends DLSVerifier {
    public readonly articulation = new DownloadableSoundsArticulation();
    /**
     * Specifies the key range for this region.
     */
    public keyRange: GenericRange = {
        min: 0,
        max: 127
    };
    /**
     * Specifies the velocity range for this region.
     */
    public velRange: GenericRange = {
        min: 0,
        max: 127
    };

    /**
     * Specifies the key group for a drum instrument. Key group values allow multiple regions
     * within a drum instrument to belong to the same "key group." If a synthesis engine is
     * instructed to play a note with a key group setting and any other notes are currently playing
     * with this same key group, then the synthesis engine should turn off all notes with the same
     * key group value as soon as possible.
     */
    public keyGroup = 0;

    public readonly waveSample: WaveSample;
    public readonly waveLink: WaveLink;

    public constructor(
        samples: DownloadableSoundsSample[],
        waveLink: WaveLink,
        waveSample?: WaveSample
    ) {
        super();
        const sample = samples[waveLink.tableIndex];
        if (!sample) {
            DownloadableSoundsRegion.parsingError(
                `Invalid sample index: ${waveLink.tableIndex}. Samples available: ${samples.length}`
            );
        }
        if (waveSample) {
            this.waveSample = waveSample;
        } else {
            this.waveSample = sample.waveSample;
        }
        this.waveLink = waveLink;
    }

    public static read(samples: DownloadableSoundsSample[], chunk: RIFFChunk) {
        const regionChunks = this.verifyAndReadList(chunk, "rgn ", "rgn2");
        // Wsmp: wave sample chunk
        const waveSampleChunk = regionChunks.find((c) => c.header === "wsmp");
        const waveSample = waveSampleChunk
            ? WaveSample.read(waveSampleChunk)
            : undefined;

        // Wlnk: wave link chunk
        const waveLinkChunk = regionChunks.find((c) => c.header === "wlnk");
        if (!waveLinkChunk) {
            // No wave link means no sample. What? Why is it even here then?
            SpessaSynthWarn(
                "Invalid DLS region: missing 'wlnk' chunk! Discarding..."
            );
            return;
        }
        const waveLink = WaveLink.read(waveLinkChunk);

        // Region header
        const regionHeader = regionChunks.find((c) => c.header === "rgnh");
        if (!regionHeader) {
            SpessaSynthWarn(
                "Invalid DLS region: missing 'rgnh' chunk! Discarding..."
            );
            return;
        }

        const region = new DownloadableSoundsRegion(
            samples,
            waveLink,
            waveSample
        );

        // Key range
        const keyMin = readLittleEndianIndexed(regionHeader.data, 2);
        const keyMax = readLittleEndianIndexed(regionHeader.data, 2);
        // Vel range
        let velMin = readLittleEndianIndexed(regionHeader.data, 2);
        let velMax = readLittleEndianIndexed(regionHeader.data, 2);

        // A fix for not cool files
        // Cannot do the same to key zones sadly
        if (velMin === 0 && velMax === 0) {
            velMax = 127;
            velMin = 0;
        }
        region.keyRange.max = keyMax;
        region.keyRange.min = keyMin;

        region.velRange.max = velMax;
        region.velRange.min = velMin;

        // FusOptions: no idea about that one???
        readLittleEndianIndexed(regionHeader.data, 2);
        // KeyGroup: essentially exclusive class
        region.keyGroup = readLittleEndianIndexed(regionHeader.data, 2);

        region.articulation.read(regionChunks);
        return region;
    }

    public write() {
        // In that order!
        const chunks = [
            this.writeHeader(),
            this.waveSample.write(),
            this.waveLink.write(),
            this.articulation.write()
        ];
        return writeRIFFChunkParts("rgn2", chunks, true);
    }

    public toSFZone(
        instrument: BasicInstrument,
        samples: BasicSample[]
    ): BasicInstrumentZone {
        const sample = samples[this.waveLink.tableIndex];
        if (!sample) {
            DownloadableSoundsRegion.parsingError(
                `Invalid sample index: ${this.waveLink.tableIndex}`
            );
        }
        const zone = instrument.createZone(sample);
        zone.keyRange = this.keyRange;
        zone.velRange = this.velRange;
        // If the zones are default (0-127), set to -1 as "not set"
        if (this.keyRange.max === 127 && this.keyRange.min === 0) {
            zone.keyRange.min = -1;
        }
        if (this.velRange.max === 127 && this.velRange.min === 0) {
            zone.velRange.min = -1;
        }

        // KeyGroup: essentially exclusive class
        if (this.keyGroup !== 0) {
            zone.setGenerator(generatorTypes.exclusiveClass, this.keyGroup);
        }

        this.articulation.toSFZone(zone);
        this.waveSample.toSFZone(zone, sample);
        // Remove generators with default values
        zone.generators = zone.generators.filter(
            (g) => g.generatorValue !== generatorLimits[g.generatorType].def
        );
        return zone;
    }

    private writeHeader() {
        // Region header
        const rgnhData = new IndexedByteArray(12);
        // KeyRange
        writeWord(rgnhData, Math.max(this.keyRange.min, 0));
        writeWord(rgnhData, this.keyRange.max);
        // VelRange
        writeWord(rgnhData, Math.max(this.velRange.min, 0));
        writeWord(rgnhData, this.velRange.max);
        // FusOptions: enable self non-exclusive, because why not?
        writeWord(rgnhData, 1);
        // KeyGroup (exclusive class)
        writeWord(rgnhData, this.keyGroup);
        // UsLayer
        writeWord(rgnhData, 0);
        return writeRIFFChunkRaw("rgnh", rgnhData);
    }
}
