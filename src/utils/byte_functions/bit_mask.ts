/**
 * Converts a given bit to boolean.
 * @param num The input number.
 * @param bit The index of the bit to convert into bool.
 */
export function bitMaskToBool(num: number, bit: number) {
    return ((num >> bit) & 1) > 0;
}

export function toNumericBool(bool: boolean) {
    return bool ? 1 : 0;
}
