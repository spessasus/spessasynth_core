import { getEvent, MIDIMessage } from "../midi/midi_message";
import { ConsoleColors } from "../utils/other";
import { SpessaSynthLog } from "../utils/loggin";
import { readBigEndian } from "../utils/byte_functions/big_endian";
import type { SpessaSynthSequencer } from "./sequencer";
import { type MIDIController, MIDIMessageTypes } from "../midi/enums";

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
    const statusByteData = getEvent(event.statusByte);
    const offset =
        this.midiPortChannelOffsets[this.currentMIDIPorts[trackIndex]] || 0;
    statusByteData.channel += offset;
    /*
     Process the event
     Note: We do not use the .sendMessage on the synth here
     as it does not allow us to use more than 16 channels,
     which we need since the sequencer handles multi-port stuff, not the synth!
    */
    switch (statusByteData.status) {
        case MIDIMessageTypes.noteOn: {
            const velocity = event.data[1];
            if (velocity > 0) {
                this.synth.noteOn(
                    statusByteData.channel,
                    event.data[0],
                    velocity
                );
                this.playingNotes.push({
                    midiNote: event.data[0],
                    channel: statusByteData.channel,
                    velocity: velocity
                });
            } else {
                this.synth.noteOff(statusByteData.channel, event.data[0]);
                const toDelete = this.playingNotes.findIndex(
                    (n) =>
                        n.midiNote === event.data[0] &&
                        n.channel === statusByteData.channel
                );
                if (toDelete !== -1) {
                    this.playingNotes.splice(toDelete, 1);
                }
            }
            break;
        }

        case MIDIMessageTypes.noteOff: {
            this.synth.noteOff(statusByteData.channel, event.data[0]);
            const toDelete = this.playingNotes.findIndex(
                (n) =>
                    n.midiNote === event.data[0] &&
                    n.channel === statusByteData.channel
            );
            if (toDelete !== -1) {
                this.playingNotes.splice(toDelete, 1);
            }
            break;
        }

        case MIDIMessageTypes.pitchWheel: {
            this.synth.pitchWheel(
                statusByteData.channel,
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
                statusByteData.channel,
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
            this.synth.programChange(statusByteData.channel, event.data[0]);
            break;
        }

        case MIDIMessageTypes.polyPressure: {
            this.synth.polyPressure(
                statusByteData.channel,
                event.data[0],
                event.data[1]
            );
            break;
        }

        case MIDIMessageTypes.channelPressure: {
            this.synth.channelPressure(statusByteData.channel, event.data[0]);
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
                SpessaSynthLog.info("invalid tempo! falling back to 120 BPM");
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
            this.synth.resetAllControllers();
            break;
        }

        default: {
            SpessaSynthLog.info(
                `%cUnrecognized Event: %c${event.statusByte}%c status byte: %c${Object.keys(
                    MIDIMessageTypes
                ).find(
                    (k) =>
                        MIDIMessageTypes[k as keyof typeof MIDIMessageTypes] ===
                        statusByteData.status
                )}`,
                ConsoleColors.warn,
                ConsoleColors.unrecognized,
                ConsoleColors.warn,
                ConsoleColors.value
            );
            break;
        }
    }
    if (statusByteData.status >= 0 && statusByteData.status < 0x80) {
        this.callEvent("metaEvent", {
            event,
            trackIndex
        });
    }
}
