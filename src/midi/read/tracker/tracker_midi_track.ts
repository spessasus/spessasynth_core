import { MIDITrack } from "../../midi_track";
import { MIDIMessage } from "../../midi_message";
import { IndexedByteArray } from "../../../utils/indexed_array";
import { getStringBytes } from "../../../utils/byte_functions/string";
import * as MIDIUtils from "../../midi_tools/midi_utils";
import { MELODIC_MAP } from "../../midi_tools/sysex_data";
import { MIDI_DRUM_CHANNEL } from "../../../synthesizer/audio_engine/synth_constants";
import {
    type MIDIController,
    MIDIControllers,
    type MIDIMessageType,
    MIDIMessageTypes
} from "../../enums";

/*
 * Controller values above 64 do not map linearly to the modulator sources (SFe 4.0, section 7.2, center-max).
 * So a value that must be exact is sent on two controllers, each 64 at most, with the same modulators.
 * Their sum is the value. The second controller of each pair is the _EXTRA_ one.
 */
/**
 * The controller pair that sets the sample offset in units of 256 sample points (low 7 bits).
 */
export const OFFSET_FINE_CC: MIDIController = MIDIControllers.undefinedCC21;
export const OFFSET_FINE_EXTRA_CC: MIDIController =
    MIDIControllers.undefinedCC24;
/**
 * The controller pair that sets the sample offset in units of 32,768 sample points (high 7 bits).
 */
export const OFFSET_COARSE_CC: MIDIController = MIDIControllers.undefinedCC20;
export const OFFSET_COARSE_EXTRA_CC: MIDIController =
    MIDIControllers.undefinedCC25;
/**
 * The controller pair that sets the sample offset in units of 2 sample points.
 */
export const OFFSET_FINEST_CC: MIDIController =
    MIDIControllers.undefinedCC21LSB;
export const OFFSET_FINEST_EXTRA_CC: MIDIController =
    MIDIControllers.undefinedCC26;
/**
 * The 14-bit controller pair that lowers the filter cutoff from fully open, see {@link FILTER_CUTOFF_RANGE}.
 * The LSB is the controller 32 above {@link FILTER_CUTOFF_CC}, it is sent alone.
 */
export const FILTER_CUTOFF_CC: MIDIController = MIDIControllers.undefinedCC22;
export const FILTER_CUTOFF_EXTRA_CC: MIDIController =
    MIDIControllers.undefinedCC27;
/**
 * The 14-bit controller pair that sets the filter resonance, see {@link FILTER_RESONANCE_RANGE}.
 * The LSB is the controller 32 above {@link FILTER_RESONANCE_CC}, it is sent alone.
 */
export const FILTER_RESONANCE_CC: MIDIController =
    MIDIControllers.undefinedCC23;
export const FILTER_RESONANCE_EXTRA_CC: MIDIController =
    MIDIControllers.undefinedCC28;
/**
 * The full scale of {@link FILTER_CUTOFF_CC} in cents, from 13,500 (open) down to 4,540.
 * A multiple of 128, so the LSB modulator gets a whole amount. The lowest IT cutoff (120 Hz) is about 4,650.
 */
export const FILTER_CUTOFF_RANGE = 8960;
/**
 * The full scale of {@link FILTER_RESONANCE_CC} in centibels.
 * A multiple of 256, so the LSB modulators of the resonance and of its half (the level compensation) are whole.
 */
export const FILTER_RESONANCE_RANGE = 512;

/**
 * Pitch changes smaller than this (in semitones) are floating point noise and are not written.
 */
const PITCH_EPSILON = 1e-9;

/**
 * Writes the MIDI events of a single tracker channel.
 * Controller changes are only written when the value changes.
 * Pitch is stored in semitones and converted to pitch wheel events when finishing,
 * once the required pitch wheel range is known.
 */
