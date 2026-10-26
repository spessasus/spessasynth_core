import type { IndexedByteArray } from "../../../utils/indexed_array";
import { readBinaryString } from "../../../utils/byte_functions/string";
import { readLittleEndian } from "../../../utils/byte_functions/little_endian";
import { SpessaLog } from "../../../utils/loggin";
import {
    MIDDLE_C_PERIOD,
    MIDDLE_C_RATE,
    singleSampleInstrument,
    TrackerModule
} from "./tracker_module";
import type { TrackerChannel } from "./tracker_channel";
import {
    NOTE_CUT,
    NOTE_MAX,
    NOTE_NONE,
    TrackerPattern
} from "./tracker_pattern";
import { TrackerLoopTypes } from "./types";

/**
 * The Scream Tracker effects (letters converted to numbers, A = 1).
 */
const ScreamTrackerEffects = {
    speed: 1, // A
    positionJump: 2, // B
    patternBreak: 3, // C
    volumeSlide: 4, // D
    portamentoDown: 5, // E
    portamentoUp: 6, // F
    tonePortamento: 7, // G
    vibrato: 8, // H
    tremor: 9, // I
    arpeggio: 10, // J
    vibratoVolumeSlide: 11, // K
    tonePortamentoVolumeSlide: 12, // L
    sampleOffset: 15, // O
    retrigger: 17, // Q
    tremolo: 18, // R
    extended: 19, // S
    tempo: 20, // T
    fineVibrato: 21, // U
    globalVolume: 22, // V
    panning: 24 // X
} as const;

/**
 * The Scream Tracker extended (Sxy) effects.
 */
const ScreamTrackerExtendedEffects = {
    finetune: 0x2,
    vibratoWaveform: 0x3,
    tremoloWaveform: 0x4,
    panning: 0x8,
    patternLoop: 0xb,
    noteCut: 0xc,
    noteDelay: 0xd,
    patternDelay: 0xe
} as const;

/**
 * The effects that share a single parameter memory in Scream Tracker 3.
 */
const SHARED_MEMORY_EFFECTS = new Set<number>([
    ScreamTrackerEffects.volumeSlide,
    ScreamTrackerEffects.portamentoDown,
    ScreamTrackerEffects.portamentoUp,
    ScreamTrackerEffects.tremor,
    ScreamTrackerEffects.arpeggio,
    ScreamTrackerEffects.vibratoVolumeSlide,
    ScreamTrackerEffects.tonePortamentoVolumeSlide,
    ScreamTrackerEffects.retrigger,
    ScreamTrackerEffects.tremolo,
    ScreamTrackerEffects.extended
]);

/**
 * The middle C rates set by the fine-tuning (S2x) effect.
 */
const FINETUNE_RATES = [
    7895, 7941, 7985, 8046, 8107, 8169, 8232, 8280, 8363, 8413, 8463, 8529,
    8581, 8651, 8723, 8757
];

/**
 * Reads a single sample point.
 * @param binary The file data.
 * @param dataOffset The offset of the sample data.
 * @param index The sample point index.
 * @param is16Bit If the sample is 16-bit.
 * @param signed If the sample data is signed.
 * @returns The sample point (-1 to 1).
 */
function readSamplePoint(
    binary: IndexedByteArray,
    dataOffset: number,
    index: number,
    is16Bit: boolean,
    signed: boolean
) {
    if (is16Bit) {
        const value = readLittleEndian(binary, 2, dataOffset + index * 2);
        return signed
            ? ((value << 16) >> 16) / 32_768
            : (value - 32_768) / 32_768;
    }
    const value = binary[dataOffset + index];
    return signed ? ((value << 24) >> 24) / 128 : (value - 128) / 128;
}

/**
 * Scream Tracker 3 module (S3M) loader and player.
 */
export class ScreamTrackerModule extends TrackerModule {
    protected readonly formatName = "Scream Tracker 3 S3M";
    private fastVolumeSlides = false;
    /**
     * The shared effect memory of each channel.
     */
    private sharedMemory = new Array<number>();

