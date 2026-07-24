import type { MIDIChannel } from "./midi_channel";
import { GS_USER_DRUM_1, GS_USER_DRUM_2 } from "../synth_constants";
import { UserDrumSet } from "../user_drum_set";
import { SpessaLog } from "../../../utils/loggin";
import { DrumParameters } from "./drum_parameters";

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

    // Commit changes made to user drums.
    // SCVA does not play drum sounds until the change is sent, even if this patch was selected before then.
    // See the corresponding test in MIDI tests.
    if (
        preset.isGMGSDrum &&
        (preset.program === GS_USER_DRUM_1 ||
            preset.program === GS_USER_DRUM_2) &&
        !this.synthCore.systemParameters.userDrumLock
    ) {
        // Purge cache for this preset to cache the new drum voice data
        this.synthCore.purgeCachedPatch(preset);
        // Copy drum param data
        if (preset instanceof UserDrumSet) {
            for (let i = 0; i < preset.keyBindings.length; i++) {
                // SC-55 uses 100 cents, SC-88 and above is 50
                // Refer to source binding and do it here
                const binding = preset.keyBindings[i];
                binding.params.pitchCoarse *=
                    binding.patch.bankLSB === 1 ? 1 : 0.5;
                DrumParameters.copyInto(binding.params, this.drumParams[i]);
            }
        } else {
            SpessaLog.warn(
                `Current patch should be GS User Drum! Instead found ${preset.name}.`
            );
        }
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