export class TrackerMIDITrack {
    /**
     * The MIDI channel number (0-15).
     */
    public readonly channel: number;
    /**
     * The MIDI port number.
     */
    public readonly port: number;
    /**
     * The currently playing MIDI note, -1 if none.
     */
    public activeKey = -1;
    private readonly events = new Array<MIDIMessage>();
    private readonly pitchEvents = new Array<MIDIMessage>();
    private readonly pitchValues = new Array<number>();
    private readonly controllers = new Int16Array(128).fill(-1);
    private program = -1;
    private pitch = 0;
    private maxPitch = 0;

    public constructor(channel: number, port: number) {
        this.channel = channel;
        this.port = port;
    }

    /**
     * Starts a new note.
     * @param ticks The MIDI tick time.
     * @param key The MIDI key number.
     */
    public noteOn(ticks: number, key: number) {
        this.activeKey = key;
        this.addEvent(ticks, MIDIMessageTypes.noteOn, key, 127);
    }

    /**
     * Stops the playing note, if any.
     * @param ticks The MIDI tick time.
     */
    public noteOff(ticks: number) {
        if (this.activeKey === -1) {
            return;
        }
        this.addEvent(ticks, MIDIMessageTypes.noteOff, this.activeKey, 64);
        this.activeKey = -1;
    }

    /**
     * Selects a preset, using bank select for presets above 127.
     * @param ticks The MIDI tick time.
     * @param index The preset index.
     */
    public selectPreset(ticks: number, index: number) {
        if (this.program === index) {
            return;
        }
        this.program = index;
        this.controllerChange(ticks, MIDIControllers.bankSelect, index >> 7);
        this.addEvent(ticks, MIDIMessageTypes.programChange, index & 0x7f);
    }

    /**
     * Changes a controller if its value differs from the last one.
     * @param ticks The MIDI tick time.
     * @param controller The controller number.
     * @param value The new value (0-127).
     * @param skipDefault If a zero value is not written while the controller is still at its reset value.
     */
    public controllerChange(
        ticks: number,
        controller: MIDIController,
        value: number,
        skipDefault = false
    ) {
        if (
            this.controllers[controller] === value ||
            (skipDefault && value === 0 && this.controllers[controller] === -1)
        ) {
            return;
        }
        this.controllers[controller] = value;
        this.addEvent(
            ticks,
            MIDIMessageTypes.controllerChange,
            controller,
            value
        );
    }

    /**
     * Changes a controller pair (see {@link OFFSET_FINE_EXTRA_CC}): the first gets up to 64 and the second the rest.
     * @param ticks The MIDI tick time.
     * @param controller The first controller.
     * @param extra The second controller.
     * @param value The new value (0-127).
     * @param skipDefault If a zero value is not written while the controller is still at its reset value.
     */
    public controllerChangePair(
        ticks: number,
        controller: MIDIController,
        extra: MIDIController,
        value: number,
        skipDefault = false
    ) {
        const first = Math.min(64, value);
        this.controllerChange(ticks, controller, first, skipDefault);
        this.controllerChange(ticks, extra, value - first, skipDefault);
    }

    /**
     * Changes a 14-bit controller pair (0-31) and its LSB if the value differs from the last one.
     * The 7 high bits go to the pair, the LSB goes alone to the controller 32 above.
     * @param ticks The MIDI tick time.
     * @param controller The first controller of the pair (0-31).
     * @param extra The second controller of the pair.
     * @param value The new value (0-16,383).
     * @param skipDefault If a zero value is not written while the controller is still at its reset value.
     */
    public controllerChange14(
        ticks: number,
        controller: MIDIController,
        extra: MIDIController,
        value: number,
        skipDefault = false
    ) {
        this.controllerChangePair(
            ticks,
            controller,
            extra,
            value >> 7,
            skipDefault
        );
        this.controllerChange(
            ticks,
            (controller + 32) as MIDIController,
            value & 0x7f,
            skipDefault
        );
    }

