import { getWorkletVoices } from '../worklet_utilities/worklet_voice.js'
import { generatorTypes } from '../../../soundfont/chunk/generators.js'
import { computeModulators } from '../worklet_utilities/worklet_modulator.js'
import { VOICE_CAP } from "../../synthesizer.js";
import { SpessaSynthWarn } from '../../../utils/loggin.js'

/**
 * Starts playing a MIDI note
 * @param channel {number} - The MIDI Channel to use
 * @param midiNote {number} - The MIDI key number
 * @param velocity {number} - The velocity (how hard is the key pressed)
 * @param enableDebugging {boolean} - used internally, ignore
 * @this {Synthesizer}
 */
export function noteOn(channel, midiNote, velocity, enableDebugging = false)
{
    if (velocity === 0) {
        this.noteOff(channel, midiNote);
        return;
    }

    if (
        (this.highPerformanceMode && this.totalVoicesAmount > 200 && velocity < 40) ||
        (this.highPerformanceMode && velocity < 10) ||
        (this.workletProcessorChannels[channel].isMuted)
    ) {
        return;
    }

    if(midiNote > 127 || midiNote < 0)
    {
        SpessaSynthWarn(`Received a noteOn for note`, midiNote, "Ignoring.");
        return;
    }


    // get voices
    const voices = getWorkletVoices(
        channel,
        midiNote,
        velocity,
        this.workletProcessorChannels[channel].preset,
        this.currentTime,
        this.sampleRate,
        data => this.sampleDump(data.channel, data.sampleID, data.sampleData),
        this.workletProcessorChannels[channel].cachedVoices,
        enableDebugging);

    // add voices and exclusive class apply
    const channelVoices = this.workletProcessorChannels[channel].voices;
    voices.forEach(voice => {
        const exclusive = voice.generators[generatorTypes.exclusiveClass];
        if(exclusive !== 0)
        {
            channelVoices.forEach(v => {
                if(v.generators[generatorTypes.exclusiveClass] === exclusive)
                {
                    this.releaseVoice(v);
                    v.generators[generatorTypes.releaseVolEnv] = -7200; // make the release nearly instant
                    computeModulators(v, this.workletProcessorChannels[channel].midiControllers);
                }
            })
        }
        computeModulators(voice, this.workletProcessorChannels[channel].midiControllers);
        voice.currentAttenuationDb = 100;
        // set initial pan to avoid split second changing from middle to the correct value
        voice.currentPan = ( (Math.max(-500, Math.min(500, voice.modulatedGenerators[generatorTypes.pan] )) + 500) / 1000) // 0 to 1
    });

    this.totalVoicesAmount += voices.length;
    // cap the voices
    if(this.totalVoicesAmount > VOICE_CAP)
    {
        this.voiceKilling(voices.length);
    }
    channelVoices.push(...voices);
}