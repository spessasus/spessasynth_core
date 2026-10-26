import { MIDITrack } from "../../midi_track";
import { MIDIMessage } from "../../midi_message";
import { IndexedByteArray } from "../../../utils/indexed_array";
import { getStringBytes } from "../../../utils/byte_functions/string";
import { MIDIUtils } from "../../midi_tools/midi_utils";
import { MELODIC_MAP } from "../../midi_tools/sysex_data";
import { MIDI_DRUM_CHANNEL } from "../../../synthesizer/audio_engine/synth_constants";
import {
    type MIDIController,
    MIDIControllers,
    type MIDIMessageType,
    MIDIMessageTypes
} from "../../enums";

/**
 * The controller that sets the sample offset in units of 256 sample points (low 7 bits).
 */
export const OFFSET_FINE_CC: MIDIController = MIDIControllers.undefinedCC21;
/**
 * The controller that sets the sample offset in units of 32,768 sample points (high 7 bits).
 */
export const OFFSET_COARSE_CC: MIDIController = MIDIControllers.undefinedCC20;

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
     */
    public controllerChange(
        ticks: number,
        controller: MIDIController,
        value: number
    ) {
        if (this.controllers[controller] === value) {
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
            const value = Math.min(
                16_383,
                Math.max(
                    0,
                    Math.round(8192 + (this.pitchValues[i] / range) * 8192)
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
                ...MIDIUtils.setChannelMIDIParameter(
                    0,
                    this.channel,
                    "gs",
                    "drumMap",
                    MELODIC_MAP
                )
            );
        }
        track.pushEvents(...setup, ...this.events);
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