    /**
     * Checks if the file is an S3M module.
     * @param binary The file data.
     */
    public static isS3M(binary: IndexedByteArray) {
        return (
            binary.length > 0x60 && readBinaryString(binary, 4, 0x2c) === "SCRM"
        );
    }

    /**
     * Parses an S3M file.
     * @param binary The file data.
     */
    public parse(binary: IndexedByteArray) {
        this.title = readBinaryString(binary, 28, 0).trim();
        const orderCount = readLittleEndian(binary, 2, 0x20);
        const instrumentCount = readLittleEndian(binary, 2, 0x22);
        const patternCount = readLittleEndian(binary, 2, 0x24);
        const flags = readLittleEndian(binary, 2, 0x26);
        const trackerVersion = readLittleEndian(binary, 2, 0x28);
        const signedSamples = readLittleEndian(binary, 2, 0x2a) === 1;
        this.fastVolumeSlides =
            (flags & 0x40) !== 0 || trackerVersion === 0x13_00;
        this.initialGlobalVolume = Math.min(64, binary[0x30]);
        this.initialSpeed = binary[0x31] || 6;
        this.initialTempo = binary[0x32] >= 32 ? binary[0x32] : 125;
        const stereo = (binary[0x33] & 0x80) !== 0;

        this.minPeriod = 64;
        this.maxPeriod = 32_767;
        this.ignoreInvalidBreaks = true;

        const parapointers = 0x60 + orderCount;
        const panningTable =
            parapointers + instrumentCount * 2 + patternCount * 2;
        const hasPanningTable = binary[0x35] === 252;

        // Map the enabled sample channels
        const channelMap = new Int8Array(32).fill(-1);
        for (let i = 0; i < 32; i++) {
            const setting = binary[0x40 + i];
            if (setting >= 16) {
                // Disabled or AdLib channel
                continue;
            }
            channelMap[i] = this.channelCount++;
            let panning = stereo ? (setting & 8 ? 204 : 51) : 128;
            const custom = binary[panningTable + i];
            if (hasPanningTable && custom & 0x20) {
                panning = (custom & 0x0f) * 17;
            }
            this.channelPanning.push(panning);
            this.sharedMemory.push(0);
        }
        // The master volume (and the mono attenuation) is ignored.
        // It prevented clipping on the Sound Blaster and does not set the song loudness.
        // Like MOD, the level depends on the channel count instead
        this.setPreAmp(Math.min(48, Math.max(32, 256 / this.channelCount)));

        for (let i = 0; i < orderCount; i++) {
            const order = binary[0x60 + i];
            if (order === 255) {
                break;
            }
            this.orders.push(order === 254 ? -1 : order);
        }

        const comment = new Array<string>();
        for (let i = 0; i < instrumentCount; i++) {
            const offset =
                readLittleEndian(binary, 2, parapointers + i * 2) * 16;
            const name = readBinaryString(binary, 28, offset + 48);
            comment.push(name);
            const c2spd =
                readLittleEndian(binary, 4, offset + 32) || MIDDLE_C_RATE;
            this.samples.push({
                name,
                data: new Float32Array(0),
                loopType: TrackerLoopTypes.none,
                loopStart: 0,
                loopEnd: 0,
                volume: Math.min(64, binary[offset + 28]),
                panning: -1,
                finetune: c2spd,
                relativeNote: 0,
                middleCRate: c2spd,
                vibratoType: 0,
                vibratoSweep: 0,
                vibratoDepth: 0,
                vibratoRate: 0
            });
            this.instruments.push(singleSampleInstrument(name, i));
            if (binary[offset] !== 1) {
                if (binary[offset] > 1) {
                    SpessaLog.warn(
                        `AdLib instrument "${name}" is not supported.`
                    );
                }
                continue;
            }
            if (binary[offset + 30] !== 0) {
                SpessaLog.warn(`Packed sample "${name}" is not supported.`);
                continue;
            }
            const dataOffset =
                ((binary[offset + 13] << 16) |
                    readLittleEndian(binary, 2, offset + 14)) *
                16;
            const sampleFlags = binary[offset + 31];
            const is16Bit = (sampleFlags & 4) !== 0;
            const isStereo = (sampleFlags & 2) !== 0;
            const bytesPerSample = is16Bit ? 2 : 1;
            const length = Math.max(
                0,
                Math.min(
                    readLittleEndian(binary, 4, offset + 16),
                    Math.floor(
                        (binary.length - dataOffset) /
                            bytesPerSample /
                            (isStereo ? 2 : 1)
                    )
                )
            );
            const data = new Float32Array(length);
            for (let s = 0; s < length; s++) {
                // Stereo samples store the left channel first, then the right
                const left = readSamplePoint(
                    binary,
                    dataOffset,
                    s,
                    is16Bit,
                    signedSamples
                );
                data[s] = isStereo
                    ? (left +
                          readSamplePoint(
                              binary,
                              dataOffset,
                              s + length,
                              is16Bit,
                              signedSamples
                          )) /
                      2
                    : left;
            }
            const sample = this.samples[i];
            sample.data = data;
            const loopStart = readLittleEndian(binary, 4, offset + 20);
            const loopEnd = Math.min(
                length,
                readLittleEndian(binary, 4, offset + 24)
            );
            if (sampleFlags & 1 && loopStart < loopEnd) {
                sample.loopType = TrackerLoopTypes.forward;
                sample.loopStart = loopStart;
                sample.loopEnd = loopEnd;
            }
        }
        this.comment = comment.join("\n").trim();

        for (let p = 0; p < patternCount; p++) {
            const pattern = new TrackerPattern(64, this.channelCount);
            this.patterns.push(pattern);
            const offset =
                readLittleEndian(
                    binary,
                    2,
                    parapointers + instrumentCount * 2 + p * 2
                ) * 16;
            if (offset === 0) {
                continue;
            }
            const end = offset + readLittleEndian(binary, 2, offset);
            let position = offset + 2;
            for (let row = 0; row < 64 && position < end; ) {
                const what = binary[position++];
                if (what === 0) {
                    row++;
                    continue;
                }
                let note = NOTE_NONE;
                let instrument = 0;
                let volume = 0;
                let effect = 0;
                let param = 0;
                if (what & 0x20) {
                    const value = binary[position++];
                    instrument = binary[position++];
                    if (value === 254) {
                        note = NOTE_CUT;
                    } else if (value < 254) {
                        note = Math.min(
                            NOTE_MAX,
                            (value >> 4) * 12 + (value & 0x0f) + 1
                        );
                    }
                }
                if (what & 0x40) {
                    // Stored like the Fast Tracker volume column, so 0 means no volume
                    volume = Math.min(64, binary[position++]) + 0x10;
                }
                if (what & 0x80) {
                    effect = binary[position++];
                    param = binary[position++];
                }
                const channel = channelMap[what & 0x1f];
                if (channel >= 0) {
                    pattern.setCell(
                        row,
                        channel,
                        note,
                        instrument,
                        volume,
                        effect,
                        param
                    );
                }
            }
        }
    }

