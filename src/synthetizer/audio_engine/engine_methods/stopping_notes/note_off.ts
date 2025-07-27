import { SpessaSynthWarn } from "../../../../utils/loggin";
import type { MIDIChannel } from "../../engine_components/midi_audio_channel";
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

    // adjust the midi note with the channel transpose key shift
    const realKey =
        midiNote +
        this.channelTransposeKeyShift +
        this.customControllers[customControllers.channelKeyShift];

    // if high performance mode, kill notes instead of stopping them
    if (this.synthProps.highPerformanceMode) {
        // if the channel is percussion channel, do not kill the notes
        if (!this.drumChannel) {
            this.killNote(realKey, -6950);
            this.synthProps.callEvent("noteOff", {
                midiNote: midiNote,
                channel: this.channelNumber
            });
            return;
        }
    }

    const channelVoices = this.voices;
    channelVoices.forEach((v) => {
        if (v.realKey !== realKey || v.isInRelease) {
            return;
        }
        // if hold pedal, move to sustain
        if (this.holdPedal) {
            this.sustainedVoices.push(v);
        } else {
            v.release(this.synth.currentSynthTime);
        }
    });
    this.synthProps.callEvent("noteOff", {
        midiNote: midiNote,
        channel: this.channelNumber
    });
}
