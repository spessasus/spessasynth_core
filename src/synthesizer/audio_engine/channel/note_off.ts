import type { MIDIChannel } from "./midi_channel";
import { MIDIControllers } from "../../../midi/enums";

/**
 * Releases a note by its MIDI note number.
 * If the note is in high performance mode and the channel is not a drum channel,
 * it kills the note instead of releasing it.
 * @param midiNote The MIDI note number to release (0-127).
 */
export function noteOff(this: MIDIChannel, midiNote: number) {
    if (midiNote > 127 || midiNote < 0) return;

    if (
        // If high performance mode, kill notes instead of stopping them
        (this.synthCore.systemParameters.blackMIDIMode &&
            // If the channel is percussion channel, do not kill the notes
            !this._drumChannel) ||
        // If "receive note off" is enabled, kill the note (force quick release)
        (this._drumChannel && this.drumParams[midiNote].rxNoteOff)
    ) {
        // Instantly kill the note
        this.killNote(midiNote);
        this.synthCore.callEvent("noteOff", {
            midiNote,
            channel: this.channel
        });
        return;
    }

    const sustain = this._midiControllers[MIDIControllers.sustainPedal] >= 8192;
    let vc = 0;
    const noteID = this.noteOffID[midiNote];
    // Only
    let updateNoteID = false;
    if (this._voiceCount > 0)
        for (const v of this.synthCore.voices) {
            if (
                v.channel === this.channel &&
                v.isActive &&
                v.midiNote === midiNote &&
                v.noteID === noteID &&
                !v.isInRelease
            ) {
                if (sustain) v.isHeld = true;
                else v.releaseVoice(this.synthCore.currentTime);

                updateNoteID = true;
                if (++vc >= this._voiceCount) break; // We already checked all the voices
            }
        }
    if (updateNoteID) this.noteOffID[midiNote]++;
    this.synthCore.callEvent("noteOff", {
        midiNote,
        channel: this.channel
    });
}