    protected noteToPeriod(note: number, channel: TrackerChannel) {
        return (
            ((MIDDLE_C_PERIOD * MIDDLE_C_RATE) / channel.finetune) *
            Math.pow(2, (49 - note) / 12)
        );
    }

    protected periodToFrequency(period: number) {
        return (MIDDLE_C_RATE * MIDDLE_C_PERIOD) / period;
    }

    protected processRow(channel: TrackerChannel) {
        const effect = channel.rowEffect;
        channel.tremorMuted = false;

        // Apply the shared effect memory and store the resolved parameter for the next ticks
        if (SHARED_MEMORY_EFFECTS.has(effect)) {
            if (channel.rowParam) {
                this.sharedMemory[channel.index] = channel.rowParam;
            } else {
                channel.rowParam = this.sharedMemory[channel.index];
            }
        }
        const param = channel.rowParam;

        const isDelayed =
            effect === ScreamTrackerEffects.extended &&
            param >> 4 === ScreamTrackerExtendedEffects.noteDelay &&
            (param & 0x0f) > 0;
        if (!isDelayed) {
            this.playRowNote(channel);
        }

        switch (effect) {
            default: {
                break;
            }

            case ScreamTrackerEffects.speed: {
                this.setSpeed(param);
                break;
            }

            case ScreamTrackerEffects.positionJump: {
                this.setPositionJump(param);
                break;
            }

            case ScreamTrackerEffects.patternBreak: {
                this.patternBreak(param);
                break;
            }

            case ScreamTrackerEffects.volumeSlide: {
                this.volumeSlide(channel, param, true);
                break;
            }

            case ScreamTrackerEffects.portamentoDown: {
                this.finePortamento(channel, param, 1);
                break;
            }

            case ScreamTrackerEffects.portamentoUp: {
                this.finePortamento(channel, param, -1);
                break;
            }

            case ScreamTrackerEffects.tonePortamento: {
                if (param) {
                    channel.tonePortamentoSpeed = param * 4;
                }
                break;
            }

            case ScreamTrackerEffects.vibrato: {
                // Fine vibrato shares the depth, so it is stored with four times the precision
                channel.setVibrato(param, 4);
                channel.vibrato(64, false);
                break;
            }

            case ScreamTrackerEffects.fineVibrato: {
                channel.setVibrato(param);
                channel.vibrato(64, false);
                break;
            }

            case ScreamTrackerEffects.vibratoVolumeSlide: {
                channel.vibrato(64, false);
                this.volumeSlide(channel, param, true);
                break;
            }

            case ScreamTrackerEffects.tonePortamentoVolumeSlide: {
                this.volumeSlide(channel, param, true);
                break;
            }

            case ScreamTrackerEffects.sampleOffset: {
                channel.setSampleOffset(param);
                break;
            }

            case ScreamTrackerEffects.tremolo: {
                channel.setTremolo(param);
                break;
            }

            case ScreamTrackerEffects.tempo: {
                this.setTempo(param);
                break;
            }

            case ScreamTrackerEffects.globalVolume: {
                if (param <= 64) {
                    this.globalVolume = param;
                }
                break;
            }

            case ScreamTrackerEffects.panning: {
                if (param <= 0x80) {
                    channel.panning = Math.min(255, param * 2);
                }
                break;
            }

            case ScreamTrackerEffects.extended: {
                this.processExtendedEffect(channel, param >> 4, param & 0x0f);
                break;
            }
        }

        if (
            effect !== ScreamTrackerEffects.vibrato &&
            effect !== ScreamTrackerEffects.fineVibrato &&
            effect !== ScreamTrackerEffects.vibratoVolumeSlide
        ) {
            channel.vibratoDelta = 0;
        }
    }

