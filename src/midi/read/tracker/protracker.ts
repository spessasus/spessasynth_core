import type { IndexedByteArray } from "../../../utils/indexed_array";
import { readBinaryString } from "../../../utils/byte_functions/string";
import { readBigEndian } from "../../../utils/byte_functions/big_endian";
import {
    MIDDLE_C_PERIOD,
    singleSampleInstrument,
    TrackerModule
} from "./tracker_module";
import type { TrackerChannel } from "./tracker_channel";
import { NOTE_NONE, TrackerPattern } from "./tracker_pattern";
import { TrackerLoopTypes } from "./types";

/**
 * The Amiga PAL clock, multiplied by four as the periods are stored with four times the Amiga precision.
 */
const AMIGA_CLOCK = 3_546_895 * 4;

/**
 * The ProTracker effects (also used by Fast Tracker).
 */
export const ProTrackerEffects = {
    arpeggio: 0x0,
    portamentoUp: 0x1,
    portamentoDown: 0x2,
    tonePortamento: 0x3,
    vibrato: 0x4,
    tonePortamentoVolumeSlide: 0x5,
    vibratoVolumeSlide: 0x6,
    tremolo: 0x7,
    panning: 0x8,
    sampleOffset: 0x9,
    volumeSlide: 0xa,
    positionJump: 0xb,
    volume: 0xc,
    patternBreak: 0xd,
    extended: 0xe,
    speed: 0xf
} as const;

/**
 * The ProTracker extended (Exy) effects.
 */
export const ProTrackerExtendedEffects = {
    finePortamentoUp: 0x1,
    finePortamentoDown: 0x2,
    vibratoWaveform: 0x4,
    finetune: 0x5,
    patternLoop: 0x6,
    tremoloWaveform: 0x7,
    panning: 0x8,
    retrigger: 0x9,
    fineVolumeUp: 0xa,
    fineVolumeDown: 0xb,
    noteCut: 0xc,
    noteDelay: 0xd,
    patternDelay: 0xe
} as const;

/**
 * Channel count tags at offset 1080.
 */
const CHANNEL_TAGS: Record<string, number> = {
    "M.K.": 4,
    "M!K!": 4,
    "M&K!": 4,
    FLT4: 4,
    NSMS: 4,
    LARD: 4,
    FLT8: 8,
    OCTA: 8,
    OKTA: 8,
    CD81: 8
};

/**
 * Converts a ProTracker finetune nibble to a signed value.
 * @param nibble The finetune nibble (0-15).
 * @returns The finetune in 1/8 semitones (-8 to 7).
 */
function signedFinetune(nibble: number) {
    return nibble > 7 ? nibble - 16 : nibble;
}

/**
 * Parses a channel count from a MOD tag.
 * @param text The digits of the tag.
 * @returns The number, 0 if the text is not a number.
 */
function parseDigits(text: string) {
    return /^\d+$/.test(text) ? Number.parseInt(text) : 0;
}

/**
 * ProTracker module (MOD) loader and player.
 * Also implements the effects shared with the Fast Tracker XM format.
 */
export class ProTrackerModule extends TrackerModule {
    protected readonly formatName: string = "ProTracker MOD";
    /**
     * The middle C note (C-2 in ProTracker, C-4 in Fast Tracker) plays at its rate on C3,
     * so the shown notes match the pitch. The sound bank root key keeps the pitch.
     */
    protected rootKey = 48;

    /**
     * Gets the channel count from a MOD tag.
     * @param binary The file data.
     * @returns The channel count, 0 if the file is not a recognized MOD.
     */
    public static getChannelCount(binary: IndexedByteArray) {
        if (binary.length < 1084) {
            return 0;
        }
        const tag = readBinaryString(binary, 4, 1080);
        const known = CHANNEL_TAGS[tag];
        if (known) {
            return known;
        }
        if (tag.endsWith("CHN")) {
            return parseDigits(tag.slice(0, 1));
        }
        if (tag.endsWith("CH") || tag.endsWith("CN")) {
            return parseDigits(tag.slice(0, 2));
        }
        if (tag.startsWith("TDZ")) {
            return parseDigits(tag.slice(3));
        }
        return 0;
    }

