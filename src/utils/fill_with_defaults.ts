/**
 * Fills the object with default values.
 * @param obj object to fill.
 * @param defObj object to fill with.
 */
export function fillWithDefaults<T extends Record<string, unknown>>(
    obj: Partial<T> | undefined,
    defObj: T
): T {
    return {
        ...defObj,
        ...(obj ?? {})
    };
}
