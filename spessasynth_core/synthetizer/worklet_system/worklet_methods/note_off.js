import { generatorTypes } from '../../../soundfont/chunk/generators.js'
import { consoleColors } from '../../../utils/other.js'
import { SpessaSynthInfo, SpessaSynthWarn } from '../../../utils/loggin.js'

/**
 * Releases a note
 * @param channel {number} - The MIDI channel to use
 * @param midiNote {number} - The MIDI key number
 * @this {Synthesizer}
 */
export function noteOff(channel, midiNote)
{
    if(midiNote > 127 || midiNote < 0)
    {
        SpessaSynthWarn(`Received a noteOn for note`, midiNote, "Ignoring.");
        return;
    }

    // if high performance mode, kill notes instead of stopping them
    if(this.highPerformanceMode)
    {
        // if the channel is percussion channel, do not kill the notes
        if(!this.workletProcessorChannels[channel].drumChannel)
        {
            this.killNote(channel, midiNote);
            return;
        }
    }

    const channelVoices = this.workletProcessorChannels[channel].voices;
    channelVoices.forEach(v => {
        if(v.midiNote !== midiNote || v.isInRelease === true)
        {
            return;
        }
        // if hold pedal, move to sustain
        if(this.workletProcessorChannels[channel].holdPedal) {
            this.workletProcessorChannels[channel].sustainedVoices.push(v);
        }
        else
        {
            this.releaseVoice(v);
        }
    });
}

/**
 * Stops a note nearly instantly
 * @param channel {number} - The MIDI channel to use
 * @param midiNote {number} - The MIDI key number
 * @this {Synthesizer}
 */
export function killNote(channel, midiNote)
{
    this.workletProcessorChannels[channel].voices.forEach(v => {
        if(v.midiNote !== midiNote)
        {
            return;
        }
        v.modulatedGenerators[generatorTypes.releaseVolEnv] = -12000; // set release to be very short
        this.releaseVoice(v);
    });
}

/**
 * stops all notes
 * @param channel {number} - The MIDI channel to use
 * @param force {boolean} - If the notes should stop instantly or release normally
 * @this {Synthesizer}
 */
export function stopAll(channel, force = false)
{
    const channelVoices = this.workletProcessorChannels[channel].voices;
    if(force)
    {
        // force stop all
        channelVoices.length = 0;
        this.workletProcessorChannels[channel].sustainedVoices.length = 0;
    }
    else
    {
        channelVoices.forEach(v => {
            if(v.isInRelease) return;
            this.releaseVoice(v);
        });
        this.workletProcessorChannels[channel].sustainedVoices.forEach(v => {
            this.releaseVoice(v);
        })
    }
}

/**
 * @this {Synthesizer}
 * @param force {boolean} - If the notes should stop instantly or release normally
 */
export function stopAllChannels(force = false)
{
    SpessaSynthInfo("%cStop all received!", consoleColors.info);
    for (let i = 0; i < this.workletProcessorChannels.length; i++) {
        this.stopAll(i, force);
    }
}