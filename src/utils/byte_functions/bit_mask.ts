/**
 * Converts a given bit to boolean.
 * @param num The input number.
 * @param bit The index of the bit to convert into bool.
 */
export function bitToBool(num: number, bit: number) {
    return ((num >> bit) & 1) > 0;
}
