import { SpessaSynthWarn } from "../../../utils/loggin";

import type { SoundBankManagerListEntry } from "../../../soundbank/types";
import type { BasicSoundBank } from "../../../soundbank/basic_soundbank/basic_soundbank";
import { BasicPreset } from "../../../soundbank/basic_soundbank/basic_preset";
import type { PresetListEntry, SynthSystem } from "../../types";
import { selectPreset } from "../../../soundbank/basic_soundbank/preset_selector";
import {
    type MIDIPatch,
    MIDIPatchTools
} from "../../../soundbank/basic_soundbank/midi_patch";
import { BankSelectHacks } from "../../../utils/midi_hacks";

class SoundBankManagerPreset extends BasicPreset {
    public constructor(p: BasicPreset, offset: number) {
        super(p.parentSoundBank, p.globalZone);
        this.bankMSB = BankSelectHacks.addBankOffset(
            p.bankMSB,
            offset,
            p.isXGDrums
        );

        this.name = p.name;
        this.bankLSB = p.bankLSB;
        this.isGMGSDrum = p.isGMGSDrum;
        this.program = p.program;

        this.genre = p.genre;
        this.morphology = p.morphology;
        this.library = p.library;
        this.zones = p.zones;
    }
}

export class SoundBankManager {
    /**
     * All the sound banks, ordered from the most important to the least.
     */
    public soundBankList: SoundBankManagerListEntry[] = [];
    private readonly presetListChangeCallback: () => unknown;

    private selectablePresetList: SoundBankManagerPreset[] = [];

    /**
     * @param presetListChangeCallback Supplied by the parent synthesizer class,
     * this is called whenever the preset list changes.
     */
    public constructor(presetListChangeCallback: () => unknown) {
        this.presetListChangeCallback = presetListChangeCallback;
    }

    private _presetList: PresetListEntry[] = [];

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
            throw new Error(`No sound bank with id "${id}"`);
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
     * @param patch The MIDI patch to get.
     * @param system The MIDI system to select the preset for.
     * @returns An object containing the preset and its bank offset.
     */
    public getPreset(patch: MIDIPatch, system: SynthSystem): BasicPreset {
        if (this.soundBankList.length < 1) {
            throw new Error("No sound banks! Did you forget to add one?");
        }

        return selectPreset(this.selectablePresetList, patch, system);
    }

    // Clears the sound bank list and destroys all sound banks.
    public destroy() {
        this.soundBankList.forEach((s) => {
            s.soundBank.destroySoundBank();
        });
        this.soundBankList = [];
    }

    private generatePresetList() {
        const presetList = new Array<SoundBankManagerPreset>();

        const addedPresets = new Set<string>();
        this.soundBankList.forEach((s) => {
            const bank = s.soundBank;
            const bankOffset = s.bankOffset;
            bank.presets.forEach((p) => {
                const selectablePreset = new SoundBankManagerPreset(
                    p,
                    bankOffset
                );
                if (!addedPresets.has(selectablePreset.toMIDIString())) {
                    addedPresets.add(selectablePreset.toMIDIString());
                    presetList.push(selectablePreset);
                }
            });
        });
        presetList.sort(MIDIPatchTools.sorter.bind(MIDIPatchTools));
        this.selectablePresetList = presetList;
        this._presetList = presetList.map((p) => {
            return {
                bankMSB: p.bankMSB,
                bankLSB: p.bankLSB,
                program: p.program,
                isGMGSDrum: p.isGMGSDrum,
                name: p.name,
                isAnyDrums: p.isAnyDrums
            };
        });
        this.presetListChangeCallback();
    }
}
