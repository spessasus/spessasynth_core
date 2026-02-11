import { SpessaSynthWarn } from "../../../../utils/loggin";
import type { MIDIChannel } from "../../engine_components/midi_channel";
import { customControllers } from "../../../enums";
import { midiControllers } from "../../../../midi/enums";

/**
 * Releases a note by its MIDI note number.
 * If the note is in high performance mode and the channel is not a drum channel,
 * it kills the note instead of releasing it.
 * @param midiNote The MIDI note number to release (0-127).
 */
export function noteOff(this: MIDIChannel, midiNote: number) {
    if (midiNote > 127 || midiNote < 0) {
        SpessaSynthWarn(`Received a noteOn for note`, midiNote, "Ignoring.");
        return;
    }

    // Adjust the midi note with the channel transpose key shift
    const realKey =
        midiNote +
        this.keyShift +
        this.customControllers[customControllers.channelKeyShift];

    // If high performance mode, kill notes instead of stopping them
    if (
        this.synthCore.masterParameters.blackMIDIMode && // If the channel is percussion channel, do not kill the notes
        !this.drumChannel
    ) {
        this.killNote(realKey);
        this.synthCore.callEvent("noteOff", {
            midiNote: midiNote,
            channel: this.channel
        });
        return;
    }

    const sustain = this.midiControllers[midiControllers.sustainPedal] >= 8192;
    let vc = 0;
    if (this.voiceCount > 0)
        for (const v of this.synthCore.voices) {
            if (
                v.channel === this.channel &&
                v.isActive &&
                v.realKey === realKey &&
                !v.isInRelease
            ) {
                if (sustain) v.isHeld = true;
                else v.releaseVoice(this.synthCore.currentTime);

                if (++vc >= this.voiceCount) break; // We already checked all the voices
            }
        }
    this.synthCore.callEvent("noteOff", {
        midiNote: midiNote,
        channel: this.channel
    });
}
