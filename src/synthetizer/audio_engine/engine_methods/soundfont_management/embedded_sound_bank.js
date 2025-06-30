import { loadSoundFont } from "../../../../soundfont/load_soundfont.js";
import { SpessaSynthInfo } from "../../../../utils/loggin.js";
import { consoleColors } from "../../../../utils/other.js";
import { EMBEDDED_SOUND_BANK_ID } from "../../../synth_constants.js";

/**
 * @this {SpessaSynthProcessor}
 */
export function clearEmbeddedBank()
{
    if (this.soundfontManager.soundfontList.some(s => s.id === EMBEDDED_SOUND_BANK_ID))
    {
        this.soundfontManager.deleteSoundFont(EMBEDDED_SOUND_BANK_ID);
    }
}

/**
 * Sets the embedded (RMI soundfont)
 * @param font {ArrayBuffer}
 * @param offset {number}
 * @this {SpessaSynthProcessor}
 */
export function setEmbeddedSoundFont(font, offset)
{
    // the embedded bank is set as the first bank in the manager,
    // with a special ID that does not clear when reloadManager is performed.
    const loadedFont = loadSoundFont(font);
    this.soundfontManager.addNewSoundFont(loadedFont, EMBEDDED_SOUND_BANK_ID, offset);
    // rearrange so the embedded is first (most important as it overrides all others)
    const order = this.soundfontManager.getCurrentSoundFontOrder();
    order.pop();
    order.unshift(EMBEDDED_SOUND_BANK_ID);
    this.soundfontManager.rearrangeSoundFonts(order);
    
    
    // apply snapshot again if applicable
    if (this._snapshot !== undefined)
    {
        this.applySynthesizerSnapshot(this._snapshot);
    }
    SpessaSynthInfo(`%cEmbedded sound bank set at offset %c${offset}`, consoleColors.recognized, consoleColors.value);
}