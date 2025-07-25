/**
 * @typedef {Object} SynthProcessorOptions
 * @property {boolean?} enableEventSystem - if the event system is enabled.
 * @property {number?} initialTime - initial synth time, in seconds.
 * @property {boolean?} effectsEnabled - if the processor should route audio to the effect channels.
 * @property {number?} midiChannels - the default MIDI channel count.
 */


/**
 * @type {SynthProcessorOptions}
 */
export const DEFAULT_SYNTH_OPTIONS = {
    enableEventSystem: true,
    initialTime: 0,
    effectsEnabled: true,
    midiChannels: 16
};