import { MIDIMessage } from "../midi/midi_message";
import { ConsoleColors } from "../utils/other";
import { SpessaLog } from "../utils/loggin";
import { readBigEndian } from "../utils/byte_functions/big_endian";
import * as MIDIUtils from "../midi/midi_tools/midi_utils";
import type { SpessaSynthSequencer } from "./sequencer";
import {
    type MIDIController,
    type MIDIMessageType,
    MIDIMessageTypes
} from "../midi/enums";

/**
 * Processes a MIDI event.
 * @param event The MIDI event to process.
 * @param trackIndex The index of the track the event belongs to.
 */
export function processEventInternal(
    this: SpessaSynthSequencer,
    event: MIDIMessage,
    trackIndex: number
) {
    // Undefined for a port without notes: its voice messages are dropped.
    // Its SysEx lands past the last channel, so only the global parameters (resets, master settings, etc.) apply.
    // A reset on any port resets the whole device. Verified on 88emu.
    // Testcase: 43551.KYC.mid (a GS reset for an unused port B resets port A's drum part too)
    const portOffset = this.ports!.offset(trackIndex);

    if (
        this.externalMIDIPlayback && // Do not send meta events
        event.statusByte >= 0x80
    ) {
        // A port without notes has no channels to send to.
        // Only fully global SysEx (resets, master settings) still goes out, like the internal playback applies it.
        // Unrecognized SysEx is intentionally not sent from such a port, though the internal synth gets it.
        if (portOffset === undefined) {
            const analyzed =
                event.statusByte === MIDIMessageTypes.systemExclusive
                    ? MIDIUtils.analyzeSysEx(event.data)
                    : [];
            // Every part must be recognized and none may target a channel
            if (
                analyzed.length === 0 ||
                analyzed.some(
                    (r) => r.type === "Other With Data" || "channel" in r
                )
            )
                return;
        }
        this.sendMIDIMessage(
            // SysEx escape sends its bytes as-is, synth does not parse them
            Array.from(event.toBytes()),
            // A global SysEx from a port without notes goes to the first port, it is device-wide anyway
            portOffset ?? 0
        );
        return;
    }

    const offset = portOffset ?? this.synth.midiChannels.length;
    let status: MIDIMessageType;
    let channel = 0;
    if (event.statusByte >= 0x80 && event.statusByte < 0xf0) {
        if (portOffset === undefined) return;
        // Voice message
        status = (event.statusByte & 0xf0) as MIDIMessageType;
        channel = event.statusByte & 0x0f;
    } else {
        status = event.statusByte;
    }

    channel += offset;
    /*
     Process the event
     Note: We do not use the .sendMessage on the synth here
     as it does not allow us to use more than 16 channels,
     which we need since the sequencer handles multi-port stuff, not the synth!
    */
    switch (status) {
        case MIDIMessageTypes.noteOn: {
            // Sanity check
            let playingNotes = this.playingNotes[channel];
            if (!playingNotes) {
                while (this.playingNotes.length <= channel)
                    this.playingNotes.push(new Map<number, number>());
                playingNotes = this.playingNotes[channel];
            }

            const velocity = event.data[1];
            if (velocity > 0) {
                this.synth.noteOn(channel, event.data[0], velocity);
                playingNotes.set(event.data[0], velocity);
            } else {
                this.synth.noteOff(channel, event.data[0]);
                playingNotes.delete(event.data[0]);
            }
            break;
        }

        case MIDIMessageTypes.noteOff: {
            // Sanity check
            let playingNotes = this.playingNotes[channel];
            if (!playingNotes) {
                while (this.playingNotes.length <= channel)
                    this.playingNotes.push(new Map<number, number>());
                playingNotes = this.playingNotes[channel];
            }

            this.synth.noteOff(channel, event.data[0]);
            playingNotes.delete(event.data[0]);
            break;
        }

        case MIDIMessageTypes.pitchWheel: {
            this.synth.pitchWheel(
                channel,
                (event.data[1] << 7) | event.data[0]
            );
            break;
        }

        case MIDIMessageTypes.controllerChange: {
            this.synth.controllerChange(
                channel,
                event.data[0] as MIDIController,
                event.data[1]
            );
            break;
        }

        case MIDIMessageTypes.programChange: {
            this.synth.programChange(channel, event.data[0]);
            break;
        }

        case MIDIMessageTypes.polyPressure: {
            this.synth.polyPressure(channel, event.data[0], event.data[1]);
            break;
        }

        case MIDIMessageTypes.channelPressure: {
            this.synth.channelPressure(channel, event.data[0]);
            break;
        }

        case MIDIMessageTypes.systemExclusive: {
            this.synth.systemExclusive(event.data, offset);
            break;
        }

        case MIDIMessageTypes.setTempo: {
            const tempoBPM = 60_000_000 / readBigEndian(event.data, 3);
            this.oneTickToSeconds =
                60 / (tempoBPM * this._midiData!.timeDivision);
            if (this.oneTickToSeconds === 0) {
                this.oneTickToSeconds =
                    60 / (120 * this._midiData!.timeDivision);
                SpessaLog.info("invalid tempo! falling back to 120 BPM");
            }
            break;
        }

        // Recognized but ignored
        case MIDIMessageTypes.timeSignature:
        case MIDIMessageTypes.endOfTrack:
        case MIDIMessageTypes.midiChannelPrefix:
        case MIDIMessageTypes.songPosition:
        case MIDIMessageTypes.activeSensing:
        case MIDIMessageTypes.keySignature:
        case MIDIMessageTypes.sequenceNumber:
        case MIDIMessageTypes.systemExclusiveEscape:
        case MIDIMessageTypes.sequenceSpecific:
        case MIDIMessageTypes.text:
        case MIDIMessageTypes.lyric:
        case MIDIMessageTypes.copyright:
        case MIDIMessageTypes.trackName:
        case MIDIMessageTypes.marker:
        case MIDIMessageTypes.cuePoint:
        case MIDIMessageTypes.instrumentName:
        case MIDIMessageTypes.programName: {
            break;
        }

        case MIDIMessageTypes.midiPort: {
            // Tracks without notes switch too, MuseScore puts the channel setups there
            this.ports!.update(event, trackIndex);
            break;
        }

        case MIDIMessageTypes.reset: {
            this.synth.reset();
            break;
        }

        default: {
            SpessaLog.info(
                `%cUnrecognized Event: %c${event.statusByte.toString(16)}`,
                ConsoleColors.warn,
                ConsoleColors.unrecognized
            );
            break;
        }
    }
    if (status >= 0 && status < 0x80) {
        this.callEvent("metaEvent", {
            event,
            trackIndex
        });
    }
}
