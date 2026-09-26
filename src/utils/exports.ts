import { readBigEndian } from "./byte_functions/big_endian";
import {
    readLittleEndian,
    readLittleEndianIndexed
} from "./byte_functions/little_endian";
import {
    readBinaryString,
    readBinaryStringIndexed
} from "./byte_functions/string";
import { readVariableLengthQuantity } from "./byte_functions/variable_length_quantity";
import { ConsoleColors } from "./other";

// You shouldn't use these...
// Note: intentionally no JSDoc so these don't show in the generated docs
// noinspection JSUnusedGlobalSymbols
export const SpessaSynthCoreUtils = {
    ConsoleColors,
    readBigEndian,
    readLittleEndian,
    readLittleEndianIndexed,
    readBinaryString,
    readBinaryStringIndexed,
    readVariableLengthQuantity
};

/**
 * Options for writing a WAVE file.
 *
 * @group Utilities
 */
export interface WaveWriteOptions {
    /**
     * If true, the gain of the entire song will be adjusted,
     * so the max sample is always 32,767 or min is always -32,768 (whichever is greater). Recommended.
     */
    normalizeAudio: boolean;
    /**
     * The loop start and end points. Undefined if no loop should be written.
     * The loop will be written to the file (using the `cue ` chunk)
     */
    loop?: {
        /**
         * The start point in seconds.
         */
        start: number;
        /**
         * The end point in seconds.
         */
        end: number;
    };
    /**
     * The metadata to write into the file.
     *
     * The metadata uses the `INFO` chunk to write the information.
     * It is encoded with `utf-8`
     */
    metadata: Partial<WaveMetadata>;
}

/**
 * Metadata to write into a WAVE file.
 *
 * @group Utilities
 */
export interface WaveMetadata {
    /**
     * The song's title.
     * This writes to the `INAM` chunk.
     */
    title: string;
    /**
     * The song's artist.
     * This writes to the `IART` chunk.
     */
    artist: string;
    /**
     * The song's album.
     * This writes to the `IPRD` chunk.
     */
    album: string;
    /**
     * The song's genre.
     * This writes to the `IGNR` chunk.
     */
    genre: string;
}

export { IndexedByteArray } from "./indexed_array";
export { audioToWav } from "./write_wav";
export { SpessaLog } from "./loggin";
export { type FourCC } from "./riff_chunk";
