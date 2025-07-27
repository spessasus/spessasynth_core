import { SpessaSynthWarn } from "../../../utils/loggin";
import { BasicPreset } from "../../../soundbank/basic_soundbank/basic_preset";
import type { MIDIChannel } from "../engine_components/midi_audio_channel";

/**
 * Changes the program (preset) of the channel.
 * @param programNumber The program number (0-127) to change to.
 */
export function programChange(this: MIDIChannel, programNumber: number) {
    if (this.lockPreset) {
        return;
    }
    // always 128 for percussion
    const bank = this.getBankSelect();

    const isXG = this.isXGChannel;
    const p = this.synth.soundfontManager.getPreset(bank, programNumber, isXG);
    let preset = p.preset;
    if (!preset) {
        SpessaSynthWarn("No presets! Using empty fallback.");
        preset = new BasicPreset(
            this.synth.soundfontManager.soundBankList[0].soundfont
        );
        // fallback preset, make it scream so it's easy to notice :-)
        preset.name = "SPESSA EMPTY FALLBACK PRESET";
    }
    this.setPreset(preset);
    this.sentBank = Math.min(128, preset.bank + p.bankOffset);
    this.synthProps.callEvent("programchange", {
        channel: this.channelNumber,
        program: preset.program,
        bank: this.sentBank
    });
    this.sendChannelProperty();
}
