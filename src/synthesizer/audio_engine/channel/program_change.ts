import type { MIDIChannel } from "./midi_channel";
import { GS_USER_DRUM_1, GS_USER_DRUM_2 } from "../synth_constants";

/**
 * Changes the program (preset) of the channel.
 * @param program The program number (0-127) to change to.
 */
export function programChange(this: MIDIChannel, program: number) {
    if (this._systemParameters.presetLock) {
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
    if (preset.isDrum !== this._drumChannel) {
        this.setDrumFlag(preset.isDrum);
    }
    this.resetDrumParams();

    // Commit changes made to user drums by purging their cache.
    // SCVA does not play drum sounds until the change is sent, even if this patch was selected before then.
    // See the corresponding test in MIDI tests.
    if (
        preset.isGMGSDrum &&
        (preset.program === GS_USER_DRUM_1 || preset.program === GS_USER_DRUM_2)
    ) {
        this.synthCore.purgeCachedPatch(preset);
    }

    // Do not spread the preset as we don't want to copy it entirely.
    this.synthCore.callEvent("programChange", {
        channel: this.channel,
        bankLSB: this.preset.bankLSB,
        bankMSB: this.preset.bankMSB,
        program: this.preset.program,
        name: this.preset.name,
        isGMGSDrum: this.preset.isGMGSDrum,
        isDrum: this.preset.isDrum
    });
}
