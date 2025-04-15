import { MidiAudioChannel } from "../engine_components/midi_audio_channel.js";

/**
 * @param sendEvent {boolean}
 * @this {SpessaSynthProcessor}
 */
export function createMidiChannel(sendEvent = false)
{
    /**
     * @type {MidiAudioChannel}
     */
    const channel = new MidiAudioChannel(this, this.defaultPreset, this.midiAudioChannels.length);
    this.midiAudioChannels.push(channel);
    if (sendEvent)
    {
        this.callEvent("newchannel", undefined);
        channel.sendChannelProperty();
        this.midiAudioChannels[this.midiAudioChannels.length - 1].setDrums(true);
    }
}