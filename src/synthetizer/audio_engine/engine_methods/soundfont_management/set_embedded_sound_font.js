import { loadSoundFont } from "../../../../soundfont/load_soundfont.js";
import { SpessaSynthInfo } from "../../../../utils/loggin.js";
import { consoleColors } from "../../../../utils/other.js";

/**
 * Sets the embedded (RMI soundfont)
 * @param font {ArrayBuffer}
 * @param offset {number}
 * @this {SpessaSynthProcessor}
 */
export function setEmbeddedSoundFont(font, offset)
{
    // set offset
    this.soundfontBankOffset = offset;
    this.clearSoundFont(false, true);
    this.overrideSoundfont = loadSoundFont(font);
    this.updatePresetList();
    this.getDefaultPresets();
    this.midiAudioChannels.forEach(c =>
        c.programChange(c.preset.program)
    );
    // preload all samples
    this.overrideSoundfont.samples.forEach(s => s.getAudioData());
    
    
    // apply snapshot again if applicable
    if (this._snapshot !== undefined)
    {
        this.applySynthesizerSnapshot(this._snapshot);
        this.resetAllControllers();
    }
    SpessaSynthInfo("%cSpessaSynth is ready!", consoleColors.recognized);
}