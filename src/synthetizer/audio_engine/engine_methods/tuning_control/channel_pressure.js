import { NON_CC_INDEX_OFFSET } from "../../engine_components/controller_tables.js";
import { modulatorSources } from "../../../../soundfont/basic_soundfont/modulator.js";

/**
 * Sets the pressure of the given channel
 * @this {MidiAudioChannel}
 * @param pressure {number} the pressure of the channel
 */
export function channelPressure(pressure)
{
    this.midiControllers[NON_CC_INDEX_OFFSET + modulatorSources.channelPressure] = pressure << 7;
    this.updateChannelTuning();
    this.voices.forEach(v =>
        this.computeModulators(
            v,
            0,
            modulatorSources.channelPressure
        ));
    this.synth.callEvent("channelpressure", {
        channel: this.channelNumber,
        pressure: pressure
    });
}