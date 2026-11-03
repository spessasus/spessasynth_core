/**
 * The modified Bessel function I0, for the Kaiser window.
 * @param x The argument.
 * @internal
 */
export function besselI0(x: number) {
    let sum = 1;
    let term = 1;
    for (let k = 1; k < 32; k++) {
        term *= (x / (2 * k)) ** 2;
        sum += term;
    }
    return sum;
}

/**
 * The Kaiser window at `t` (-1 to 1 across the window).
 * @param t The position in the window.
 * @param beta The window's beta.
 * @internal
 */
export function kaiser(t: number, beta: number) {
    return besselI0(beta * Math.sqrt(1 - t * t)) / besselI0(beta);
}
