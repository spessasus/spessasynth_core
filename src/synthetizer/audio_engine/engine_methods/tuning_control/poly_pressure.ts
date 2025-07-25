import { modulatorSources } from "../../../../soundbank/basic_soundbank/modulator.js";

/**
 * Sets the pressure of the given note on a specific channel
 * @this {MidiAudioChannel}
 * @param midiNote {number} 0-127
 * @param pressure {number} the pressure of the note
 */
export function polyPressure(midiNote, pressure) {
    this.voices.forEach((v) => {
        if (v.midiNote !== midiNote) {
            return;
        }
        v.pressure = pressure;
        this.computeModulators(v, 0, modulatorSources.polyPressure);
    });
    this.synth.callEvent("polypressure", {
        channel: this.channelNumber,
        midiNote: midiNote,
        pressure: pressure
    });
}
