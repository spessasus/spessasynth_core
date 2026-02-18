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
    let preset = this.synthCore.soundBankManager.getPreset(
        this.patch,
        this.channelSystem
    );
    if (!preset) {
        preset = this.synthCore.missingPresetHandler(
            this.patch,
            this.channelSystem
        );
        if (!preset) {
            return;
        }
    }

    this.preset = preset;

    // Drums first
    // SC resets drum params on program change
    if (preset.isAnyDrums !== this.drumChannel) {
        this.setDrumFlag(preset.isAnyDrums);
    }
    this.resetDrumParams();
    // Do not spread the preset as we don't want to copy it entirely.
    this.synthCore.callEvent("programChange", {
        channel: this.channel,
        bankLSB: this.preset.bankLSB,
        bankMSB: this.preset.bankMSB,
        program: this.preset.program,
        isGMGSDrum: this.preset.isGMGSDrum
    });
    this.sendChannelProperty();
}