    /**
     * Sets the pitch offset from the playing key.
     * @param ticks The MIDI tick time.
     * @param semitones The offset in semitones.
     */
    public setPitch(ticks: number, semitones: number) {
        if (Math.abs(this.pitch - semitones) < PITCH_EPSILON) {
            return;
        }
        this.pitch = semitones;
        this.maxPitch = Math.max(this.maxPitch, Math.abs(semitones));
        const event = this.addEvent(ticks, MIDIMessageTypes.pitchWheel, 0, 64);
        this.pitchEvents.push(event);
        this.pitchValues.push(semitones);
    }

    /**
     * Builds the MIDI track.
     * @param name The track name.
     * @param endTicks The tick where all notes get stopped.
     * @returns The complete track.
     */
    public finish(name: string, endTicks: number) {
        this.noteOff(endTicks);
        // Marks the end of the song, so the trailing empty rows are kept
        this.addEvent(
            endTicks,
            MIDIMessageTypes.controllerChange,
            MIDIControllers.allNotesOff,
            0
        );
        // Use the smallest range that fits every pitch offset for the best resolution
        const range = Math.min(127, Math.max(1, Math.ceil(this.maxPitch)));
        for (let i = 0; i < this.pitchEvents.length; i++) {
            // Above the center 8191 steps reach the end (SFe 4.0, section 7.2, center-max), below it 8192 do
            const offset = this.pitchValues[i] / range;
            const value = Math.min(
                16_383,
                Math.max(
                    0,
                    Math.round(8192 + offset * (offset > 0 ? 8191 : 8192))
                )
            );
            this.pitchEvents[i].data[0] = value & 0x7f;
            this.pitchEvents[i].data[1] = value >> 7;
        }

        const track = new MIDITrack();
        track.name = name;
        track.port = this.port;
        const cc = (MIDIMessageTypes.controllerChange |
            this.channel) as MIDIMessageType;
        const setup = [
            new MIDIMessage(
                0,
                MIDIMessageTypes.trackName,
                getStringBytes(name)
            ),
            new MIDIMessage(
                0,
                MIDIMessageTypes.midiPort,
                new IndexedByteArray([this.port])
            ),
            // Trackers have no effects
            this.createEvent(cc, MIDIControllers.reverbDepth, 0),
            this.createEvent(cc, MIDIControllers.tremoloDepth, 0),
            this.createEvent(cc, MIDIControllers.chorusDepth, 0),
            this.createEvent(cc, MIDIControllers.variationDepth, 0),
            this.createEvent(cc, MIDIControllers.phaserDepth, 0),
            // Pitch wheel range
            this.createEvent(cc, MIDIControllers.registeredParameterMSB, 0),
            this.createEvent(cc, MIDIControllers.registeredParameterLSB, 0),
            this.createEvent(cc, MIDIControllers.dataEntryMSB, range),
            this.createEvent(cc, MIDIControllers.dataEntryLSB, 0),
            this.createEvent(cc, MIDIControllers.registeredParameterMSB, 127),
            this.createEvent(cc, MIDIControllers.registeredParameterLSB, 127)
        ];
        if (this.channel === MIDI_DRUM_CHANNEL) {
            // Turn the GS rhythm part into a melodic part, the presets are not drum kits
            setup.push(
                ...MIDIUtils.fromAnalyzedMessage(
                    {
                        type: "Channel MIDI Param",
                        channel: this.channel,
                        parameter: "drumMap",
                        value: MELODIC_MAP
                    },
                    { ticks: 0, preferredSystem: "gs" }
                )
            );
        }
        // Long tracks have too many events to pass as arguments
        track.events = setup.concat(this.events);
        track.channels.add(this.channel);
        return track;
    }

    private createEvent(status: MIDIMessageType, data1: number, data2: number) {
        return new MIDIMessage(0, status, new IndexedByteArray([data1, data2]));
    }

    private addEvent(
        ticks: number,
        type: MIDIMessageType,
        data1: number,
        data2?: number
    ) {
        const event = new MIDIMessage(
            ticks,
            (type | this.channel) as MIDIMessageType,
            new IndexedByteArray(data2 === undefined ? [data1] : [data1, data2])
        );
        this.events.push(event);
        return event;
    }
}
