import { IndexedByteArray } from "./indexed_array";
import { audioToWav } from "./buffer_to_wav";

import { readBigEndian } from "./byte_functions/big_endian";
import { readLittleEndian } from "./byte_functions/little_endian";
import { readBytesAsString } from "./byte_functions/string";
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

// Noinspection JSUnusedGlobalSymbols
// You shouldn't use these...
const SpessaSynthCoreUtils = {
    consoleColors,
    SpessaSynthInfo,
    SpessaSynthWarn,
    SpessaSynthGroupCollapsed,
    // Noinspection JSUnusedGlobalSymbols
    SpessaSynthGroup,
    SpessaSynthGroupEnd,
    // Noinspection JSUnusedGlobalSymbols
    readBytesAsUintBigEndian: readBigEndian,
    readLittleEndian,
    readBytesAsString,
    // Noinspection JSUnusedGlobalSymbols
    readVariableLengthQuantity,
    inflateSync
};

export {
    IndexedByteArray,
    audioToWav,
    SpessaSynthLogging,
    SpessaSynthCoreUtils
};
