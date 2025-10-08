import { consoleColors, formatTime } from "../utils/other";
import { SpessaSynthGroupCollapsed, SpessaSynthGroupEnd, SpessaSynthInfo, SpessaSynthWarn } from "../utils/loggin";
import { BasicMIDI } from "../midi/basic_midi";
import type { SpessaSynthSequencer } from "./sequencer";

/**
 * Assigns a MIDI port channel offset to a track.
 * @param trackNum The track number to assign the port to.
 * @param port The MIDI port number to assign.
 */
export function assignMIDIPortInternal(
    this: SpessaSynthSequencer,
    trackNum: number,
    port: number
) {
    // Do not assign ports to empty tracks
    if (this._midiData!.tracks[trackNum].channels.size === 0) {
        return;
    }

    // Assign new 16 channels if the port is not occupied yet
    if (this.midiPortChannelOffset === 0) {
        this.midiPortChannelOffset += 16;
        this.midiPortChannelOffsets[port] = 0;
    }

    if (this.midiPortChannelOffsets[port] === undefined) {
        if (this.synth.midiChannels.length < this.midiPortChannelOffset + 15) {
            this.addNewMIDIPort();
        }
        this.midiPortChannelOffsets[port] = this.midiPortChannelOffset;
        this.midiPortChannelOffset += 16;
    }

    this.currentMIDIPorts[trackNum] = port;
}

/**
 * Loads a new sequence internally.
 * @param parsedMidi The parsed MIDI data to load.
 */
export function loadNewSequenceInternal(
    this: SpessaSynthSequencer,
    parsedMidi: BasicMIDI
) {
    if (!parsedMidi.tracks) {
        throw new Error("This MIDI has no tracks!");
    }

    if (parsedMidi.duration === 0) {
        // https://github.com/spessasus/SpessaSynth/issues/106
        SpessaSynthWarn("This MIDI file has a duration of exactly 0 seconds.");
        this.pausedTime = 0;
        this.isFinished = true;
        return;
    }

    this.oneTickToSeconds = 60 / (120 * parsedMidi.timeDivision);
    this._midiData = parsedMidi;
    this.isFinished = false;

    // Clear old embedded bank if exists
    this.synth.clearEmbeddedBank();

    // Check for embedded soundfont
    if (this._midiData.embeddedSoundBank !== undefined) {
        SpessaSynthInfo(
            "%cEmbedded soundbank detected! Using it.",
            consoleColors.recognized
        );
        this.synth.setEmbeddedSoundBank(
            this._midiData.embeddedSoundBank,
            this._midiData.bankOffset
        );
    }

    if (this.preload) {
        SpessaSynthGroupCollapsed(
            "%cPreloading samples...",
            consoleColors.info
        );
        // Smart preloading: load only samples used in the midi!
        const used = this._midiData.getUsedProgramsAndKeys(
            this.synth.soundBankManager
        );
        used.forEach((combos, preset) => {
            SpessaSynthInfo(
                `%cPreloading used samples on %c${preset.name}%c...`,
                consoleColors.info,
                consoleColors.recognized,
                consoleColors.info
            );
            for (const combo of combos) {
                const [midiNote, velocity] = combo.split("-").map(Number);
                this.synth.getVoicesForPreset(
                    preset,
                    midiNote,
                    velocity,
                    midiNote
                );
            }
        });
        SpessaSynthGroupEnd();
    }

    // Copy over the port data
    this.currentMIDIPorts = this._midiData.tracks.map((t) => t.port);

    // Clear last port data
    this.midiPortChannelOffset = 0;
    this.midiPortChannelOffsets = {};
    // Assign port offsets
    this._midiData.tracks.forEach((track, trackIndex) => {
        this.assignMIDIPort(trackIndex, track.port);
    });
    this.firstNoteTime = this._midiData.midiTicksToSeconds(
        this._midiData.firstNoteOn
    );
    SpessaSynthInfo(
        `%cTotal song time: ${formatTime(Math.ceil(this._midiData.duration)).time}`,
        consoleColors.recognized
    );
    this.callEvent("songChange", { songIndex: this._songIndex });

    if (this._midiData.duration <= 0.2) {
        SpessaSynthWarn(
            `%cVery short song: (${formatTime(Math.round(this._midiData.duration)).time}). Disabling loop!`,
            consoleColors.warn
        );
        this.loopCount = 0;
    }
    // Reset the time
    this.currentTime = 0;
}