    /**
     * Parses a MOD file.
     * @param binary The file data.
     */
    public parse(binary: IndexedByteArray) {
        this.channelCount = ProTrackerModule.getChannelCount(binary);
        if (this.channelCount < 1 || this.channelCount > 64) {
            throw new Error("Invalid MOD file: unknown channel count.");
        }
        // Startrekker 8 channel modules store each pattern as two 4 channel patterns
        const isFLT8 = readBinaryString(binary, 4, 1080) === "FLT8";
        const storedChannels = isFLT8 ? 4 : this.channelCount;
        this.title = readBinaryString(binary, 20, 0).trim();
        this.setPreAmp(Math.min(128, Math.max(32, 256 / this.channelCount)));
        this.minPeriod = 113 * 4;
        this.maxPeriod = 856 * 4;
        for (let i = 0; i < this.channelCount; i++) {
            // LRRL panning
            this.channelPanning.push((i & 3) === 1 || (i & 3) === 2 ? 192 : 64);
        }

        const sampleHeaders = new Array<{
            length: number;
            loopStart: number;
            loopLength: number;
        }>();
        const sampleNames = new Array<string>();
        for (let i = 0; i < 31; i++) {
            const offset = 20 + i * 30;
            const name = readBinaryString(binary, 22, offset);
            sampleNames.push(name);
            const finetune = signedFinetune(binary[offset + 24] & 0x0f);
            sampleHeaders.push({
                length: readBigEndian(binary, 2, offset + 22) * 2,
                loopStart: readBigEndian(binary, 2, offset + 26) * 2,
                loopLength: readBigEndian(binary, 2, offset + 28) * 2
            });
            this.samples.push({
                name,
                data: new Float32Array(0),
                loopType: TrackerLoopTypes.none,
                loopStart: 0,
                loopEnd: 0,
                volume: Math.min(64, binary[offset + 25]),
                panning: -1,
                finetune,
                relativeNote: 0,
                middleCRate:
                    (AMIGA_CLOCK / MIDDLE_C_PERIOD) *
                    Math.pow(2, finetune / 96),
                vibratoType: 0,
                vibratoSweep: 0,
                vibratoDepth: 0,
                vibratoRate: 0
            });
            this.instruments.push(singleSampleInstrument(name, i));
        }
        // Sample names often contain the song message
        this.comment = sampleNames.join("\n").trim();

        const songLength = Math.min(128, binary[950]);
        // 127 is the usual "no restart" value
        if (binary[951] < songLength) {
            this.restartPosition = binary[951];
        }
        let patternCount = 0;
        for (let i = 0; i < 128; i++) {
            const pattern = binary[952 + i];
            if (i < songLength) {
                // FLT8 orders only reference the even (first half) patterns
                this.orders.push(isFLT8 ? pattern >> 1 : pattern);
            }
            patternCount = Math.max(patternCount, pattern + 1);
        }
        if (isFLT8) {
            // The highest referenced pattern also has its second half stored
            patternCount++;
        }

        let offset = 1084;
        for (let p = 0; p < patternCount; p++) {
            if (!isFLT8 || p % 2 === 0) {
                this.patterns.push(new TrackerPattern(64, this.channelCount));
            }
            const pattern = this.patterns[this.patterns.length - 1];
            const firstChannel = isFLT8 ? (p % 2) * 4 : 0;
            for (let row = 0; row < 64; row++) {
                for (let c = 0; c < storedChannels; c++) {
                    const b0 = binary[offset++] ?? 0;
                    const b1 = binary[offset++] ?? 0;
                    const b2 = binary[offset++] ?? 0;
                    const b3 = binary[offset++] ?? 0;
                    const period = ((b0 & 0x0f) << 8) | b1;
                    const note =
                        period > 0
                            ? 49 +
                              Math.round(
                                  12 * Math.log2(MIDDLE_C_PERIOD / 4 / period)
                              )
                            : NOTE_NONE;
                    pattern.setCell(
                        row,
                        firstChannel + c,
                        Math.max(NOTE_NONE, note),
                        (b0 & 0xf0) | (b2 >> 4),
                        0,
                        b2 & 0x0f,
                        b3
                    );
                }
            }
        }

        // Signed 8-bit sample data
        for (const [i, header] of sampleHeaders.entries()) {
            const length = Math.min(header.length, binary.length - offset);
            if (length <= 2) {
                offset += header.length;
                continue;
            }
            const data = new Float32Array(length);
            for (let s = 0; s < length; s++) {
                data[s] = ((binary[offset + s] << 24) >> 24) / 128;
            }
            offset += header.length;
            const sample = this.samples[i];
            sample.data = data;
            if (header.loopLength > 2 && header.loopStart < length) {
                sample.loopType = TrackerLoopTypes.forward;
                sample.loopStart = header.loopStart;
                sample.loopEnd = Math.min(
                    length,
                    header.loopStart + header.loopLength
                );
            }
        }
    }

