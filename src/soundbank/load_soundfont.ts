import { BasicSoundBank } from "./basic_soundbank/basic_soundbank";

/**
 * Loads a soundfont or dls file.
 * @param buffer {ArrayBuffer} the binary file to load.
 * @returns {BasicSoundBank}
 * @deprecated use BasicSoundBank.fromArrayBuffer instead.
 */
export function loadSoundFont(buffer: ArrayBuffer): BasicSoundBank {
    return BasicSoundBank.fromArrayBuffer(buffer);
}
