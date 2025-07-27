import { SoundBankLoader } from "./sound_bank_loader";
import { BasicSoundBank } from "./basic_soundbank/basic_soundbank";

/**
 * Loads a soundfont or dls file.
 * @param buffer {ArrayBuffer} the binary file to load.
 * @returns {BasicSoundBank}
 * @deprecated use SoundBankLoader.fromArrayBuffer instead.
 */
export function loadSoundFont(buffer: ArrayBuffer): BasicSoundBank {
    return SoundBankLoader.fromArrayBuffer(buffer);
}
