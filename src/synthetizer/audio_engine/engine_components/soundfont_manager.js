import { SpessaSynthInfo, SpessaSynthWarn } from "../../../utils/loggin.js";
import { isXGDrums } from "../../../utils/xg_hacks.js";
import { EMBEDDED_SOUND_BANK_ID } from "../../synth_constants.js";

/**
 * @typedef {Object} SoundFontType
 * @property {string} id - unique id for the soundfont
 * @property {BasicSoundBank} soundfont - the soundfont itself
 * @property {number} bankOffset - the soundfont's bank offset
 */

export class SoundFontManager
{
    /**
     * All the soundfonts, ordered from the most important to the least.
     * @type {SoundFontType[]}
     */
    soundfontList = [];
    /**
     * @type {{bank: number, presetName: string, program: number}[]}
     */
    presetList = [];
    
    /**
     * @param presetListChangeCallback {function} to call when stuff changes
     */
    constructor(presetListChangeCallback)
    {
        this.presetListChangeCallback = presetListChangeCallback;
    }
    
    generatePresetList()
    {
        /**
         * <"bank-program", "presetName">
         * @type {Object<string, string>}
         */
        const presetList = {};
        // gather the presets in reverse and replace if necessary
        for (let i = this.soundfontList.length - 1; i >= 0; i--)
        {
            const font = this.soundfontList[i];
            /**
             * prevent preset names from the same soudfont from being overriden
             * if the soundfont has two presets with matching bank and program
             * @type {Set<string>}
             */
            const presets = new Set();
            for (const p of font.soundfont.presets)
            {
                const bank = Math.min(128, p.bank + font.bankOffset);
                const presetString = `${bank}-${p.program}`;
                if (presets.has(presetString))
                {
                    continue;
                }
                presets.add(presetString);
                presetList[presetString] = p.presetName;
            }
        }
        
        this.presetList = [];
        for (const [string, name] of Object.entries(presetList))
        {
            const pb = string.split("-");
            this.presetList.push({
                presetName: name,
                program: parseInt(pb[1]),
                bank: parseInt(pb[0])
            });
        }
        this.presetListChangeCallback();
    }
    
    /**
     * Get the final preset list
     * @returns {{bank: number, presetName: string, program: number}[]}
     */
    getPresetList()
    {
        return this.presetList.slice();
    }
    
    // noinspection JSUnusedGlobalSymbols
    /**
     * Clears all soundfonts and adds a new one with an ID "main"
     * @param soundFont {BasicSoundBank}
     */
    reloadManager(soundFont)
    {
        // do not clear the embedded bank
        this.soundfontList = this.soundfontList.filter(sf => sf.id === EMBEDDED_SOUND_BANK_ID);
        this.soundfontList.push({
            id: "main",
            bankOffset: 0,
            soundfont: soundFont
        });
        this.generatePresetList();
    }
    
    // noinspection JSUnusedGlobalSymbols
    /**
     * Deletes a given soundfont.
     * @param id {string}
     */
    deleteSoundFont(id)
    {
        if (this.soundfontList.length === 0)
        {
            SpessaSynthWarn("1 soundfont left. Aborting!");
            return;
        }
        const index = this.soundfontList.findIndex(s => s.id === id);
        if (index === -1)
        {
            SpessaSynthInfo(`No soundfont with id of "${id}" found. Aborting!`);
            return;
        }
        delete this.soundfontList[index].soundfont.presets;
        delete this.soundfontList[index].soundfont.instruments;
        delete this.soundfontList[index].soundfont.samples;
        this.soundfontList.splice(index, 1);
        this.generatePresetList();
    }
    
    // noinspection JSUnusedGlobalSymbols
    /**
     * Adds a new soundfont with a given ID
     * @param font {BasicSoundBank}
     * @param id {string}
     * @param bankOffset {number}
     */
    addNewSoundFont(font, id, bankOffset)
    {
        if (this.soundfontList.find(s => s.id === id) !== undefined)
        {
            // replace
            const soundfont = this.soundfontList.find(s => s.id === id);
            soundfont.soundfont = font;
            soundfont.bankOffset = bankOffset;
        }
        else
        {
            this.soundfontList.push({
                id: id,
                soundfont: font,
                bankOffset: bankOffset
            });
        }
        this.generatePresetList();
    }
    
    /**
     * Gets the current soundfont order
     * @returns {string[]}
     */
    getCurrentSoundFontOrder()
    {
        return this.soundfontList.map(s => s.id);
    }
    
    // noinspection JSUnusedGlobalSymbols
    /**
     * Rearranges the soundfonts
     * @param newList {string[]} the order of soundfonts, a list of strings, first overwrites second
     */
    rearrangeSoundFonts(newList)
    {
        this.soundfontList.sort((a, b) =>
            newList.indexOf(a.id) - newList.indexOf(b.id)
        );
        this.generatePresetList();
    }
    
    /**
     * Gets a given preset from the soundfont stack
     * @param bankNumber {number}
     * @param programNumber {number}
     * @param allowXGDrums {boolean} if true, allows XG drum banks (120, 126 and 127) as drum preset
     * @returns {{preset: BasicPreset, bankOffset: number}} the preset and its bank offset
     */
    getPreset(bankNumber, programNumber, allowXGDrums = false)
    {
        if (this.soundfontList.length < 1)
        {
            throw new Error("No soundfonts! Did you forget to add one?");
        }
        const isDrum = bankNumber === 128 || (allowXGDrums && isXGDrums(bankNumber));
        for (const sf of this.soundfontList)
        {
            // check for the preset (with given offset)
            const preset = sf.soundfont.getPresetNoFallback(
                bankNumber === 128 ? 128 : bankNumber - sf.bankOffset,
                programNumber,
                allowXGDrums
            );
            if (preset !== undefined)
            {
                return {
                    preset: preset,
                    bankOffset: sf.bankOffset
                };
            }
            // if not found, advance to the next soundfont
        }
        // if none found, return the first correct preset found
        if (!isDrum)
        {
            for (const sf of this.soundfontList)
            {
                const preset = sf.soundfont.presets.find(p => p.program === programNumber && !p.isDrumPreset(
                    allowXGDrums));
                if (preset)
                {
                    return {
                        preset: preset,
                        bankOffset: sf.bankOffset
                    };
                }
            }
            // if nothing at all, use the first preset
            const sf = this.soundfontList[0];
            return {
                preset: sf.soundfont.presets[0],
                bankOffset: sf.bankOffset
            };
        }
        else
        {
            for (const sf of this.soundfontList)
            {
                // check for any drum type (127/128) and matching program
                const p = sf.soundfont.presets.find(p => p.isDrumPreset(allowXGDrums) && p.program === programNumber);
                if (p)
                {
                    return {
                        preset: p,
                        bankOffset: sf.bankOffset
                    };
                }
                // check for any drum preset
                const preset = sf.soundfont.presets.find(p => p.isDrumPreset(allowXGDrums));
                if (preset)
                {
                    return {
                        preset: preset,
                        bankOffset: sf.bankOffset
                    };
                }
            }
            // if nothing at all, use the first preset
            const sf = this.soundfontList[0];
            return {
                preset: sf.soundfont.presets[0],
                bankOffset: sf.bankOffset
            };
        }
    }
    
    destroyManager()
    {
        this.soundfontList.forEach(s =>
        {
            s.soundfont.destroySoundBank();
        });
        delete this.soundfontList;
    }
}