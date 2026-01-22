import { SpessaSynthWarn } from "../../../../utils/loggin";
import type { MIDIChannel } from "../../engine_components/midi_channel";
import { customControllers } from "../../../enums";

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
        this.channelTransposeKeyShift +
        this.customControllers[customControllers.channelKeyShift];

    // If high performance mode, kill notes instead of stopping them
    if (
        this.synthProps.masterParameters.blackMIDIMode && // If the channel is percussion channel, do not kill the notes
        !this.drumChannel
    ) {
        this.killNote(realKey);
        this.synthProps.callEvent("noteOff", {
            midiNote: midiNote,
            channel: this.channelNumber
        });
        return;
    }

    const channelVoices = this.voices;
    for (const v of channelVoices) {
        if (v.realKey !== realKey || v.isInRelease) {
            continue;
        }
        // If hold pedal, move to sustain
        if (this.holdPedal) {
            this.sustainedVoices.push(v);
        } else {
            v.releaseVoice(this.synth.currentSynthTime);
        }
    }
    this.synthProps.callEvent("noteOff", {
        midiNote: midiNote,
        channel: this.channelNumber
    });
}
