/**
 * Midi_message.ts
 * purpose: contains enums for midi events and controllers and functions to parse them
 */
import {
    type MIDIController,
    MIDIControllers,
    type MIDIMessageType,
    MIDIMessageTypes
} from "./enums";

export class MIDIMessage {
    /**
     * Absolute number of MIDI ticks from the start of the track.
     */
    public ticks: number;
    /**
     * The MIDI message status byte. Note that for meta events, it is the second byte. (not 0xFF).
     */
    public statusByte: MIDIMessageType;
    /**
     * Message's binary data.
     */
    public data: Uint8Array<ArrayBuffer>;

    /**
     * Creates a new MIDI message.
     * @param ticks time of this message in absolute MIDI ticks.
     * @param byte the message status byte.
     * @param data the message's binary data.
     */
    public constructor(
        ticks: number,
        byte: MIDIMessageType,
        data: Uint8Array<ArrayBuffer>
    ) {
        this.ticks = ticks;
        this.statusByte = byte;
        this.data = data;
    }

    /**
     * Returns a new MIDI Pitch Wheel message.
     * @param ticks time of this message in absolute MIDI ticks.
     * @param channel the channel number of this message.
     * @param value the new value, between 0 and 16383, where 8192 is the center (no pitch change).
     */
    public static pitchWheel(ticks: number, channel: number, value: number) {
        return new MIDIMessage(
            ticks,
            (MIDIMessageTypes.pitchWheel | (channel % 16)) as MIDIMessageType,
            new Uint8Array([value & 0x7f, (value >> 7) & 0x7f])
        );
    }

    /**
     * Returns a new MIDI Channel Pressure message.
     * @param ticks time of this message in absolute MIDI ticks.
     * @param channel the channel number of this message.
     * @param value the new value, between 0 and 127.
     */
    public static channelPressure(
        ticks: number,
        channel: number,
        value: number
    ) {
        return new MIDIMessage(
            ticks,
            (MIDIMessageTypes.channelPressure |
                (channel % 16)) as MIDIMessageType,
            new Uint8Array([value])
        );
    }

    /**
     * Returns a new MIDI Program Change message.
     * @param ticks time of this message in absolute MIDI ticks.
     * @param channel the channel number of this message.
     * @param program the new MIDI program number, between 0 and 127.
     */
    public static programChange(
        ticks: number,
        channel: number,
        program: number
    ) {
        return new MIDIMessage(
            ticks,
            (MIDIMessageTypes.programChange |
                (channel % 16)) as MIDIMessageType,
            new Uint8Array([program])
        );
    }

    /**
     * Returns a new MIDI Controller Change message.
     * @param ticks time of this message in absolute MIDI ticks.
     * @param channel the channel number of this message.
     * @param controller the MIDI controller.
     * @param value the new value.
     */
    public static controllerChange(
        ticks: number,
        channel: number,
        controller: MIDIController,
        value: number
    ) {
        return new MIDIMessage(
            ticks,
            (MIDIMessageTypes.controllerChange |
                (channel % 16)) as MIDIMessageType,
            new Uint8Array([controller, value])
        );
    }

    /**
     * Returns a new MIDI System Exclusive message.
     * @param ticks time of this message in absolute MIDI ticks.
     * @param data the data of the system exclusive message,
     * excluding the starting 0xF0 byte.
     */
    public static systemExclusive(ticks: number, data: number[]) {
        return new MIDIMessage(
            ticks,
            MIDIMessageTypes.systemExclusive,
            new Uint8Array(data)
        );
    }

    /**
     * Returns a new MIDI Registered Parameter message. Sends both data MSB and LSB.
     * @param ticks time of this message in absolute MIDI ticks.
     * @param channel the channel number of this message.
     * @param parameter the 14-bit MIDI registered parameter number.
     * @param value the 14-bit new value.
     */
    public static registeredParameter(
        ticks: number,
        channel: number,
        parameter: number,
        value: number
    ) {
        return [
            MIDIMessage.controllerChange(
                ticks,
                channel,
                MIDIControllers.registeredParameterMSB,
                parameter >> 7
            ),
            MIDIMessage.controllerChange(
                ticks,
                channel,
                MIDIControllers.registeredParameterLSB,
                parameter & 0x7f
            ),
            MIDIMessage.controllerChange(
                ticks,
                channel,
                MIDIControllers.dataEntryMSB,
                value >> 7
            ),
            MIDIMessage.controllerChange(
                ticks,
                channel,
                MIDIControllers.dataEntryLSB,
                value & 0x7f
            )
        ];
    }
}
