import { consoleColors, formatTime } from "../utils/other";
import { SpessaSynthGroupCollapsed, SpessaSynthGroupEnd, SpessaSynthInfo, SpessaSynthWarn } from "../utils/loggin";
import { BasicMIDI } from "../midi/basic_midi";
import type { SpessaSynthSequencer } from "./sequencer";

/**
 * Assigns a MIDI port channel offset to a track.
 * @param trackNum The track number to assign the port to.
 * @param port The MIDI port number to assign.
 */
export function assingMIDIPortInternal(
    this: SpessaSynthSequencer,
    trackNum: number,
    port: number
) {
    // do not assign ports to empty tracks
    if (this.midiData.usedChannelsOnTrack[trackNum].size === 0) {
        return;
    }

    // assign new 16 channels if the port is not occupied yet
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

    this.midiPorts[trackNum] = port;
}

/**
 * Loads a new sequence internally.
 * @param parsedMidi The parsed MIDI data to load.
 * @param autoPlay Whether to automatically play the sequence after loading.
 */
export function loadNewSequenceInternal(
    this: SpessaSynthSequencer,
    parsedMidi: BasicMIDI,
    autoPlay: boolean = true
) {
    this.stop();
    if (!parsedMidi.tracks) {
        throw new Error("This MIDI has no tracks!");
    }

    this.oneTickToSeconds = 60 / (120 * parsedMidi.timeDivision);

    /**
     * @type {BasicMIDI}
     */
    this.midiData = parsedMidi;

    // clear old embedded bank if exists
    this.synth.clearEmbeddedBank();

    // check for embedded soundfont
    if (this.midiData.embeddedSoundBank !== undefined) {
        SpessaSynthInfo(
            "%cEmbedded soundbank detected! Using it.",
            consoleColors.recognized
        );
        this.synth.setEmbeddedSoundBank(
            this.midiData.embeddedSoundBank,
            this.midiData.bankOffset
        );
    }

    SpessaSynthGroupCollapsed("%cPreloading samples...", consoleColors.info);
    // smart preloading: load only samples used in the midi!
    const used = this.midiData.getUsedProgramsAndKeys(
        this.synth.soundBankManager
    );
    for (const [programBank, combos] of Object.entries(used)) {
        const [bank, program] = programBank.split(":").map(Number);
        const preset = this.synth.getPreset(bank, program);
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
                bank,
                program,
                midiNote,
                velocity,
                midiNote
            );
        }
    }
    SpessaSynthGroupEnd();

    // copy over the port data
    this.midiPorts = this.midiData.midiPorts.slice();

    // clear last port data
    this.midiPortChannelOffset = 0;
    this.midiPortChannelOffsets = {};
    // assign port offsets
    this.midiData.midiPorts.forEach((port, trackIndex) => {
        this.assignMIDIPort(trackIndex, port);
    });

    /**
     * Same as "audio.duration" property (seconds)
     * @type {number}
     */
    this.duration = this.midiData.duration;
    this.firstNoteTime = this.midiData.midiTicksToSeconds(
        this.midiData.firstNoteOn
    );
    SpessaSynthInfo(
        `%cTotal song time: ${formatTime(Math.ceil(this.duration)).time}`,
        consoleColors.recognized
    );
    this?.onSongChange?.(this._songIndex, autoPlay);

    if (this.duration <= 1) {
        SpessaSynthWarn(
            `%cVery short song: (${formatTime(Math.round(this.duration)).time}). Disabling loop!`,
            consoleColors.warn
        );
        this.loop = false;
    }
    if (autoPlay) {
        this.play(true);
    } else {
        // this shall not play: play to the first note and then wait
        const targetTime = this.skipToFirstNoteOn
            ? this.midiData.firstNoteOn - 1
            : 0;
        this.setTimeTicks(targetTime);
        this.pause();
    }
}
