import { readBigEndian } from "./byte_functions/big_endian";
import { readLittleEndianIndexed } from "./byte_functions/little_endian";
import { readBinaryStringIndexed } from "./byte_functions/string";
import { readVariableLengthQuantity } from "./byte_functions/variable_length_quantity";
import { ConsoleColors } from "./other";
import { inflateSync } from "../externals/fflate/fflate_wrapper";

// You shouldn't use these...
// noinspection JSUnusedGlobalSymbols
export const SpessaSynthCoreUtils = {
    ConsoleColors,
    // noinspection JSUnusedGlobalSymbols
    readBigEndian,
    readLittleEndianIndexed,
    readBinaryStringIndexed,
    // noinspection JSUnusedGlobalSymbols
    readVariableLengthQuantity,
    inflateSync
};

export interface WaveWriteOptions {
    /**
     * This will find the max sample point and set it to 1, and scale others with it. Recommended
     */
    normalizeAudio: boolean;
    /**
     * The loop start and end points in seconds. Undefined if no loop should be written.
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
     */
    metadata: Partial<WaveMetadata>;
}

export interface WaveMetadata {
    /**
     * The song's title.
     */
    title: string;
    /**
     * The song's artist.
     */
    artist: string;
    /**
     * The song's album.
     */
    album: string;
    /**
     * The song's genre.
     */
    genre: string;
}

export { IndexedByteArray } from "./indexed_array";
export { audioToWav } from "./write_wav";
export { SpessaSynthLog } from "./loggin";
export { type FourCC } from "./riff_chunk";
