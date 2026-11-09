import type { MIDISystem } from "../../soundbank/types";
import type { BasicSoundBank } from "../../soundbank/basic_soundbank/basic_soundbank";
import { BasicPreset } from "../../soundbank/basic_soundbank/basic_preset";
import {
    type MIDIPatch,
    type MIDIPatchFull,
    MIDIPatchTools
} from "../../soundbank/basic_soundbank/midi_patch";
import { BankSelectHacks } from "../../utils/midi_hacks";
import type { SoundBankManagerListEntry, SynthesizerPatch } from "../types";
import { UserDrumSet } from "./user_drum_set";
import { GS_USER_DRUM_1, GS_USER_DRUM_2 } from "./synth_constants";

/**
 * A modified version of basic preset that seamlessly integrates bank offset.
 */
class SoundBankManagerPreset extends BasicPreset implements SynthesizerPatch {
    public constructor(p: BasicPreset, offset: number) {
        super(p.parentSoundBank, p.globalZone);
        this.bankMSB = BankSelectHacks.addBankOffset(p.bankMSB, offset, true);

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

/**
 * Manages the sound banks of the parent {@link SpessaSynthProcessor}.
 *
 * It can be accessed through {@link SpessaSynthProcessor.soundBankManager}.
 *
 * @group Synthesizer.Sound Bank Integration
 */
export class SoundBankManager {
    /**
     * All the sound banks, ordered from the most important to the least.
     */
    public soundBankList: SoundBankManagerListEntry[] = [];
    /**
     * The two GS user drum sets, available on programs 65 and 66.
     * These override any sound bank presets at those program numbers.
     * Note that these are not selectable in XG mode (implied by the bank selection system)
     * @internal
     */
    public readonly userDrumSets: readonly [UserDrumSet, UserDrumSet];
    private readonly presetListChangeCallback: (resetSynth: boolean) => unknown;
    private readonly bankRemovedCallback?: (bank: BasicSoundBank) => unknown;

    private selectablePresetList: SynthesizerPatch[] = [];

    /**
     * @internal
     * @param presetListChangeCallback Supplied by the parent synthesizer class,
     * this is called whenever the preset list changes.
     * The argument tells if the synthesizer should reset after updating its channels.
     * @param bankRemovedCallback Called when a sound bank leaves the manager (deleted, replaced or destroyed),
     * so the synthesizer can drop what it holds of it.
     */
    public constructor(
        presetListChangeCallback: (resetSynth: boolean) => unknown,
        bankRemovedCallback?: (bank: BasicSoundBank) => unknown
    ) {
        this.presetListChangeCallback = presetListChangeCallback;
        this.bankRemovedCallback = bankRemovedCallback;

        // Patch resolver for GS user drum
        const resolvePatch = (patch: MIDIPatch) =>
            this.getPreset(patch, this.systemGetter());

        this.userDrumSets = [
            new UserDrumSet(GS_USER_DRUM_1, "User Drum Set 1", resolvePatch),
            new UserDrumSet(GS_USER_DRUM_2, "User Drum Set 2", resolvePatch)
        ];
    }

    private _presetList: MIDIPatchFull[] = [];

    /**
     * The list of all presets in the sound bank stack with bank offsets applied.
     *
     * > **Warning**
     * >
     * > `isDrum` is the correct way of distinguishing between drum and melodic presets.
     * >
     * > _Do not_ use `isGMGSDrum` as the indication!
     */
    public get presetList() {
        return [...this._presetList];
    }

    /**
     * The current sound bank priority order.
     *
     * Presets in the first bank override the second bank if they have the same MIDI patch and so on.
     * @returns The IDs of the sound banks in the current order.
     */
    public get priorityOrder() {
        return this.soundBankList.map((s) => s.id);
    }

    /**
     * The current sound bank priority order.
     *
     * Presets in the first bank override the second bank if they have the same MIDI patch and so on.
     * @param newList The new order of sound bank IDs.
     */
    public set priorityOrder(newList: string[]) {
        // Banks missing from the list keep their relative order at the end
        const rank = (id: string) => {
            const index = newList.indexOf(id);
            return index === -1 ? newList.length : index;
        };
        this.soundBankList.sort((a, b) => rank(a.id) - rank(b.id));
        this.generatePresetList();
    }

    /**
     * A getter that returns the current MIDI system.
     * Used by the custom drum sets to resolve patches.
     * @internal
     */
    public systemGetter: () => MIDISystem = () => "gs";

    /**
     * This method removes a sound bank with a given ID from the sound bank list.
     * @param id The ID of the sound bank to delete.
     * @param reset If the synthesizer should reset (put every channel's controllers back to defaults) after the change.
     * Set it to `false` to keep a song playing, the channels then only update to the new presets.
     * @throws Error An error if there's no sound bank with the given ID.
     */
    public deleteSoundBank(id: string, reset = true) {
        const index = this.soundBankList.findIndex((s) => s.id === id);
        if (index === -1) {
            throw new Error(`No sound bank with id "${id}"`);
        }
        const [removed] = this.soundBankList.splice(index, 1);
        this.bankRemoved(removed.soundBank);
        this.generatePresetList(reset);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Adds a new sound bank with a given ID, or replaces an existing one.
     * @param bank The sound bank to add.
     * @param id The unique ID to assign to the sound bank.
     * If a sound bank with this ID already exists, it will be replaced.
     * @param bankOffset The bank offset of the sound bank. Offsets the bank MSB value of all presets in this sound bank.
     * Presets that would end up above bank 127 are left out.
     * @param reset If the synthesizer should reset (put every channel's controllers back to defaults) after the change.
     * Set it to `false` to keep a song playing, the channels then only update to the new presets.
     */
    public addSoundBank(
        bank: BasicSoundBank,
        id: string,
        bankOffset = 0,
        reset = true
    ) {
        const foundBank = this.soundBankList.find((s) => s.id === id);
        if (foundBank === undefined) {
            this.soundBankList.push({
                id: id,
                soundBank: bank,
                bankOffset: bankOffset
            });
        } else {
            // Replace
            const old = foundBank.soundBank;
            foundBank.soundBank = bank;
            foundBank.bankOffset = bankOffset;
            this.bankRemoved(old);
        }
        this.generatePresetList(reset);
    }

    /**
     * Rebuilds the preset list from the current sound banks.
     * Call it after editing a sound bank that is already added,
     * for example after adding, removing or renumbering presets.
     *
     * The synthesizer then updates its channels to the new presets without resetting,
     * see {@link SpessaSynthProcessor.refreshPresets}.
     */
    public refresh() {
        this.generatePresetList(false);
    }

    /**
     * Gets a given preset from the sound bank stack.
     * @param patch The MIDI patch to search for.
     * @param system The MIDI system to select the preset for.
     * @returns The preset with the added bank offset or undefined if no sound banks are present.
     * @internal
     */
    public getPreset(
        patch: MIDIPatch,
        system: MIDISystem
    ): SynthesizerPatch | undefined {
        if (
            this.soundBankList.length === 0 ||
            this.selectablePresetList.length === 0
        ) {
            return undefined;
        }

        return MIDIPatchTools.selectPatch(
            this.selectablePresetList,
            patch,
            system
        );
    }

    /**
     * Clears the sound bank list and destroys all sound banks.
     *
     * @internal
     */
    public destroy() {
        for (const s of this.soundBankList) {
            this.bankRemovedCallback?.(s.soundBank);
            s.soundBank.destroySoundBank();
        }
        this.soundBankList = [];
        this.selectablePresetList = [];
        this._presetList = [];
    }

    private bankRemoved(bank: BasicSoundBank) {
        // The same bank can be added under another ID,
        // Its samples are still in use then
        if (!this.soundBankList.some((s) => s.soundBank === bank)) {
            this.bankRemovedCallback?.(bank);
        }
    }

    private generatePresetList(resetSynth = true) {
        const presetList = new Array<SynthesizerPatch>();

        const addedPresets = new Set<string>();

        const totalPresets = this.soundBankList.reduce(
            (sum, cur) => sum + cur.soundBank.presets.length,
            0
        );

        // If there are no presets, don't report as having GS user drums
        if (totalPresets > 0) {
            // Add custom drum sets first so they take priority
            for (const drumSet of this.userDrumSets) {
                const key = MIDIPatchTools.toMIDIString(drumSet);
                if (!addedPresets.has(key)) {
                    addedPresets.add(key);
                    presetList.push(drumSet);
                }
            }
        }

        for (const s of this.soundBankList) {
            const bank = s.soundBank;
            const bankOffset = s.bankOffset;
            for (const p of bank.presets) {
                // A preset offset past bank 127 can't be selected.
                // For RMIDI spec compliance.
                if (
                    p.bankMSB + bankOffset > 127 &&
                    !BankSelectHacks.isXGDrum(p.bankMSB)
                ) {
                    continue;
                }
                const selectablePreset = new SoundBankManagerPreset(
                    p,
                    bankOffset
                );
                const key = selectablePreset.toMIDIString();
                if (!addedPresets.has(key)) {
                    addedPresets.add(key);
                    presetList.push(selectablePreset);
                }
            }
        }
        presetList.sort(MIDIPatchTools.compare.bind(MIDIPatchTools));
        this.selectablePresetList = presetList;
        this._presetList = presetList.map((p) => {
            return {
                bankMSB: p.bankMSB,
                bankLSB: p.bankLSB,
                program: p.program,
                isGMGSDrum: p.isGMGSDrum,
                name: p.name,
                isDrum: p.isDrum
            };
        });
        this.presetListChangeCallback(resetSynth);
    }
}
