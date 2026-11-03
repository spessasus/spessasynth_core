/**
 * The LFO waves, in the order of the parameter.
 * @internal
 */
export const TremoloWaves = {
    triangle: 0,
    square: 1,
    sine: 2,
    sawUp: 3,
    sawDown: 4
} as const;

/**
 * @internal
 */
export type TremoloWave = (typeof TremoloWaves)[keyof typeof TremoloWaves];

/**
 * The second stages of the combinations.
 * @internal
 */
export const CombinationStages = {
    chorus: 0,
    flanger: 1,
    delay: 2
} as const;

/**
 * @internal
 */
export type CombinationStageType =
    (typeof CombinationStages)[keyof typeof CombinationStages];

/**
 * The effects of the parallel combinations.
 * @internal
 */
export const ParallelStages = {
    drive: 0,
    phaser: 1,
    wah: 2,
    rotary: 3
} as const;

/**
 * @internal
 */
export type ParallelStageType =
    (typeof ParallelStages)[keyof typeof ParallelStages];