    protected noteToPeriod(note: number, channel: TrackerChannel) {
        return (
            MIDDLE_C_PERIOD *
            Math.pow(2, (49 - note) / 12 - channel.finetune / 96)
        );
    }

    protected periodToFrequency(period: number) {
        return AMIGA_CLOCK / period;
    }

    protected processRow(channel: TrackerChannel) {
        channel.vibratoDelta = 0;
        const effect = channel.rowEffect;
        const param = channel.rowParam;
        if (channel.rowInstrument) {
            const instrument = this.instruments[channel.rowInstrument - 1];
            if (instrument) {
                channel.instrument = instrument;
                const sample = this.samples[channel.rowInstrument - 1];
                channel.volume = sample.volume;
                channel.finetune = sample.finetune;
            }
        }
        // Set finetune also tunes the note on the same row, so it is applied before the note
        if (
            effect === ProTrackerEffects.extended &&
            param >> 4 === ProTrackerExtendedEffects.finetune
        ) {
            channel.finetune = signedFinetune(param & 0x0f);
        }
        if (channel.rowNote !== NOTE_NONE && !this.isNoteDelayed(channel)) {
            this.playRowNote(channel);
        }
        this.processRowEffect(channel, effect, param);
    }

    protected processTick(channel: TrackerChannel) {
        this.processTickEffect(channel, channel.rowEffect, channel.rowParam);
    }

    /**
     * Checks if the note of the current row is delayed with the note delay (EDx) effect.
     * @param channel The channel.
     */
    protected isNoteDelayed(channel: TrackerChannel) {
        return (
            channel.rowEffect === ProTrackerEffects.extended &&
            channel.rowParam >> 4 === ProTrackerExtendedEffects.noteDelay &&
            (channel.rowParam & 0x0f) > 0
        );
    }

    /**
     * Plays the note of the current row, or sets the tone portamento target.
     * @param channel The channel.
     */
    protected playRowNote(channel: TrackerChannel) {
        const effect = channel.rowEffect;
        if (
            effect === ProTrackerEffects.tonePortamento ||
            effect === ProTrackerEffects.tonePortamentoVolumeSlide
        ) {
            if (channel.sample) {
                channel.targetPeriod = this.noteToPeriod(
                    channel.rowNote,
                    channel
                );
            }
            return;
        }
        if (this.selectSample(channel, channel.rowNote)) {
            this.triggerNote(channel, channel.rowNote);
        }
    }

    /**
     * Processes the first tick of an effect.
     * @param channel The channel.
     * @param effect The effect number.
     * @param param The effect parameter, with the effect memory already applied.
     */
    protected processRowEffect(
        channel: TrackerChannel,
        effect: number,
        param: number
    ) {
        switch (effect) {
            default: {
                break;
            }

            case ProTrackerEffects.tonePortamento: {
                if (param) {
                    channel.tonePortamentoSpeed = param * 4;
                }
                break;
            }

            case ProTrackerEffects.vibrato: {
                channel.setVibrato(param);
                break;
            }

            case ProTrackerEffects.tremolo: {
                channel.setTremolo(param);
                break;
            }

            case ProTrackerEffects.panning: {
                channel.panning = param;
                break;
            }

            case ProTrackerEffects.sampleOffset: {
                channel.setSampleOffset(param);
                break;
            }

            case ProTrackerEffects.positionJump: {
                this.setPositionJump(param);
                break;
            }

            case ProTrackerEffects.volume: {
                channel.volume = Math.min(64, param);
                break;
            }

            case ProTrackerEffects.patternBreak: {
                this.patternBreak(param);
                break;
            }

            case ProTrackerEffects.speed: {
                if (param === 0) {
                    this.stopSong();
                } else if (param < 32) {
                    this.setSpeed(param);
                } else {
                    this.setTempo(param);
                }
                break;
            }

            case ProTrackerEffects.extended: {
                this.processExtendedEffect(channel, param >> 4, param & 0x0f);
                break;
            }
        }
    }

