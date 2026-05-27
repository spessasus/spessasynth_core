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

    this.playingNotes[midiNote] = false;
    const mono = !this._midiParameters.polyMode;
    // Mono mode overrides sustain
    const sustain =
        this._midiControllers[MIDIControllers.sustainPedal] >= 8192 && !mono;
    let vc = 0;
    const noteID = this.noteOffID[midiNote];
    // Only update if note on is above this
    // Testcase: overlapping_notes_test (multiple note off)
    if (noteID < this.noteOnID[midiNote]) this.noteOffID[midiNote]++;

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

                if (++vc >= this._voiceCount) break; // We already checked all the voices
            }
        }
    this.synthCore.callEvent("noteOff", {
        midiNote,
        channel: this.channel
    });

    // Mono mode, restore highest still pressed note
    if (mono) {
        const highest = this.playingNotes.lastIndexOf(true);
        if (highest === -1) {
            // No note is playing
            this.lastMonoNote = -1;
        } else if (this.lastMonoNote === midiNote) {
            // The if condition above:
            // Ensure that we don't retrigger note that's not this one
            // For example notes might go like this:
            // On 50, 60, 70
            // Off 50 -> Jumps to 70
            // Off 60 -> We're not the last note so no change, don't jump to 70 again
            // The note will be set automatically below
            this.noteOn(highest, this.lastMonoVelocity, false);
        }
    }
}
