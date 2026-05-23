import { MIDIMessage } from "../midi/midi_message";
import { ConsoleColors } from "../utils/other";
import { SpessaLog } from "../utils/loggin";
import { readBigEndian } from "../utils/byte_functions/big_endian";
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
    if (
        this.externalMIDIPlayback && // Do not send meta events
        event.statusByte >= 0x80
    ) {
        this.sendMIDIMessage([event.statusByte, ...event.data]);
        return;
    }
    const track = this._midiData!.tracks[trackIndex];
    let status: MIDIMessageType;
    let channel = 0;
    if (event.statusByte >= 0x80 && event.statusByte < 0xf0) {
        // Voice message
        status = (event.statusByte & 0xf0) as MIDIMessageType;
        channel = event.statusByte & 0x0f;
    } else {
        status = event.statusByte;
    }
    const offset =
        this.midiPortChannelOffsets[this.currentMIDIPorts[trackIndex]] || 0;
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
            // Empty tracks cannot cc change
            if (this._midiData!.isMultiPort && track.channels.size === 0) {
                return;
            }
            this.synth.controllerChange(
                channel,
                event.data[0] as MIDIController,
                event.data[1]
            );
            break;
        }

        case MIDIMessageTypes.programChange: {
            // Empty tracks cannot program change
            if (this._midiData!.isMultiPort && track.channels.size === 0) {
                return;
            }
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
            this.assignMIDIPort(trackIndex, event.data[0]);
            break;
        }

        case MIDIMessageTypes.reset: {
            this.synth.stopAllChannels();
            this.synth.reset();
            break;
        }

        default: {
            SpessaLog.info(
                `%cUnrecognized Event: %c${event.statusByte}%c status byte: %c${Object.keys(
                    MIDIMessageTypes
                ).find(
                    (k) =>
                        MIDIMessageTypes[k as keyof typeof MIDIMessageTypes] ===
                        status
                )}`,
                ConsoleColors.warn,
                ConsoleColors.unrecognized,
                ConsoleColors.warn,
                ConsoleColors.value
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
