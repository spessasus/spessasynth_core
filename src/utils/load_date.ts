// Attempt to load a date from string
import { SpessaSynthWarn } from "./loggin";

export function parseDateString(dateString: string) {
    // Remove "st" , "nd" , "rd",  "th", etc.
    const filtered = dateString.replace(/\b(\d+)(st|nd|rd|th)\b/g, "$1");
    const date = new Date(filtered);
    if (date.toString() === "Invalid Date") {
        SpessaSynthWarn(
            `Invalid date: "${dateString}". Replacing with the current date!`
        );
        return new Date();
    }
    return date;
}
