/**
 * other.ts
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

/**
 * Sanitizes KAR lyrics
 */
// export function sanitizeKarLyrics(eventData: Uint8Array): Uint8Array {
//     // for KAR files:
//     // https://www.mixagesoftware.com/en/midikit/help/HTML/karaoke_formats.html
//     // "/" is the newline character
//     // "\" is also the newline character
//     // "\" ASCII code is 92
//     // "/" ASCII code is 47
//     // newline ASCII code is 10
//     const sanitized = [];
//     for (let byte of eventData) {
//         if (byte === 47 || byte === 92) {
//             byte = 10;
//         }
//         sanitized.push(byte);
//     }
//     return new Uint8Array(sanitized);
// }

export const consoleColors = {
    warn: "color: orange;",
    unrecognized: "color: red;",
    info: "color: aqua;",
    recognized: "color: lime",
    value: "color: yellow; background-color: black;"
};
