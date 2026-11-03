// The gain laws every EFX type shares: the output stage, level, pan and balance.
// The Sound Canvas works with 7 bit gain bytes over 128, so full scale is 127/128 almost everywhere.

/**
 * The shared output stage of every type: three 127/128 gains (input, effect output, output).
 * Together with Thru's fixed level (127/128) this is the -0.272 dB that Thru measures on the hardware.
 * @internal
 */
export const STAGE_GAIN = (127 / 128) ** 3;

/**
 * The input half of the output stage (the block doubles the input, the stage takes 127/128 x 1/4).
 * Only the nonlinear types need the split, since it sets the level that reaches their clippers.
 * @internal
 */
export const STAGE_INPUT = 127 / 256;

/**
 * The output half of the output stage.
 * @internal
 */
export const STAGE_OUTPUT = STAGE_GAIN / STAGE_INPUT;

/**
 * The input of the mono wet types that need the split: the input half of the output stage and the mono mix's
 * 127/128.
 * @internal
 */
export const MONO_INPUT = (STAGE_INPUT * 127) / 128;

/**
 * The gain of an input into a delay line (a line's feedback joins after it).
 * @internal
 */
export const LINE_INPUT = 127 / 128;

/**
 * The saturating programs (Compressor, Limiter, Lo-Fi 1) clip their stage like a fixed-point DSP: each input channel
 * where the doubled input reaches full scale (-5.9 dBFS), and the output at 127/256 (-6.1 dBFS).
 * @internal
 */
export const SATURATED_INPUT = 64 / 127;

/**
 * @internal
 */
export const SATURATED_OUTPUT = 127 / 256;

/**
 * Level (0-127) to the gain byte. Close to `(v / 127) ^ 1.25` but not within a byte, so it stays a table.
 */
const LEVEL_TABLE = new Uint8Array([
    0x00, 0x01, 0x01, 0x02, 0x03, 0x04, 0x04, 0x05, 0x06, 0x06, 0x07, 0x08,
    0x09, 0x09, 0x0a, 0x0b, 0x0c, 0x0c, 0x0d, 0x0e, 0x0f, 0x0f, 0x10, 0x11,
    0x12, 0x13, 0x13, 0x14, 0x15, 0x16, 0x17, 0x17, 0x18, 0x19, 0x1a, 0x1b,
    0x1c, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x21, 0x22, 0x22, 0x23, 0x24, 0x25,
    0x26, 0x27, 0x28, 0x29, 0x2a, 0x2b, 0x2c, 0x2c, 0x2d, 0x2e, 0x2f, 0x30,
    0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x3b, 0x3c,
    0x3d, 0x3e, 0x3f, 0x40, 0x41, 0x42, 0x43, 0x44, 0x46, 0x47, 0x48, 0x49,
    0x4a, 0x4b, 0x4c, 0x4d, 0x4e, 0x4f, 0x51, 0x52, 0x53, 0x54, 0x55, 0x56,
    0x57, 0x59, 0x5a, 0x5b, 0x5c, 0x5d, 0x5f, 0x60, 0x61, 0x62, 0x63, 0x65,
    0x66, 0x67, 0x68, 0x6a, 0x6b, 0x6c, 0x6e, 0x6f, 0x70, 0x72, 0x73, 0x74,
    0x75, 0x77, 0x78, 0x7a, 0x7b, 0x7c, 0x7e, 0x7f
]);

/**
 * Pan (0-127) to the left gain byte, the right side is the mirror image.
 * Neither linear nor constant power: the center is 94/128 per side (-2.68 dB).
 */
const PAN_TABLE = new Uint8Array([
    0x7f, 0x7f, 0x7e, 0x7e, 0x7d, 0x7d, 0x7d, 0x7c, 0x7c, 0x7b, 0x7b, 0x7b,
    0x7a, 0x7a, 0x79, 0x79, 0x78, 0x78, 0x77, 0x77, 0x77, 0x76, 0x76, 0x75,
    0x75, 0x74, 0x74, 0x73, 0x73, 0x72, 0x72, 0x71, 0x71, 0x70, 0x70, 0x6f,
    0x6f, 0x6e, 0x6e, 0x6d, 0x6d, 0x6c, 0x6c, 0x6b, 0x6a, 0x6a, 0x69, 0x69,
    0x68, 0x67, 0x67, 0x66, 0x66, 0x65, 0x64, 0x64, 0x63, 0x62, 0x62, 0x61,
    0x60, 0x60, 0x5f, 0x5e, 0x5e, 0x5d, 0x5c, 0x5b, 0x5b, 0x5a, 0x59, 0x58,
    0x58, 0x57, 0x56, 0x55, 0x54, 0x53, 0x53, 0x52, 0x51, 0x50, 0x4f, 0x4e,
    0x4d, 0x4c, 0x4b, 0x4a, 0x49, 0x48, 0x47, 0x46, 0x45, 0x44, 0x42, 0x41,
    0x40, 0x3f, 0x3e, 0x3c, 0x3b, 0x3a, 0x38, 0x37, 0x35, 0x34, 0x32, 0x31,
    0x2f, 0x2d, 0x2c, 0x2a, 0x28, 0x26, 0x24, 0x22, 0x20, 0x1e, 0x1b, 0x19,
    0x16, 0x14, 0x11, 0x0e, 0x0b, 0x07, 0x04, 0x00
]);

/**
 * The gain of a level parameter. 127 is 127/128.
 * @param level The level (0-127).
 * @internal
 */
export function levelGain(level: number) {
    return LEVEL_TABLE[level] / 128;
}

/**
 * The left gain of a pan parameter.
 * @param pan The pan (0-127, 64 is the center).
 * @internal
 */
export function panLeft(pan: number) {
    return PAN_TABLE[pan] / 128;
}

/**
 * The right gain of a pan parameter.
 * @param pan The pan (0-127, 64 is the center).
 * @internal
 */
export function panRight(pan: number) {
    return PAN_TABLE[127 - pan] / 128;
}

/**
 * The wet gain of a balance parameter: silent up to 14, full from 64 (a byte, rounded down).
 * @param balance The balance (0-127, D>0E to D0<E).
 * @internal
 */
export function balanceWet(balance: number) {
    return (
        Math.floor(Math.min(1, Math.max(0, (balance - 14) / 50)) * 127) / 128
    );
}

/**
 * The dry gain of a balance parameter: full up to 64, silent from 114 (a byte, rounded down).
 * @param balance The balance (0-127, D>0E to D0<E).
 * @internal
 */
export function balanceDry(balance: number) {
    return (
        Math.floor(Math.min(1, Math.max(0, (114 - balance) / 50)) * 127) / 128
    );
}

/**
 * A shelf gain parameter (52-76) in dB, clamped like the hardware's tables.
 * @param value The parameter (64 is 0 dB).
 * @internal
 */
export function shelfGain(value: number) {
    return Math.max(-12, Math.min(12, value - 64));
}

/**
 * Clips to the internal full scale. The saturating programs (Compressor, Limiter, Lo-Fi 1 and 2) clip every
 * operation like a fixed-point DSP.
 * @param x The value.
 * @internal
 */
export function saturate(x: number) {
    return Math.max(-1, Math.min(1, x));
}

/**
 * Clips to a level, for the saturating stage's limits (`SATURATED_INPUT`, `SATURATED_OUTPUT`).
 * @param x The value.
 * @param limit The level.
 * @internal
 */
export function saturateAt(x: number, limit: number) {
    return Math.max(-limit, Math.min(limit, x));
}
