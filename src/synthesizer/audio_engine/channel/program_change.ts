import type { MIDIChannel } from "./midi_channel";
import {
    GS_USER_DRUM_1,
    GS_USER_DRUM_2,
    MIDI_DRUM_CHANNEL
} from "../synth_constants";
import { UserDrumSet } from "../user_drum_set";
import { SpessaLog } from "../../../utils/loggin";
import { DrumParameterUtils } from "../../../midi/drum_parameters";
import { ConsoleColors } from "../../../utils/other";
import { BankSelectHacks } from "../../../utils/midi_hacks";

/**
 * Changes the program (preset) of the channel.
 * @param program The program number (0-127) to change to.
 */
export function programChange(this: MIDIChannel, program: number) {
    if (this._systemParameters.presetLock) {
        return;
    }

    // XG and GM2 choose drums by the bank alone, a set drum flag becomes the drum bank
    if (
        this.patch.isGMGSDrum &&
        BankSelectHacks.isSystemXG(this.channelSystem)
    ) {
        this.setIsGMGSDrum(false);
        this.setBankLSB(0);
        this.setBankMSB(BankSelectHacks.getDrumBank(this.channelSystem));
    }

    this.patch.program = program;
    let preset = this.synthCore.soundBankManager.getPreset(
        this.patch,
        this.channelSystem,
        this.channel % 16 === MIDI_DRUM_CHANNEL
    );
    if (!preset) {
        preset = this.synthCore.onMissingPreset(this.patch, this.channelSystem);
        if (!preset) {
            // A channel without a selected preset plays nothing until a later selection finds one (SFe 4.0, section 11.2.3)
            this.preset = undefined;
            // The empty name tells the host there is no preset
            this.synthCore.callEvent("programChange", {
                channel: this.channel,
                bankLSB: this.patch.bankLSB,
                bankMSB: this.patch.bankMSB,
                program: this.patch.program,
                name: "",
                isGMGSDrum: this.patch.isGMGSDrum,
                isDrum: this._drumChannel
            });
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
        SpessaLog.info(
            `%cCommitting changes to User Drum Set ${preset.program - 63}!`,
            ConsoleColors.info
        );
        // Purge cache for this preset to cache the new drum voice data
        this.synthCore.purgeCachedPatch(preset);
        // Copy drum param data
        if (preset instanceof UserDrumSet) {
            for (let i = 0; i < preset.keyParams.length; i++) {
                const binding = preset.keyParams[i];
                DrumParameterUtils.copyInto(binding, this.drumParams[i]);
                // SC-55 uses 100 cents, SC-88 and above is 50
                // Refer to source binding and convert the copy to semitones
                this.drumParams[i].pitchCoarse *=
                    binding.sourceDrumSet === 1 ? 1 : 0.5;
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
