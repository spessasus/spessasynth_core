// Attempt to load a date from string
import { SpessaSynthWarn } from "./loggin";

// Needed because
// Invalid date: "sábado 26 setembro 2020, 16:40:14". Replacing with the current date!
const translationPortuguese = new Map([
    // Weekdays map (Portuguese to English)
    ["domingo", "Sunday"],
    ["segunda-feira", "Monday"],
    ["terça-feira", "Tuesday"],
    ["quarta-feira", "Wednesday"],
    ["quinta-feira", "Thursday"],
    ["sexta-feira", "Friday"],
    ["sábado", "Saturday"],

    // Months map (Portuguese to English)
    ["janeiro", "January"],
    ["fevereiro", "February"],
    ["março", "March"],
    ["abril", "April"],
    ["maio", "May"],
    ["junho", "June"],
    ["julho", "July"],
    ["agosto", "August"],
    ["setembro", "September"],
    ["outubro", "October"],
    ["novembro", "November"],
    ["dezembro", "December"]
]);

const translations: Map<string, string>[] = [translationPortuguese];

function tryTranslate(dateString: string) {
    // Translating
    for (const translation of translations) {
        let translated = dateString;
        translation.forEach((english, pt) => {
            const regex = new RegExp(pt, "gi");
            translated = translated.replace(regex, english);
        });
        const date = new Date(translated);
        if (!isNaN(date.getTime())) {
            return date;
        }
    }
    return undefined;
}

function tryDotted(dateString: string) {
    // Regex to match DD.MM.YYYY format
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(dateString);
    if (match) {
        const day = parseInt(match[1]);
        const month = parseInt(match[2]) - 1;
        const year = parseInt(match[3]);
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
            return date;
        }
    }
    return undefined;
}

function tryAWE(dateString: string) {
    // Regex to match a "DD  MM YY" (testcase: AWE32-MIDI-Conversions, sbk conversion so possibly SFEDT used that)
    // Also "DD MM YY" (without double space)
    const match = /^(\d{1,2})\s{1,2}(\d{1,2})\s{1,2}(\d{2})$/.exec(dateString);
    if (match) {
        const day = match[1];
        const month = (parseInt(match[2]) + 1).toString(); // Seems 0 indexed for some reason
        const year = match[3];
        // Format like string to let date decide if 2000 or 1900
        const date = new Date(`${month}/${day}/${year}`);
        if (!isNaN(date.getTime())) {
            return date;
        }
    }
    return undefined;
}

function tryYear(dateString: string) {
    // Math exactly 4 numbers
    const regex = /\b\d{4}\b/;
    const match = regex.exec(dateString);
    return match ? new Date(match[0]) : undefined;
}

export function parseDateString(dateString: string) {
    // Trim the date. Testcase: " 4  0  97"
    dateString = dateString.trim();
    if (dateString.length < 1) {
        return new Date();
    }

    // Remove "st" , "nd" , "rd",  "th", etc.
    const filtered = dateString
        .replace(/\b(\d+)(st|nd|rd|th)\b/g, "$1")
        .replace(/\s+at\s+/i, " ");
    const date = new Date(filtered);
    if (isNaN(date.getTime())) {
        const translated = tryTranslate(dateString);
        if (translated) {
            return translated;
        }
        const dotted = tryDotted(dateString);
        if (dotted) {
            return dotted;
        }
        const awe = tryAWE(dateString);
        if (awe) {
            return awe;
        }

        const year = tryYear(dateString);
        if (year) {
            return year;
        }

        SpessaSynthWarn(
            `Invalid date: "${dateString}". Replacing with the current date!`
        );
        return new Date();
    }
    return date;
}
