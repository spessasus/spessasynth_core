import type { SoundBankLoadOptions } from "./types";

/**
 * The default options for loading a sound bank: full loading with copied sample data.
 *
 * @group Sound Banks
 */
export const DEFAULT_SOUND_BANK_LOAD_OPTIONS: SoundBankLoadOptions = {
    sampleData: true,
    copySampleData: true
};
