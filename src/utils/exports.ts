export * from "./types";
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

export { IndexedByteArray } from "./indexed_array";
export { audioToWav } from "./write_wav";
export { SpessaLog } from "./loggin";
export type { FourCC, GenericRIFFFourCC, WAVFourCC } from "./riff_chunk";
