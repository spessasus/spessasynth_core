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

/**
 * This class represents a single MIDI 1.0 message.
 *
 * @group MIDI.Protocol
 */
export class MIDIMessage {
    /**
     * Absolute number of MIDI ticks from the start of the track.
     * This is only relevant in MIDI sequences.
     */
    public ticks: number;
    /**
     * The MIDI message status byte.
     *
     * > **Note**
     * >
     * > For Meta Events, the status byte is the SECOND status byte, not the `0xFF` meta byte!
     */
    public statusByte: MIDIMessageType;
    /**
     * The 7-bit binary data of the message.
     *
     * > **Warning**
     * >
     * > For System Exclusive events, the data omits the `0xF0` byte as it is already stored in `statusByte`.
     * > This is very important!
     */
    public data: Uint8Array<ArrayBuffer>;

    /**
     * Creates a new MIDI message.
     * @param ticks The MIDI tick time of this event.
     * @param byte The message status byte.
     * @param data The message's binary data.
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
     * @param ticks The MIDI tick time of this message.
     * @param channel The channel number of this message (0-15).
     * @param value The new 14-bit value (0-16,383), where 8192 is the center (no pitch change).
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
     * @param ticks The MIDI tick time of this message.
     * @param channel The channel number of this message (0-15).
     * @param value The pressure (0-127).
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
     * @param ticks The MIDI tick time of this message.
     * @param channel The channel number of this message (0-15).
     * @param program The MIDI program number (0-127).
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
     * @param ticks The MIDI tick time of this message.
     * @param channel The channel number of this message (0-15).
     * @param controller The MIDI controller number (0-127).
     * @param value The controller value (0-127).
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
     * @param ticks The MIDI tick time of this message.
     * @param data The 7-bit data of the system exclusive message,
     * excluding the starting `0xF0` byte.
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
     * @param ticks The MIDI tick time of the events.
     * @param channel The channel to use (0-15).
     * @param parameter The 14-bit registered parameter number. For example 0 is pitch wheel range.
     * @param value The 14-bit value for this parameter.
     */
    public static registeredParameter(
        ticks: number,
        channel: number,
        parameter: number,
        value: number
    ) {
        if (
            parameter > 16_383 ||
            parameter < 0 ||
            value > 16_383 ||
            value < 0
        ) {
            throw new Error("Parameter and value must be between 0 and 16383.");
        }
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

    /**
     * Returns a new MIDI Non-Registered Parameter message. Sends both data MSB and LSB.
     * @param ticks The MIDI tick time of the events.
     * @param channel The channel to use (0-15).
     * @param parameter The 14-bit non-registered parameter number.
     * @param value The 14-bit value for this parameter.
     */
    public static nonRegisteredParameter(
        ticks: number,
        channel: number,
        parameter: number,
        value: number
    ) {
        if (
            parameter > 16_383 ||
            parameter < 0 ||
            value > 16_383 ||
            value < 0
        ) {
            throw new Error("Parameter and value must be between 0 and 16383.");
        }
        return [
            MIDIMessage.controllerChange(
                ticks,
                channel,
                MIDIControllers.nonRegisteredParameterMSB,
                parameter >> 7
            ),
            MIDIMessage.controllerChange(
                ticks,
                channel,
                MIDIControllers.nonRegisteredParameterLSB,
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
