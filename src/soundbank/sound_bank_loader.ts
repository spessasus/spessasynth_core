import { BasicSoundBank } from "./basic_soundbank/basic_soundbank";
import { IndexedByteArray } from "../utils/indexed_array";
import { readBinaryStringIndexed } from "../utils/byte_functions/string";
import { DLSSoundBank } from "./downloadable_sounds/read/downloadable_sounds";
import { SoundFont2 } from "./soundfont/read/soundfont";
import { DownloadableSounds } from "./downloadable_sounds/structure/downloadable_sounds";

export class SoundBankLoader {
    /**
     * Loads a sound bank from a file buffer.
     * @param buffer The binary file buffer to load.
     * @returns {BasicSoundBank} The loaded sound bank, either a DLSSoundBank or SoundFont2 instance.
     */
    public static fromArrayBuffer(buffer: ArrayBuffer): BasicSoundBank {
        const check = buffer.slice(8, 12);
        const a = new IndexedByteArray(check);
        const id = readBinaryStringIndexed(a, 4).toLowerCase();
        if (id === "dls ") {
            console.log(DownloadableSounds.read(buffer));
            return new DLSSoundBank(buffer);
        }
        return new SoundFont2(buffer, false);
    }
}
