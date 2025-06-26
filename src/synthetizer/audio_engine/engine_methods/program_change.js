import { SpessaSynthWarn } from "../../../utils/loggin.js";
import { BasicPreset } from "../../../soundfont/basic_soundfont/basic_preset.js";

/**
 * executes a program change
 * @param programNumber {number}
 * @this {MidiAudioChannel}
 */
export function programChange(programNumber)
{
    if (this.lockPreset)
    {
        return;
    }
    // always 128 for percussion
    let bank = this.getBankSelect();
    
    const isXG = this.isXGChannel;
    const p = this.synth.soundfontManager.getPreset(bank, programNumber, isXG);
    let preset = p.preset;
    if (!preset)
    {
        SpessaSynthWarn("No presets! Using empty fallback.");
        preset = new BasicPreset(this.synth.soundfontManager.soundfontList[0].soundfont);
        preset.presetName = "SPESSA EMPTY FALLBACK PRESET";
    }
    this.setPreset(preset);
    this.sentBank = Math.min(128, preset.bank + p.bankOffset);
    this.synth.callEvent("programchange", {
        channel: this.channelNumber,
        program: preset.program,
        bank: this.sentBank
    });
    this.sendChannelProperty();
}