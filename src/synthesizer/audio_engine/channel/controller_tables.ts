import { type MIDIController, MIDIControllers } from "../../../midi/enums";

export const CONTROLLER_TABLE_SIZE = 128;

/**
 * An array with the default MIDI controller values.
 * Note that these are 14-bit, requiring a 7-bit shift to the right for 7-bit values!
 */
export const DEFAULT_MIDI_CONTROLLERS: Readonly<Int16Array> = new Int16Array(
    CONTROLLER_TABLE_SIZE
).fill(0);
const setResetValue = (i: MIDIController, v: number) =>
    // @ts-expect-error Only set here!
    (DEFAULT_MIDI_CONTROLLERS[i] = v << 7);

// Values come from Falcosoft MidiPlayer 6
setResetValue(MIDIControllers.mainVolume, 100);
setResetValue(MIDIControllers.balance, 64);
setResetValue(MIDIControllers.expressionController, 127);
setResetValue(MIDIControllers.pan, 64);

setResetValue(MIDIControllers.filterResonance, 64);
setResetValue(MIDIControllers.releaseTime, 64);
setResetValue(MIDIControllers.attackTime, 64);
setResetValue(MIDIControllers.brightness, 64);

setResetValue(MIDIControllers.decayTime, 64);
setResetValue(MIDIControllers.vibratoRate, 64);
setResetValue(MIDIControllers.vibratoDepth, 64);
setResetValue(MIDIControllers.vibratoDelay, 64);
setResetValue(MIDIControllers.generalPurposeController6, 64);
setResetValue(MIDIControllers.generalPurposeController8, 64);

setResetValue(MIDIControllers.registeredParameterLSB, 127);
setResetValue(MIDIControllers.registeredParameterMSB, 127);
setResetValue(MIDIControllers.nonRegisteredParameterLSB, 127);
setResetValue(MIDIControllers.nonRegisteredParameterMSB, 127);

export const DEFAULT_DRUM_REVERB = new Int8Array(128).fill(127);
// Kicks have no reverb
DEFAULT_DRUM_REVERB[35] = 0;
DEFAULT_DRUM_REVERB[36] = 0;
