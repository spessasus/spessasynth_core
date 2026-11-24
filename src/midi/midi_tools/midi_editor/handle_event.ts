import type { MIDIMessage } from "../../midi_message";
import * as BankSelectHacks from "../../../utils/bank_select_hacks";
import { type MIDIController, MIDIMessageTypes } from "../../enums";
import * as MIDIUtils from "../midi_utils";
import type { MIDIEditor } from "./midi_editor";

/**
 * Handles one event of the file, called by `BasicMIDI.iterate` for every event.
 * Deletes or rewrites what the options lock or clear, tracks the system, channel and parameter state,
 * and inserts the locked state at each channel's first note on.
 * @param e The event.
 * @param trackNum The index of the track the event is on.
 * @param eventIndexes The current event index of every track, owned by `iterate`. Deleting and inserting adjust it.
 */
export function handleEvent(
    this: MIDIEditor,
    e: MIDIMessage,
    trackNum: number,
    eventIndexes: number[]
) {
    this.currentEventDeleted = false;
    this.trackNum = trackNum;
    this.eventIndexes = eventIndexes;
    this.currentParameterChannel = -1;

    // Port events move their track (tracks without notes too, MuseScore puts the channel setups there).
    // Otherwise only process voice + system exclusive messages
    if (
        this.ports.update(e, trackNum) ||
        e.statusByte < MIDIMessageTypes.noteOff ||
        e.statusByte > MIDIMessageTypes.systemExclusive
    )
        return;
    // A port without notes plays nothing, its voice messages are left alone (the sequencer drops them).
    // Its SysEx lands past the last channel, so only the global parameters count, like in the sequencer
    const notePortOffset = this.ports.offset(trackNum);
    if (
        notePortOffset === undefined &&
        e.statusByte !== MIDIMessageTypes.systemExclusive
    )
        return;
    const portOffset = notePortOffset ?? this.channelStatuses.length;

    const status = e.statusByte & 0xf0;
    const midiChannel = e.statusByte & 0xf;
    const channel = midiChannel + portOffset;
    // Clear channel?
    if (
        e.statusByte !== MIDIMessageTypes.systemExclusive &&
        this.clearedChannels.has(channel)
    ) {
        this.deleteCurrentEvent();
        return;
    }
    const channelStatus = this.channelStatuses[channel];
    const channelChange = this.channelChanges.get(channel);
    switch (status) {
        case MIDIMessageTypes.noteOn: {
            // Check velocity 0
            if (e.data[1] === 0) {
                // That is a note off
                if (!channelChange) break;
                e.data[0] = Math.max(
                    0,
                    Math.min(
                        127,
                        e.data[0] + channelStatus.noteShifts[e.data[0]]
                    )
                );
                break;
            }
            this.sawNote = true;
            // A first note after a reset makes it meaningful, track for replacement
            if (this.pendingReset !== undefined) {
                if (this.isPendingResetGM) {
                    // Track as GM, the replacements will be counted as meaningful
                    this.gmResets.push(this.pendingReset);
                    this.isPendingResetGM = false;
                } else {
                    this.meaningfulResets.push(this.pendingReset);
                }
                this.pendingReset = undefined;
            }
            // Is it first?
            if (channelStatus.isFirstNoteOn) {
                this.firstNoteOn(e.ticks, channel);
                channelStatus.isFirstNoteOn = false;
            }
            // A note voids any pending parameter halves:
            // Rewriting them afterward would change what it heard.
            channelStatus.pendingParam = undefined;
            // Transpose key and clamp if needed
            // For 0 it will stay as is
            const shift =
                channelStatus.relativeKeyShift + channelStatus.currentKeyShift;
            // Remember it for this note's note off
            channelStatus.noteShifts[e.data[0]] = shift;
            e.data[0] = Math.max(0, Math.min(127, e.data[0] + shift));
            break;
        }

        case MIDIMessageTypes.noteOff:
        // Poly pressure is also transposed
        case MIDIMessageTypes.polyPressure: {
            if (!channelChange) break;
            // Use the shift of the held note, not the current one
            e.data[0] = Math.max(
                0,
                Math.min(127, e.data[0] + channelStatus.noteShifts[e.data[0]])
            );
            break;
        }

        case MIDIMessageTypes.programChange: {
            // Do we delete it?
            if (channelChange?.patch) {
                // This channel has program change. BEGONE!
                this.deleteCurrentEvent();
                return;
            }
            this.addEventsAfter(
                ...this.trackXGDrumSetup(
                    channel,
                    BankSelectHacks.selectsXGDrumKit(channelStatus.bankMSB),
                    e
                )
            );
            break;
        }

        case MIDIMessageTypes.pitchWheel: {
            // Do we delete it?
            if (channelChange?.midiParams?.pitchWheel !== undefined) {
                // Locked, remove
                this.deleteCurrentEvent();
            }
            break;
        }

        case MIDIMessageTypes.channelPressure: {
            // Do we delete it?
            if (channelChange?.midiParams?.pressure !== undefined) {
                // Locked, remove
                this.deleteCurrentEvent();
            }
            break;
        }

        case MIDIMessageTypes.controllerChange: {
            this.handleControllerChange(
                e.data[0] as MIDIController,
                e.data[1],
                channel
            );
            break;
        }

        case MIDIMessageTypes.systemExclusive: {
            const syxs = MIDIUtils.analyzeSysEx(e.data);
            // A User Drum Set bulk dump sets many notes at once.
            // Only its locked entries get removed, the rest is written back as single messages in the same order
            // (up to 128 messages for one packet, only when something in it is locked).
            // That is only exact when it is not the flags packet (its internal bit has no real time message)
            // And uses the default device ID, which the single messages are written with.
            //
            // TODO: Other dumps are deleted whole when anything in them is locked.
            // So their unlocked entries are lost too. Splitting them needs the device ID in the written messages.
            if (
                syxs.length > 1 &&
                e.data[1] === 0x10 &&
                (e.data[5] & 0x0f) !== 0x6 &&
                syxs.every((s) => s.type === "User Drum Setup")
            ) {
                const kept = syxs.filter(
                    (s) =>
                        !this.isUserDrumLocked(
                            s.drumSet,
                            s.midiNote,
                            s.parameter
                        )
                );
                if (kept.length < syxs.length) {
                    this.deleteCurrentEvent();
                    this.addEventsBefore(
                        ...kept.map((s) =>
                            MIDIUtils.setUserDrumParameter(
                                e.ticks,
                                s.drumSet,
                                s.midiNote,
                                s.parameter,
                                s.value as never
                            )
                        )
                    );
                }
                return;
            }
            // Drum map locks to write again, inserted after all the results (inserting moves the current index)
            const relock = new Array<MIDIMessage>();
            for (const syx of syxs) {
                if (this.currentEventDeleted) return;
                // Clear channel sysExes too
                if (
                    "channel" in syx &&
                    this.clearedChannels.has(syx.channel + portOffset)
                ) {
                    // BEGONE, CHANNEL CHANGE!
                    this.deleteCurrentEvent();
                    return;
                }
                // Testcase: XG_[Th07] (MU2000EX Arrangements)/th07_19.mid
                if (
                    "channel" in syx &&
                    syx.channel + portOffset >= this.channelStatuses.length
                )
                    continue;

                switch (syx.type) {
                    case "Map Drum Setup": {
                        // Delete map drum setups affecting modified channels
                        if (
                            this.shouldClearMapDrum(
                                syx.drumMap,
                                syx.key,
                                syx.parameter
                            )
                        ) {
                            this.deleteCurrentEvent();
                            return;
                        }
                        break;
                    }

                    case "GS Reverb Param": {
                        // Delete all reverb params since we're setting new ones
                        if (this.gsReverbParams) {
                            this.deleteCurrentEvent();
                            return;
                        }
                        break;
                    }

                    case "GS Chorus Param": {
                        // Delete all chorus params since we're setting new ones
                        if (this.gsChorusParams) {
                            this.deleteCurrentEvent();
                            return;
                        }
                        break;
                    }

                    case "GS Delay Param": {
                        // Delete all delay params since we're setting new ones
                        if (this.gsDelayParams) {
                            this.deleteCurrentEvent();
                            return;
                        }
                        break;
                    }

                    case "GS Equalizer Param": {
                        // Delete all equalizer params since we're setting new ones
                        if (this.gsEqualizerParams) {
                            this.deleteCurrentEvent();
                            return;
                        }
                        break;
                    }

                    case "GS Insertion Param": {
                        // Delete all insertion params since we're setting new ones
                        if (this.gsInsertionParams) {
                            this.deleteCurrentEvent();
                            return;
                        }
                        break;
                    }

                    case "XG Reverb Param": {
                        // Delete all reverb params since we're setting new ones
                        if (this.xgReverbParams) {
                            this.deleteCurrentEvent();
                            return;
                        }
                        break;
                    }

                    case "XG Chorus Param": {
                        // Delete all chorus params since we're setting new ones
                        if (this.xgChorusParams) {
                            this.deleteCurrentEvent();
                            return;
                        }
                        break;
                    }
                    case "XG Variation Param": {
                        // Delete all variation params since we're setting new ones
                        if (this.xgVariationParams) {
                            this.deleteCurrentEvent();
                            return;
                        }
                        break;
                    }

                    case "XG Insertion Param": {
                        // Delete all insertion params since we're setting new ones
                        if (this.xgInsertionParams?.get(syx.insertionNumber)) {
                            this.deleteCurrentEvent();
                            return;
                        }
                        break;
                    }

                    case "Program Change": {
                        // SysEx can change programs
                        // Do we delete it?
                        if (
                            this.channelChanges.get(syx.channel + portOffset)
                                ?.patch
                        ) {
                            // This channel has program change. BEGONE!
                            this.deleteCurrentEvent();

                            return;
                        }
                        const sysExChannel = syx.channel + portOffset;
                        relock.push(
                            ...this.trackXGDrumSetup(
                                sysExChannel,
                                BankSelectHacks.selectsXGDrumKit(
                                    this.channelStatuses[sysExChannel].bankMSB
                                ),
                                // Intentional: a block B part (17 and up) does not get its locked drum map written again.
                                // The written message addresses channel % 16 on this track's port, so it would hit the wrong part
                                syx.channel < 16 ? e : undefined
                            )
                        );
                        break;
                    }

                    case "Global MIDI Param": {
                        if (syx.parameter === "system") {
                            this.handleReset(syx.value, e);
                            return;
                        }
                        if (this.midiParams?.[syx.parameter] !== undefined) {
                            // Locked, remove
                            this.deleteCurrentEvent();
                            return;
                        }
                        break;
                    }

                    case "Channel MIDI Param": {
                        this.handleChannelMIDIParam(
                            syx.channel + portOffset,
                            syx
                        );
                        break;
                    }

                    case "Controller Change": {
                        // SysEx can change controllers too!
                        this.handleControllerChange(
                            syx.controller,
                            syx.value,
                            syx.channel + portOffset
                        );
                        break;
                    }

                    case "User Drum Setup": {
                        if (
                            this.isUserDrumLocked(
                                syx.drumSet,
                                syx.midiNote,
                                syx.parameter
                            )
                        ) {
                            this.deleteCurrentEvent();
                            return;
                        }
                    }
                }
            }
            if (!this.currentEventDeleted) this.addEventsAfter(...relock);
            return;
        }
    }
}
