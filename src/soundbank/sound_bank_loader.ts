import { BasicSoundBank } from "./basic_soundbank/basic_soundbank";
import { IndexedByteArray } from "../utils/indexed_array";
import { readBinaryStringIndexed } from "../utils/byte_functions/string";
import { SoundFont2 } from "./soundfont/read/soundfont";
import { DownloadableSounds } from "./downloadable_sounds/downloadable_sounds";
import type { SoundBankLoadOptions } from "./types";
import { fillWithDefaults } from "../utils/fill_with_defaults";

/**
 * The default options for loading a sound bank: full loading with copied sample data.
 *
 * @group Sound Banks
 */
export const DEFAULT_SOUND_BANK_LOAD_OPTIONS: SoundBankLoadOptions = {
    sampleData: true,
    copySampleData: true
};

/**
 * A helper class for loading sound bank files as {@link BasicSoundBank} instances.
 *
 * @group Sound Banks
 */
export class SoundBankLoader {
    /**
     * Loads a sound bank from a file buffer.
     *
     * Currently supported formats are:
     *
     * - SoundFont2 - With optional SpessaSynth extensions.
     * - SoundFont3 - Like SoundFont2 but also allows Ogg Vorbis-compressed samples.
     * - DownLoadable Sounds.
     * - SpessaSynth SFe.
     *
     * @param buffer The binary file buffer to load.
     * @param options Options for loading the sample data.
     * @returns The loaded sound bank.
     */
    public static fromArrayBuffer(
        buffer: ArrayBuffer,
        options: Partial<SoundBankLoadOptions> = DEFAULT_SOUND_BANK_LOAD_OPTIONS
    ): BasicSoundBank {
        const opts = fillWithDefaults(options, DEFAULT_SOUND_BANK_LOAD_OPTIONS);
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
        // 64-bit chunk sizes are only defined for SFe (SFe 4.0, section 3.1)
        if (rf64 && id !== "sfen") {
            throw new Error(`Expected 'sfen' in a 'RIFS' file, got '${id}'`);
        }
        if (id === "dls ") {
            // The magic happens here!
            const bank = DownloadableSounds.read(buffer).toSF();
            if (!opts.sampleData) {
                for (const s of bank.samples) s.releaseData();
            }
            return bank;
        }
        return new SoundFont2(buffer, id === "sfen", opts);
    }
}
