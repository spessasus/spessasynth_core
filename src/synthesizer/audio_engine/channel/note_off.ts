import type { MIDIChannel } from "./midi_channel";
import { MIDIControllers } from "../../../midi/enums";

/**
 * Releases a note by its MIDI note number.
 * If the note is in high performance mode and the channel is not a drum channel,
 * it kills the note instead of releasing it.
 * @param midiNote The MIDI note number to release (0-127).
 */
export function noteOff(this: MIDIChannel, midiNote: number) {
    // Adjust the midi note with the channel transpose key shift
    const actualNote = midiNote + this.currentKeyShift;
    if (actualNote > 127 || actualNote < 0) return;

    if (
        // If high performance mode, kill notes instead of stopping them
        (this.synthCore.masterParameters.blackMIDIMode &&
            // If the channel is percussion channel, do not kill the notes
            !this.drumChannel) ||
        // If "receive note off" is enabled, kill the note (force quick release)
        (this.drumChannel && this.drumParams[actualNote].rxNoteOff)
    ) {
        // Requested midi note, not shifted
        this.killNote(actualNote);
        this.synthCore.callEvent("noteOff", {
            midiNote: actualNote,
            channel: this.channel
        });
        return;
    }

    const sustain = this.midiControllers[MIDIControllers.sustainPedal] >= 8192;
    let vc = 0;
    if (this.voiceCount > 0)
        for (const v of this.synthCore.voices) {
            if (
                v.channel === this.channel &&
                v.isActive &&
                v.midiNote === actualNote &&
                !v.isInRelease
            ) {
                if (sustain) v.isHeld = true;
                else v.releaseVoice(this.synthCore.currentTime);

                if (++vc >= this.voiceCount) break; // We already checked all the voices
            }
        }
    this.synthCore.callEvent("noteOff", {
        midiNote: actualNote,
        channel: this.channel
    });
}
