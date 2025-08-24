import { SpessaSynthWarn } from "../../../utils/loggin";
import { BasicPreset } from "../../../soundbank/basic_soundbank/basic_preset";
import type { MIDIChannel } from "../engine_components/midi_channel";

/**
 * Changes the program (preset) of the channel.
 * @param program The program number (0-127) to change to.
 */
export function programChange(this: MIDIChannel, program: number) {
    if (this.lockPreset) {
        return;
    }

    this.patch.program = program;
    let preset = this.synth.soundBankManager.getPreset(
        this.patch,
        this.channelSystem
    );
    if (!preset) {
        SpessaSynthWarn("No presets! Using empty fallback.");
        preset = new BasicPreset(
            this.synth.soundBankManager.soundBankList[0].soundBank
        );
        // Fallback preset, make it scream so it's easy to notice :-)
        preset.name = "SPESSA EMPTY FALLBACK PRESET";
    }
    this.preset = preset;
    // Do not spread the preset as we don't want to copy it entirely.
    this.synthProps.callEvent("programChange", {
        channel: this.channelNumber,
        bankLSB: this.preset.bankLSB,
        bankMSB: this.preset.bankMSB,
        program: this.preset.program,
        isGMGSDrum: this.preset.isGMGSDrum
    });
    if (preset.isAnyDrums !== this.drumChannel) {
        this.setDrumFlag(preset.isAnyDrums);
    }
    this.sendChannelProperty();
}
