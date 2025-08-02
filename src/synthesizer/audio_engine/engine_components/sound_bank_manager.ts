import { SpessaSynthInfo, SpessaSynthWarn } from "../../../utils/loggin";
import { isXGDrums } from "../../../utils/xg_hacks";

import type { SoundBankManagerListEntry } from "../../../soundbank/types";
import type { BasicSoundBank } from "../../../soundbank/basic_soundbank/basic_soundbank";
import type { BasicPreset } from "../../../soundbank/basic_soundbank/basic_preset";

export class SoundBankManager {
    /**
     * All the sound banks, ordered from the most important to the least.
     */
    public soundBankList: SoundBankManagerListEntry[] = [];
    private readonly presetListChangeCallback: () => unknown;

    /**
     * @param presetListChangeCallback Supplied by the parent synthesizer class,
     * this is called whenever the preset list changes.
     */
    public constructor(presetListChangeCallback: () => unknown) {
        this.presetListChangeCallback = presetListChangeCallback;
    }

    private _presetList: {
        bank: number;
        presetName: string;
        program: number;
    }[] = [];

    /**
     * The list of all presets in the sound bank stack.
     */
    public get presetList() {
        return [...this._presetList];
    }

    /**
     * The current sound bank priority order.
     * @returns The IDs of the sound banks in the current order.
     */
    public get priorityOrder() {
        return this.soundBankList.map((s) => s.id);
    }

    /**
     * The current sound bank priority order.
     * @param newList The new order of sound bank IDs.
     */
    public set priorityOrder(newList: string[]) {
        this.soundBankList.sort(
            (a, b) => newList.indexOf(a.id) - newList.indexOf(b.id)
        );
        this.generatePresetList();
    }

    /**
     * Deletes a given sound bank by its ID.
     * @param id the ID of the sound bank to delete.
     */
    public deleteSoundBank(id: string) {
        if (this.soundBankList.length === 0) {
            SpessaSynthWarn("1 soundbank left. Aborting!");
            return;
        }
        const index = this.soundBankList.findIndex((s) => s.id === id);
        if (index === -1) {
            SpessaSynthInfo(
                `No sound bank with id of "${id}" found. Aborting!`
            );
            return;
        }
        this.soundBankList.splice(index, 1);
        this.generatePresetList();
    }

    // Noinspection JSUnusedGlobalSymbols
    /**
     * Adds a new sound bank with a given ID, or replaces an existing one.
     * @param font the sound bank to add.
     * @param id the ID of the sound bank.
     * @param bankOffset the bank offset of the sound bank.
     */
    public addSoundBank(font: BasicSoundBank, id: string, bankOffset = 0) {
        const foundBank = this.soundBankList.find((s) => s.id === id);
        if (foundBank !== undefined) {
            // Replace
            foundBank.soundBank = font;
            foundBank.bankOffset = bankOffset;
        } else {
            this.soundBankList.push({
                id: id,
                soundBank: font,
                bankOffset: bankOffset
            });
        }
        this.generatePresetList();
    }

    /**
     * Gets a given preset from the sound bank stack.
     * @param bankNumber The bank number of the preset.
     * @param programNumber The program number of the preset.
     * @param allowXGDrums If true, allows XG drum presets.
     * @returns An object containing the preset and its bank offset.
     */
    public getPreset(
        bankNumber: number,
        programNumber: number,
        allowXGDrums = false
    ): { preset: BasicPreset; bankOffset: number } {
        if (this.soundBankList.length < 1) {
            throw new Error("No sound banks! Did you forget to add one?");
        }
        const isDrum =
            bankNumber === 128 || (allowXGDrums && isXGDrums(bankNumber));
        for (const sf of this.soundBankList) {
            // Check for the preset (with given offset)
            const preset = sf.soundBank.getPresetNoFallback(
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
            // If not found, advance to the next sound bank
        }
        // If none found, return the first correct preset found
        if (!isDrum) {
            for (const sf of this.soundBankList) {
                const preset = sf.soundBank.presets.find(
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
            // If nothing at all, use the first preset
            const sf = this.soundBankList[0];
            return {
                preset: sf.soundBank.presets[0],
                bankOffset: sf.bankOffset
            };
        } else {
            for (const sf of this.soundBankList) {
                // Check for any drum type (127/128) and matching program
                const p = sf.soundBank.presets.find(
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
                // Check for any drum preset
                const preset = sf.soundBank.presets.find((p) =>
                    p.isDrumPreset(allowXGDrums)
                );
                if (preset) {
                    return {
                        preset: preset,
                        bankOffset: sf.bankOffset
                    };
                }
            }
            // If nothing at all, use the first preset
            const sf = this.soundBankList[0];
            return {
                preset: sf.soundBank.presets[0],
                bankOffset: sf.bankOffset
            };
        }
    }

    // Clears the sound bank list and destroys all sound banks.
    public destroy() {
        this.soundBankList.forEach((s) => {
            s.soundBank.destroySoundBank();
        });
        this.soundBankList = [];
    }

    private generatePresetList() {
        /**
         * <"bank-program", "presetName">
         */
        const presetList: Record<string, string> = {};
        // Gather the presets in reverse and replace if necessary
        for (let i = this.soundBankList.length - 1; i >= 0; i--) {
            const font = this.soundBankList[i];
            /**
             * Prevent preset names from the same sound bank from being overridden
             * if the soundfont has two presets with matching bank and program
             */
            const presets = new Set<string>();
            for (const p of font.soundBank.presets) {
                const bank = Math.min(128, p.bank + font.bankOffset);
                const presetString = `${bank}-${p.program}`;
                if (presets.has(presetString)) {
                    continue;
                }
                presets.add(presetString);
                presetList[presetString] = p.name;
            }
        }

        this._presetList = [];
        for (const [string, name] of Object.entries(presetList)) {
            const pb = string.split("-");
            this._presetList.push({
                presetName: name,
                program: parseInt(pb[1]),
                bank: parseInt(pb[0])
            });
        }
        this.presetListChangeCallback();
    }
}
