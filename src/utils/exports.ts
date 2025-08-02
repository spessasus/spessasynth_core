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
    SpessaSynthCoreUtils
};
