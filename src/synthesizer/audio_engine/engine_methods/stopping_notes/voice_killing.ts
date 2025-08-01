import type { MIDIChannel } from "../../engine_components/midi_channel";
import type { Voice } from "../../engine_components/voice";
import type { SpessaSynthProcessor } from "../../../processor";

/**
 * Gets the priority of a voice based on its channel and state.
 * Higher priority means the voice is more important and should be kept longer.
 * @param channel The MIDI audio channel of the voice.
 * @param voice The voice to evaluate.
 * @returns The priority score of the voice.
 */
function getPriority(channel: MIDIChannel, voice: Voice): number {
    let priority = 0;
    if (channel.drumChannel) {
        // important
        priority += 5;
    }
    if (voice.isInRelease) {
        // not important
        priority -= 5;
    }
    // less velocity = less important
    priority += voice.velocity / 25; // map to 0-5
    // the newer, more important
    priority -= voice.volumeEnvelope.state;
    if (voice.isInRelease) {
        priority -= 5;
    }
    priority -= voice.volumeEnvelope.currentAttenuationDb / 50;
    return priority;
}

/**
 * Kills the specified number of voices based on their priority.
 * This function will remove the least important voices from all channels.
 * @param amount The number of voices to remove.
 */
export function killVoicesIntenral(this: SpessaSynthProcessor, amount: number) {
    const allVoices: {
        channel: MIDIChannel;
        voice: Voice;
        priority: number;
    }[] = [];
    for (const channel of this.midiChannels) {
        for (const voice of channel.voices) {
            if (!voice.finished) {
                const priority = getPriority(channel, voice);
                allVoices.push({ channel, voice, priority });
            }
        }
    }

    // Step 2: Sort voices by priority (ascending order)
    allVoices.sort((a, b) => a.priority - b.priority);
    const voicesToRemove = allVoices.slice(0, amount);

    for (const { channel, voice } of voicesToRemove) {
        const index = channel.voices.indexOf(voice);
        if (index > -1) {
            channel.voices.splice(index, 1);
        }
    }
}
