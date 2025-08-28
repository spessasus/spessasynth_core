import { BasicSoundBank } from "./basic_soundbank/basic_soundbank";
import { IndexedByteArray } from "../utils/indexed_array";
import { readBinaryStringIndexed } from "../utils/byte_functions/string";
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
            return this.loadDLS(buffer);
        }
        return new SoundFont2(buffer, false);
    }

    private static loadDLS(buffer: ArrayBuffer) {
        const dls = DownloadableSounds.read(buffer);
        return dls.toSF();
    }
}
