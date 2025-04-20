import { generatorTypes } from "../../../../soundfont/basic_soundfont/generator.js";
import { customControllers } from "../../engine_components/controller_tables.js";

/**
 * Stops a note nearly instantly
 * @param midiNote {number}
 * @param releaseTime {number} ticks
 * @this {MidiAudioChannel}
 */
export function killNote(midiNote, releaseTime = -12000)
{
    midiNote += this.customControllers[customControllers.channelKeyShift];
    
    this.voices.forEach(v =>
    {
        if (v.realKey !== midiNote)
        {
            return;
        }
        v.modulatedGenerators[generatorTypes.releaseVolEnv] = releaseTime; // set release to be very short
        v.release(this.synth.currentSynthTime);
    });
}