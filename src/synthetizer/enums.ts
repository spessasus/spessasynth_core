export const interpolationTypes = {
    linear: 0,
    nearestNeighbor: 1,
    fourthOrder: 2
} as const;
export type interpolationTypes =
    (typeof interpolationTypes)[keyof typeof interpolationTypes];
export const synthDisplayTypes = {
    SoundCanvasText: 0,
    XGText: 1,
    SoundCanvasDotDisplay: 2
} as const;
export type synthDisplayTypes =
    (typeof synthDisplayTypes)[keyof typeof synthDisplayTypes];
