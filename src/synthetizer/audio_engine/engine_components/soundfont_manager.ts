import { SpessaSynthInfo, SpessaSynthWarn } from "../../../utils/loggin";
import { isXGDrums } from "../../../utils/xg_hacks";
import { EMBEDDED_SOUND_BANK_ID } from "../synth_constants";

import type { SoundBankManagerListEntry } from "../../../soundbank/types";
import type { BasicSoundBank } from "../../../soundbank/basic_soundbank/basic_soundbank";
import type { BasicPreset } from "../../../soundbank/basic_soundbank/basic_preset";

export class SoundFontManager {
    /**
     * All the soundfonts, ordered from the most important to the least.
     */
    soundBankList: SoundBankManagerListEntry[] = [];
    presetList: { bank: number; presetName: string; program: number }[] = [];
    private readonly presetListChangeCallback: { (): unknown };

    /**
     * @param presetListChangeCallback Supplied by the parent synthesizer class,
     * this is called whenever the preset list changes.
     */
    constructor(presetListChangeCallback: () => unknown) {
        this.presetListChangeCallback = presetListChangeCallback;
    }

    /**
     * Gets the list of all presets in the sound bank stack.
     */
    getPresetList(): { bank: number; presetName: string; program: number }[] {
        return this.presetList.slice();
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Clears the sound bank list and adds the provided sound bank with the ID "main".
     * @param mainSoundBank The main sound bank to use.
     */
    reloadManager(mainSoundBank: BasicSoundBank) {
        // do not clear the embedded bank
        this.soundBankList = this.soundBankList.filter(
            (sf) => sf.id === EMBEDDED_SOUND_BANK_ID
        );
        this.soundBankList.push({
            id: "main",
            bankOffset: 0,
            soundfont: mainSoundBank
        });
        this.generatePresetList();
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Deletes a given sound bank by its ID.
     * @param id the ID of the sound bank to delete.
     */
    deleteSoundFont(id: string) {
        if (this.soundBankList.length === 0) {
            SpessaSynthWarn("1 soundbank left. Aborting!");
            return;
        }
        const index = this.soundBankList.findIndex((s) => s.id === id);
        if (index === -1) {
            SpessaSynthInfo(`No soundfont with id of "${id}" found. Aborting!`);
            return;
        }
        this.soundBankList.splice(index, 1);
        this.generatePresetList();
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Adds a new sound bank with a given ID, or replaces an existing one.
     * @param font the sound bank to add.
     * @param id the ID of the sound bank.
     * @param bankOffset the bank offset of the sound bank.
     */
    addNewSoundFont(font: BasicSoundBank, id: string, bankOffset: number) {
        const foundBank = this.soundBankList.find((s) => s.id === id);
        if (foundBank !== undefined) {
            // replace
            foundBank.soundfont = font;
            foundBank.bankOffset = bankOffset;
        } else {
            this.soundBankList.push({
                id: id,
                soundfont: font,
                bankOffset: bankOffset
            });
        }
        this.generatePresetList();
    }

    /**
     * Gets the current sound bank order.
     * @returns The IDs of the sound banks in the current order.
     */
    getCurrentSoundFontOrder(): string[] {
        return this.soundBankList.map((s) => s.id);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Rearranges the sound banks in the order specified by the new list.
     * @param newList The new order of sound bank IDs.
     */
    rearrangeSoundFonts(newList: string[]) {
        this.soundBankList.sort(
            (a, b) => newList.indexOf(a.id) - newList.indexOf(b.id)
        );
        this.generatePresetList();
    }

    /**
     * Gets a given preset from the sound bank stack.
     * @param bankNumber The bank number of the preset.
     * @param programNumber The program number of the preset.
     * @param allowXGDrums If true, allows XG drum presets.
     * @returns An object containing the preset and its bank offset.
     */
    getPreset(
        bankNumber: number,
        programNumber: number,
        allowXGDrums: boolean = false
    ): { preset: BasicPreset; bankOffset: number } {
        if (this.soundBankList.length < 1) {
            throw new Error("No soundfonts! Did you forget to add one?");
        }
        const isDrum =
            bankNumber === 128 || (allowXGDrums && isXGDrums(bankNumber));
        for (const sf of this.soundBankList) {
            // check for the preset (with given offset)
            const preset = sf.soundfont.getPresetNoFallback(
                bankNumber === 128 ? 128 : bankNumber - sf.bankOffset,
                programNumber,
                allowXGDrums
            );
            if (preset !== undefined) {
                return {
                    preset: preset,
                    bankOffset: sf.bankOffset
                };
            }
            // if not found, advance to the next soundfont
        }
        // if none found, return the first correct preset found
        if (!isDrum) {
            for (const sf of this.soundBankList) {
                const preset = sf.soundfont.presets.find(
                    (p) =>
                        p.program === programNumber &&
                        !p.isDrumPreset(allowXGDrums)
                );
                if (preset) {
                    return {
                        preset: preset,
                        bankOffset: sf.bankOffset
                    };
                }
            }
            // if nothing at all, use the first preset
            const sf = this.soundBankList[0];
            return {
                preset: sf.soundfont.presets[0],
                bankOffset: sf.bankOffset
            };
        } else {
            for (const sf of this.soundBankList) {
                // check for any drum type (127/128) and matching program
                const p = sf.soundfont.presets.find(
                    (p) =>
                        p.isDrumPreset(allowXGDrums) &&
                        p.program === programNumber
                );
                if (p) {
                    return {
                        preset: p,
                        bankOffset: sf.bankOffset
                    };
                }
                // check for any drum preset
                const preset = sf.soundfont.presets.find((p) =>
                    p.isDrumPreset(allowXGDrums)
                );
                if (preset) {
                    return {
                        preset: preset,
                        bankOffset: sf.bankOffset
                    };
                }
            }
            // if nothing at all, use the first preset
            const sf = this.soundBankList[0];
            return {
                preset: sf.soundfont.presets[0],
                bankOffset: sf.bankOffset
            };
        }
    }

    // Clears the sound bank list and destroys all sound banks.
    destroyManager() {
        this.soundBankList.forEach((s) => {
            s.soundfont.destroySoundBank();
        });
        this.soundBankList = [];
    }

    private generatePresetList() {
        /**
         * <"bank-program", "presetName">
         */
        const presetList: Record<string, string> = {};
        // gather the presets in reverse and replace if necessary
        for (let i = this.soundBankList.length - 1; i >= 0; i--) {
            const font = this.soundBankList[i];
            /**
             * prevent preset names from the same sound bank from being overridden
             * if the soundfont has two presets with matching bank and program
             */
            const presets = new Set<string>();
            for (const p of font.soundfont.presets) {
                const bank = Math.min(128, p.bank + font.bankOffset);
                const presetString = `${bank}-${p.program}`;
                if (presets.has(presetString)) {
                    continue;
                }
                presets.add(presetString);
                presetList[presetString] = p.name;
            }
        }

        this.presetList = [];
        for (const [string, name] of Object.entries(presetList)) {
            const pb = string.split("-");
            this.presetList.push({
                presetName: name,
                program: parseInt(pb[1]),
                bank: parseInt(pb[0])
            });
        }
        this.presetListChangeCallback();
    }
}