    protected processTick(channel: TrackerChannel) {
        const param = channel.rowParam;
        switch (channel.rowEffect) {
            default: {
                break;
            }

            case ScreamTrackerEffects.volumeSlide: {
                this.volumeSlide(channel, param, false);
                break;
            }

            case ScreamTrackerEffects.portamentoDown: {
                if (param < 0xe0) {
                    this.slidePeriod(channel, param * 4);
                }
                break;
            }

            case ScreamTrackerEffects.portamentoUp: {
                if (param < 0xe0) {
                    this.slidePeriod(channel, -param * 4);
                }
                break;
            }

            case ScreamTrackerEffects.tonePortamento: {
                channel.tonePortamento();
                break;
            }

            case ScreamTrackerEffects.vibrato:
            case ScreamTrackerEffects.fineVibrato: {
                channel.vibrato(64, true);
                break;
            }

            case ScreamTrackerEffects.tremor: {
                channel.tremor(param);
                break;
            }

            case ScreamTrackerEffects.arpeggio: {
                channel.setArpeggio(param, this.tick % 3);
                break;
            }

            case ScreamTrackerEffects.vibratoVolumeSlide: {
                channel.vibrato(64, true);
                this.volumeSlide(channel, param, false);
                break;
            }

            case ScreamTrackerEffects.tonePortamentoVolumeSlide: {
                channel.tonePortamento();
                this.volumeSlide(channel, param, false);
                break;
            }

            case ScreamTrackerEffects.retrigger: {
                channel.multiRetrigger(param);
                break;
            }

            case ScreamTrackerEffects.tremolo: {
                channel.tremolo(64);
                break;
            }

            case ScreamTrackerEffects.extended: {
                if (
                    param >> 4 === ScreamTrackerExtendedEffects.noteDelay &&
                    this.tick === channel.noteDelayTick
                ) {
                    this.playRowNote(channel);
                }
                break;
            }
        }
    }

