/**
 * Other.ts
 * purpose: contains some useful functions that don't belong in any specific category
 */

// Source - https://stackoverflow.com/a/47593316
// Seedable random generator
function splitmix32(a: number) {
    return function () {
        a |= 0;
        a = (a + 0x9e_37_79_b9) | 0;
        let t = a ^ (a >>> 16);
        t = Math.imul(t, 0x21_f0_aa_ad);
        t = t ^ (t >>> 15);
        t = Math.imul(t, 0x73_5a_2d_97);
        return ((t ^ (t >>> 15)) >>> 0) / 4_294_967_296;
    };
}
export const randomGenerator = splitmix32(81_572);

/**
 * Formats the given seconds to nice readable time
 * @param totalSeconds time in seconds
 */
export function formatTime(totalSeconds: number): {
    seconds: number;
    minutes: number;
    time: string;
} {
    totalSeconds = Math.floor(totalSeconds);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.round(totalSeconds - minutes * 60);
    return {
        minutes: minutes,
        seconds: seconds,
        time: `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
    };
}

/**
 * Does what it says
 */
export function arrayToHexString(arr: ArrayLike<number>): string {
    let hexString = "";

    for (let i = 0; i < arr.length; i++) {
        const hex = arr[i].toString(16).padStart(2, "0").toUpperCase();
        hexString += hex;
        if (i < arr.length - 1) hexString += " ";
    }

    return hexString;
}

export const ConsoleColors = {
    warn: "color: orange;",
    unrecognized: "color: red;",
    info: "color: aqua;",
    recognized: "color: lime",
    value: "color: yellow; background-color: black;"
};
