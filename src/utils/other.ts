/**
 * Other.ts
 * purpose: contains some useful functions that don't belong in any specific category
 */

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
export function arrayToHexString(arr: Iterable<number>): string {
    let hexString = "";

    for (const i of arr) {
        const hex = i.toString(16).padStart(2, "0").toUpperCase();
        hexString += hex;
        hexString += " ";
    }

    return hexString;
}

export const consoleColors = {
    warn: "color: orange;",
    unrecognized: "color: red;",
    info: "color: aqua;",
    recognized: "color: lime",
    value: "color: yellow; background-color: black;"
};