    /**
     * Plays the note, instrument, finetune and volume of the current row.
     * @param channel The channel.
     */
    private playRowNote(channel: TrackerChannel) {
        const instrumentNumber = channel.rowInstrument;
        if (instrumentNumber) {
            const instrument = this.instruments[instrumentNumber - 1];
            if (instrument) {
                const sample = this.samples[instrumentNumber - 1];
                channel.instrument = instrument;
                channel.volume = sample.volume;
                channel.finetune = sample.finetune;
            }
        }
        // Set finetune (S2x) also tunes the note on the same row, so it is applied before the note
        const param = channel.rowParam;
        if (
            channel.rowEffect === ScreamTrackerEffects.extended &&
            param >> 4 === ScreamTrackerExtendedEffects.finetune
        ) {
            channel.finetune = FINETUNE_RATES[param & 0x0f];
        }
        const note = channel.rowNote;
        if (note === NOTE_CUT) {
            channel.stop = true;
        } else if (note !== NOTE_NONE) {
            const effect = channel.rowEffect;
            const isPortamento =
                effect === ScreamTrackerEffects.tonePortamento ||
                effect === ScreamTrackerEffects.tonePortamentoVolumeSlide;
            if (isPortamento && channel.sample) {
                channel.targetPeriod = this.noteToPeriod(note, channel);
            } else if (this.selectSample(channel, note)) {
                this.triggerNote(channel, note);
            }
        }
        if (channel.rowVolume) {
            channel.volume = channel.rowVolume - 0x10;
        }
    }

    /**
     * Processes the first tick of an extended (Sxy) effect.
     * @param channel The channel.
     * @param effect The extended effect number.
     * @param value The effect value.
     */
    private processExtendedEffect(
        channel: TrackerChannel,
        effect: number,
        value: number
    ) {
        switch (effect) {
            default: {
                break;
            }

            case ScreamTrackerExtendedEffects.vibratoWaveform: {
                channel.vibratoWaveform = value;
                break;
            }

            case ScreamTrackerExtendedEffects.tremoloWaveform: {
                channel.tremoloWaveform = value;
                break;
            }

            case ScreamTrackerExtendedEffects.panning: {
                channel.panning = value * 17;
                break;
            }

            case ScreamTrackerExtendedEffects.patternLoop: {
                this.patternLoop(channel, value);
                break;
            }

            case ScreamTrackerExtendedEffects.noteCut: {
                // Scream Tracker ignores SC0
                if (value) {
                    channel.noteCutTick = value;
                }
                break;
            }

            case ScreamTrackerExtendedEffects.noteDelay: {
                channel.noteDelayTick = value;
                break;
            }

            case ScreamTrackerExtendedEffects.patternDelay: {
                this.setPatternDelay(value);
                break;
            }
        }
    }

    /**
     * Processes the fine and extra fine portamento on the first tick.
     * @param channel The channel.
     * @param param The effect parameter.
     * @param direction 1 for down, -1 for up.
     */
    private finePortamento(
        channel: TrackerChannel,
        param: number,
        direction: number
    ) {
        if (param >= 0xf0) {
            this.slidePeriod(channel, direction * (param & 0x0f) * 4);
        } else if (param >= 0xe0) {
            this.slidePeriod(channel, direction * (param & 0x0f));
        }
    }

    /**
     * Processes the Scream Tracker volume slide, which also encodes the fine slides.
     * @param channel The channel.
     * @param param The effect parameter.
     * @param firstTick If this is the first tick of the row.
     */
    private volumeSlide(
        channel: TrackerChannel,
        param: number,
        firstTick: boolean
    ) {
        const up = param >> 4;
        const down = param & 0x0f;
        if (down === 0x0f && up) {
            // Fine slide up
            if (firstTick) {
                channel.slideVolume(up);
            }
        } else if (up === 0x0f && down) {
            // Fine slide down
            if (firstTick) {
                channel.slideVolume(-down);
            }
        } else if (!firstTick || this.fastVolumeSlides) {
            channel.slideVolume(down ? -down : up);
        }
    }
}