    /**
     * Processes the first tick of an extended (Exy) effect.
     * @param channel The channel.
     * @param effect The extended effect number.
     * @param value The effect value.
     */
    protected processExtendedEffect(
        channel: TrackerChannel,
        effect: number,
        value: number
    ) {
        switch (effect) {
            default: {
                break;
            }

            case ProTrackerExtendedEffects.finePortamentoUp: {
                this.slidePeriod(channel, -value * 4);
                break;
            }

            case ProTrackerExtendedEffects.finePortamentoDown: {
                this.slidePeriod(channel, value * 4);
                break;
            }

            case ProTrackerExtendedEffects.vibratoWaveform: {
                channel.vibratoWaveform = value;
                break;
            }

            case ProTrackerExtendedEffects.patternLoop: {
                this.patternLoop(channel, value);
                break;
            }

            case ProTrackerExtendedEffects.tremoloWaveform: {
                channel.tremoloWaveform = value;
                break;
            }

            case ProTrackerExtendedEffects.panning: {
                channel.panning = value * 17;
                break;
            }

            case ProTrackerExtendedEffects.fineVolumeUp: {
                channel.slideVolume(value);
                break;
            }

            case ProTrackerExtendedEffects.fineVolumeDown: {
                channel.slideVolume(-value);
                break;
            }

            case ProTrackerExtendedEffects.noteCut: {
                channel.noteCutTick = value;
                break;
            }

            case ProTrackerExtendedEffects.noteDelay: {
                channel.noteDelayTick = value;
                break;
            }

            case ProTrackerExtendedEffects.patternDelay: {
                this.setPatternDelay(value);
                break;
            }
        }
    }

    /**
     * Processes a non-first tick of an effect.
     * @param channel The channel.
     * @param effect The effect number.
     * @param param The effect parameter, with the effect memory already applied.
     */
    protected processTickEffect(
        channel: TrackerChannel,
        effect: number,
        param: number
    ) {
        switch (effect) {
            default: {
                break;
            }

            case ProTrackerEffects.arpeggio: {
                if (param) {
                    channel.setArpeggio(param, this.tick % 3);
                }
                break;
            }

            case ProTrackerEffects.portamentoUp: {
                this.slidePeriod(channel, -param * 4);
                break;
            }

            case ProTrackerEffects.portamentoDown: {
                this.slidePeriod(channel, param * 4);
                break;
            }

            case ProTrackerEffects.tonePortamento: {
                channel.tonePortamento();
                break;
            }

            case ProTrackerEffects.vibrato: {
                channel.vibrato(16, true);
                break;
            }

            case ProTrackerEffects.tonePortamentoVolumeSlide: {
                channel.tonePortamento();
                this.volumeSlide(channel, param);
                break;
            }

            case ProTrackerEffects.vibratoVolumeSlide: {
                channel.vibrato(16, true);
                this.volumeSlide(channel, param);
                break;
            }

            case ProTrackerEffects.tremolo: {
                channel.tremolo(32);
                break;
            }

            case ProTrackerEffects.volumeSlide: {
                this.volumeSlide(channel, param);
                break;
            }

            case ProTrackerEffects.extended: {
                const value = param & 0x0f;
                switch (param >> 4) {
                    default: {
                        break;
                    }

                    case ProTrackerExtendedEffects.retrigger: {
                        if (value && this.tick % value === 0) {
                            channel.trigger = true;
                            channel.sampleOffset = 0;
                        }
                        break;
                    }

                    case ProTrackerExtendedEffects.noteDelay: {
                        if (this.tick === channel.noteDelayTick) {
                            this.playDelayedNote(channel);
                        }
                        break;
                    }
                }
                break;
            }
        }
    }

    /**
     * Plays the note of a note delay effect.
     * @param channel The channel.
     */
    protected playDelayedNote(channel: TrackerChannel) {
        if (channel.rowNote !== NOTE_NONE) {
            this.playRowNote(channel);
        }
    }

    /**
     * Slides the volume up by the high nibble or down by the low nibble.
     * @param channel The channel.
     * @param param The slide parameter.
     */
    protected volumeSlide(channel: TrackerChannel, param: number) {
        if (param >> 4) {
            channel.slideVolume(param >> 4);
        } else {
            channel.slideVolume(-(param & 0x0f));
        }
    }
}
