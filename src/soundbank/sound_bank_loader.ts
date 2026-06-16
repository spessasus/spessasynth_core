import { BasicSoundBank } from "./basic_soundbank/basic_soundbank";
import { IndexedByteArray } from "../utils/indexed_array";
import { readBinaryStringIndexed } from "../utils/byte_functions/string";
import { SoundFont2 } from "./soundfont/read/soundfont";
import { DownloadableSounds } from "./downloadable_sounds/downloadable_sounds";

export class SoundBankLoader {
    /**
     * Loads a sound bank from a file buffer.
     * @param buffer The binary file buffer to load.
     * @returns The loaded sound bank, a BasicSoundBank instance.
     */
    public static fromArrayBuffer(buffer: ArrayBuffer): BasicSoundBank {
        const riffCheck = buffer.slice(0, 4);
        const riffText = readBinaryStringIndexed(
            new IndexedByteArray(riffCheck),
            4
        );
        if (riffText !== "RIFF" && riffText !== "RIFS") {
            throw new Error(
                `Expected 'RIFF' or 'RIFS' header, got '${riffText}'`
            );
        }

        const rf64 = riffText === "RIFS";

        const check = rf64 ? buffer.slice(12, 16) : buffer.slice(8, 12);
        const id = readBinaryStringIndexed(
            new IndexedByteArray(check),
            4
        ).toLowerCase();
        if (id === "dls ") {
            return this.loadDLS(buffer);
        }
        return new SoundFont2(buffer, id === "sfen");
    }

    private static loadDLS(buffer: ArrayBuffer) {
        const dls = DownloadableSounds.read(buffer);
        return dls.toSF();
    }
}
