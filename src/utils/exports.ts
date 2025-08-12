import { IndexedByteArray } from "./indexed_array";
import { audioToWav } from "./write_wav";

import { readBigEndian } from "./byte_functions/big_endian";
import { readLittleEndianIndexed } from "./byte_functions/little_endian";
import { readBinaryStringIndexed } from "./byte_functions/string";
import { readVariableLengthQuantity } from "./byte_functions/variable_length_quantity";
import { consoleColors } from "./other";
import { inflateSync } from "../externals/fflate/fflate_wrapper";
import {
    SpessaSynthGroup,
    SpessaSynthGroupCollapsed,
    SpessaSynthGroupEnd,
    SpessaSynthInfo,
    SpessaSynthLogging,
    SpessaSynthWarn
} from "./loggin";
import type { MIDILoop } from "../midi/types";

import type { FourCC } from "./riff_chunk";

// You shouldn't use these...
const SpessaSynthCoreUtils = {
    consoleColors,
    SpessaSynthInfo,
    SpessaSynthWarn,
    SpessaSynthGroupCollapsed,
    // noinspection JSUnusedGlobalSymbols
    SpessaSynthGroup,
    SpessaSynthGroupEnd,
    // noinspection JSUnusedGlobalSymbols
    readBytesAsUintBigEndian: readBigEndian,
    readLittleEndian: readLittleEndianIndexed,
    readBytesAsString: readBinaryStringIndexed,
    // noinspection JSUnusedGlobalSymbols
    readVariableLengthQuantity,
    inflateSync
};

export {
    IndexedByteArray,
    audioToWav,
    SpessaSynthLogging,
    SpessaSynthCoreUtils,
    type FourCC
};

export const DEFAULT_WAV_WRITE_OPTIONS: WaveWriteOptions = {
    normalizeAudio: true,
    loop: undefined,
    metadata: {}
};

export interface WaveWriteOptions {
    /**
     * This will find the max sample point and set it to 1, and scale others with it. Recommended
     */
    normalizeAudio: boolean;
    /**
     * The loop start and end points in seconds. Undefined if no loop should be written.
     */
    loop?: MIDILoop;
    /**
     * The metadata to write into the file.
     */
    metadata: Partial<WaveMetadata>;
}

export interface WaveMetadata {
    // The song's title.
    title: string;
    // The song's artist.
    artist: string;
    // The song's album.
    album: string;
    // The song's genre.
    genre: string;
}
