import type { IndexedByteArray } from "../../../utils/indexed_array";
import { readBinaryString } from "../../../utils/byte_functions/string";
import { readLittleEndian } from "../../../utils/byte_functions/little_endian";
import {
    ProTrackerEffects,
    ProTrackerExtendedEffects,
    ProTrackerModule
} from "./protracker";
import type { TrackerChannel } from "./tracker_channel";
import {
    emptyEnvelope,
    MIDDLE_C_PERIOD,
    MIDDLE_C_RATE
} from "./tracker_module";
import {
    NOTE_MAX,
    NOTE_NONE,
    NOTE_OFF,
    TrackerPattern
} from "./tracker_pattern";
import {
    type TrackerEnvelope,
    type TrackerEnvelopePoint,
    type TrackerInstrument,
    type TrackerLoopType,
    TrackerLoopTypes
} from "./types";

const XM_SIGNATURE = "Extended Module: ";

/**
 * The reserved sample header byte that marks ModPlug ADPCM compressed samples.
 */
const ADPCM_MARKER = 0xad;

/**
 * The size of the delta table at the start of ADPCM sample data.
 */
const ADPCM_TABLE_SIZE = 16;

/**
 * The Fast Tracker effects beyond the ProTracker ones.
 */
const FastTrackerEffects = {
    globalVolume: 16,
    globalVolumeSlide: 17,
    keyOff: 20,
    envelopePosition: 21,
    panningSlide: 25,
    multiRetrigger: 27,
    tremor: 29,
    extraFinePortamento: 33
} as const;

/**
 * The Fast Tracker volume column commands (high nibble).
 */
const VolumeColumnCommands = {
    slideDown: 0x6,
    slideUp: 0x7,
    fineSlideDown: 0x8,
    fineSlideUp: 0x9,
    vibratoSpeed: 0xa,
    vibrato: 0xb,
    panning: 0xc,
    panningSlideLeft: 0xd,
    panningSlideRight: 0xe,
    tonePortamento: 0xf
} as const;

/**
 * The 256-step sine table of the automatic vibrato.
 */
const AUTO_VIBRATO_SINE = new Int8Array(256);
for (let i = 0; i < 256; i++) {
    AUTO_VIBRATO_SINE[i] = Math.round(64 * Math.sin((i * Math.PI) / 128));
}

/**
 * Gets the value of an envelope at a position.
 * @param envelope The envelope.
 * @param tick The position.
 * @returns The value (0-64).
 */
function getEnvelopeValue(envelope: TrackerEnvelope, tick: number) {
    const points = envelope.points;
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (tick < b.tick) {
            if (tick <= a.tick || b.tick === a.tick) {
                return a.value;
            }
            return (
                a.value +
                ((b.value - a.value) * (tick - a.tick)) / (b.tick - a.tick)
            );
        }
    }
    return points[points.length - 1]?.value ?? 64;
}

/**
 * Advances the envelope position by one tick.
 * @param envelope The envelope.
 * @param tick The current position.
 * @param keyOn If the key is held (sustain is active).
 * @returns The new position.
 */
function advanceEnvelope(
    envelope: TrackerEnvelope,
    tick: number,
    keyOn: boolean
) {
    const points = envelope.points;
    tick++;
    if (envelope.loopEnd >= 0 && tick === points[envelope.loopEnd].tick) {
        // Fast Tracker escapes the loop after key off if the sustain point is the loop end
        const escape =
            !keyOn &&
            envelope.sustainPoint >= 0 &&
            envelope.sustainPoint === envelope.loopEnd;
        if (!escape) {
            tick = points[envelope.loopStart].tick;
        }
    }
    if (envelope.sustainPoint >= 0 && keyOn) {
        if (tick === points[envelope.sustainPoint].tick + 1) {
            tick = points[envelope.sustainPoint].tick;
        }
    } else if (tick > points[points.length - 1].tick) {
        tick = points[points.length - 1].tick;
    }
    return tick;
}

/**
 * Decodes delta-encoded PCM sample data.
 * @param binary The file data.
 * @param offset The offset of the sample data.
 * @param length The number of sample points.
 * @param is16Bit If the sample is 16-bit.
 * @returns The decoded sample data.
 */
function decodeDeltaPCM(
    binary: IndexedByteArray,
    offset: number,
    length: number,
    is16Bit: boolean
) {
    const data = new Float32Array(length);
    let value = 0;
    for (let n = 0; n < length; n++) {
        if (is16Bit) {
            value =
                (value +
                    (binary[offset + n * 2] |
                        (binary[offset + n * 2 + 1] << 8))) &
                0xff_ff;
            data[n] = ((value << 16) >> 16) / 32_768;
        } else {
            value = (value + binary[offset + n]) & 0xff;
            data[n] = ((value << 24) >> 24) / 128;
        }
    }
    return data;
}

/**
 * Decodes ModPlug 4-bit ADPCM sample data: a 16 entry delta table followed by two table indexes per byte.
 * @param binary The file data.
 * @param offset The offset of the sample data.
 * @param length The number of sample points.
 * @returns The decoded sample data.
 */
function decodeADPCM(binary: IndexedByteArray, offset: number, length: number) {
    const data = new Float32Array(length);
    let value = 0;
    for (let n = 0; n < length; n++) {
        const byte = binary[offset + ADPCM_TABLE_SIZE + (n >> 1)];
        // The low nibble comes first
        const index = n & 1 ? byte >> 4 : byte & 0x0f;
        value = (value + binary[offset + index]) & 0xff;
        data[n] = ((value << 24) >> 24) / 128;
    }
    return data;
}

/**
 * Reads a volume or panning envelope from an XM instrument header.
 * @param binary The file data.
 * @param offset The instrument header offset.
 * @param panning True for the panning envelope, false for the volume envelope.
 * @returns The envelope.
 */
function readEnvelope(
    binary: IndexedByteArray,
    offset: number,
    panning: boolean
) {
    const pointsOffset = offset + (panning ? 177 : 129);
    const count = Math.min(12, binary[offset + (panning ? 226 : 225)]);
    const settings = offset + (panning ? 230 : 227);
    const sustain = binary[settings];
    const loopStart = binary[settings + 1];
    const loopEnd = binary[settings + 2];
    const type = binary[offset + (panning ? 234 : 233)];
    const points = new Array<TrackerEnvelopePoint>();
    for (let p = 0; p < count; p++) {
        points.push({
            tick: readLittleEndian(binary, 2, pointsOffset + p * 4),
            value: readLittleEndian(binary, 2, pointsOffset + p * 4 + 2)
        });
    }
    const hasLoop = (type & 4) !== 0 && loopEnd < count && loopStart <= loopEnd;
    const envelope: TrackerEnvelope = {
        enabled: (type & 1) !== 0 && count > 0,
        points,
        sustainPoint: (type & 2) !== 0 && sustain < count ? sustain : -1,
        loopStart: hasLoop ? loopStart : -1,
        loopEnd: hasLoop ? loopEnd : -1
    };
    return envelope;
}

/**
 * Fast Tracker 2 extended module (XM) loader and player.
 * The ProTracker effects are shared, with Fast Tracker's effect memory, volume column and instruments added.
 */
export class FastTrackerModule extends ProTrackerModule {
    protected readonly formatName: string = "Fast Tracker 2 XM";
    private linearFrequencies = false;

    /**
     * Checks if the file is an XM module.
     * @param binary The file data.
     */
    public static isXM(binary: IndexedByteArray) {
        return readBinaryString(binary, 17, 0) === XM_SIGNATURE;
    }

    /**
     * Parses an XM file.
     * @param binary The file data.
     */
    public parse(binary: IndexedByteArray) {
        this.title = readBinaryString(binary, 20, 17).trim();
        // Usually the tracker name, but some modules store a group or author name here
        this.madeWith = readBinaryString(binary, 20, 38).trim();
        const version = readLittleEndian(binary, 2, 58);
        if (version < 0x01_04) {
            throw new Error(
                `Unsupported XM version: ${version.toString(16)}. Only 1.04 is supported.`
            );
        }
        const headerSize = readLittleEndian(binary, 4, 60);
        const songLength = readLittleEndian(binary, 2, 64);
        this.restartPosition = readLittleEndian(binary, 2, 66);
        this.channelCount = readLittleEndian(binary, 2, 68);
        const patternCount = readLittleEndian(binary, 2, 70);
        const instrumentCount = readLittleEndian(binary, 2, 72);
        this.linearFrequencies = (readLittleEndian(binary, 2, 74) & 1) === 1;
        this.initialSpeed = readLittleEndian(binary, 2, 76) || 6;
        this.initialTempo = readLittleEndian(binary, 2, 78) || 125;
        this.setPreAmp(64);
        this.squareRootPanning = true;
        for (let i = 0; i < Math.min(256, songLength); i++) {
            this.orders.push(binary[80 + i]);
        }
        for (let i = 0; i < this.channelCount; i++) {
            this.channelPanning.push(128);
        }

        let offset = 60 + headerSize;
        for (let p = 0; p < patternCount; p++) {
            const patternHeaderLength = readLittleEndian(binary, 4, offset);
            const rows = readLittleEndian(binary, 2, offset + 5) || 64;
            const packedSize = readLittleEndian(binary, 2, offset + 7);
            offset += patternHeaderLength;
            const pattern = new TrackerPattern(rows, this.channelCount);
            const end = offset + packedSize;
            for (let row = 0; row < rows && offset < end; row++) {
                for (let c = 0; c < this.channelCount && offset < end; c++) {
                    let note = 0;
                    let instrument = 0;
                    let volume = 0;
                    let effect = 0;
                    let param = 0;
                    const flags = binary[offset++];
                    if (flags & 0x80) {
                        if (flags & 1) note = binary[offset++];
                        if (flags & 2) instrument = binary[offset++];
                        if (flags & 4) volume = binary[offset++];
                        if (flags & 8) effect = binary[offset++];
                        if (flags & 16) param = binary[offset++];
                    } else {
                        note = flags;
                        instrument = binary[offset++];
                        volume = binary[offset++];
                        effect = binary[offset++];
                        param = binary[offset++];
                    }
                    if (note === 97) {
                        note = NOTE_OFF;
                    } else if (note > 96) {
                        note = NOTE_NONE;
                    }
                    pattern.setCell(
                        row,
                        c,
                        note,
                        instrument,
                        volume,
                        effect,
                        param
                    );
                }
            }
            offset = end;
            this.patterns.push(pattern);
        }

        const comment = new Array<string>();
        for (let i = 0; i < instrumentCount; i++) {
            const instrumentStart = offset;
            const instrumentSize = readLittleEndian(binary, 4, offset);
            const name = readBinaryString(binary, 22, offset + 4);
            comment.push(name);
            const sampleCount = readLittleEndian(binary, 2, offset + 27);
            const instrument: TrackerInstrument = {
                name,
                sampleMap: new Int16Array(NOTE_MAX).fill(-1),
                volumeEnvelope: emptyEnvelope(),
                panningEnvelope: emptyEnvelope(),
                fadeout: 0
            };
            this.instruments.push(instrument);
            if (sampleCount === 0) {
                offset += instrumentSize;
                continue;
            }
            const sampleHeaderSize = readLittleEndian(binary, 4, offset + 29);
            const firstSample = this.samples.length;
            for (let n = 0; n < 96; n++) {
                const sample = binary[offset + 33 + n];
                if (sample < sampleCount) {
                    instrument.sampleMap[n] = firstSample + sample;
                }
            }
            instrument.volumeEnvelope = readEnvelope(binary, offset, false);
            instrument.panningEnvelope = readEnvelope(binary, offset, true);
            const vibratoType = binary[offset + 235];
            const vibratoSweep = binary[offset + 236];
            const vibratoDepth = binary[offset + 237];
            const vibratoRate = binary[offset + 238];
            instrument.fadeout = readLittleEndian(binary, 2, offset + 239) * 2;

            offset = instrumentStart + instrumentSize;
            const headers = new Array<{
                frames: number;
                storedSize: number;
                loopStart: number;
                loopLength: number;
                is16Bit: boolean;
                isStereo: boolean;
                isADPCM: boolean;
                loopType: TrackerLoopType;
            }>();
            const instrumentName = name.trim();
            for (let s = 0; s < sampleCount; s++) {
                const sampleType = binary[offset + 14];
                const is16Bit = (sampleType & 0x10) !== 0;
                // OpenMPT stores stereo samples as the left channel followed by the right channel
                const isStereo = (sampleType & 0x20) !== 0;
                const isADPCM =
                    binary[offset + 17] === ADPCM_MARKER &&
                    !is16Bit &&
                    !isStereo;
                // The lengths are in bytes, covering both channels
                const bytesPerFrame = (is16Bit ? 2 : 1) * (isStereo ? 2 : 1);
                const length = readLittleEndian(binary, 4, offset);
                const finetune = (binary[offset + 13] << 24) >> 24;
                const relativeNote = (binary[offset + 16] << 24) >> 24;
                headers.push({
                    frames: Math.floor(length / bytesPerFrame),
                    storedSize: isADPCM
                        ? ADPCM_TABLE_SIZE + Math.ceil(length / 2)
                        : length,
                    loopStart: Math.floor(
                        readLittleEndian(binary, 4, offset + 4) / bytesPerFrame
                    ),
                    loopLength: Math.floor(
                        readLittleEndian(binary, 4, offset + 8) / bytesPerFrame
                    ),
                    is16Bit,
                    isStereo,
                    isADPCM,
                    loopType: Math.min(2, sampleType & 3) as TrackerLoopType
                });
                this.samples.push({
                    // Unnamed samples inherit the instrument name, numbered if the instrument has more samples
                    name:
                        readBinaryString(binary, 22, offset + 18).trim() ||
                        (sampleCount > 1 && instrumentName
                            ? `${instrumentName} ${s + 1}`
                            : instrumentName),
                    data: new Float32Array(0),
                    loopType: TrackerLoopTypes.none,
                    loopStart: 0,
                    loopEnd: 0,
                    volume: Math.min(64, binary[offset + 12]),
                    panning: binary[offset + 15],
                    finetune,
                    relativeNote,
                    middleCRate:
                        MIDDLE_C_RATE *
                        Math.pow(2, (relativeNote + finetune / 128) / 12),
                    vibratoType,
                    vibratoSweep,
                    vibratoDepth,
                    vibratoRate
                });
                offset += sampleHeaderSize;
            }

            // Delta-encoded (or ADPCM compressed) sample data
            for (const [s, header] of headers.entries()) {
                const sample = this.samples[firstSample + s];
                // Truncated files only have part of the data
                const available = Math.max(
                    0,
                    Math.min(header.storedSize, binary.length - offset)
                );
                let data;
                if (header.isADPCM) {
                    data = decodeADPCM(
                        binary,
                        offset,
                        Math.max(
                            0,
                            Math.min(
                                header.frames,
                                (available - ADPCM_TABLE_SIZE) * 2
                            )
                        )
                    );
                } else {
                    const bytesPerSample = header.is16Bit ? 2 : 1;
                    const length = Math.min(
                        header.frames,
                        Math.floor(
                            available /
                                bytesPerSample /
                                (header.isStereo ? 2 : 1)
                        )
                    );
                    data = decodeDeltaPCM(
                        binary,
                        offset,
                        length,
                        header.is16Bit
                    );
                    if (header.isStereo) {
                        // Mix down to mono, each channel has its own delta encoding
                        const right = decodeDeltaPCM(
                            binary,
                            offset + header.frames * bytesPerSample,
                            length,
                            header.is16Bit
                        );
                        for (let n = 0; n < length; n++) {
                            data[n] = (data[n] + right[n]) / 2;
                        }
                    }
                }
                const length = data.length;
                offset += header.storedSize;
                sample.data = data;
                const loopEnd = Math.min(
                    length,
                    header.loopStart + header.loopLength
                );
                if (
                    header.loopType !== TrackerLoopTypes.none &&
                    header.loopLength > 0 &&
                    header.loopStart < loopEnd
                ) {
                    sample.loopType = header.loopType;
                    sample.loopStart = header.loopStart;
                    sample.loopEnd = loopEnd;
                }
            }
        }
        const message = this.readOpenMPTExtensions(
            binary,
            offset,
            instrumentCount
        );
        // The song message comes first, the instrument names often contain another one
        this.comment = [message, comment.join("\n").trim()]
            .filter(Boolean)
            .join("\n\n");
    }

    protected noteToPeriod(note: number, channel: TrackerChannel) {
        const n = note - 1 + (channel.sample?.relativeNote ?? 0);
        if (this.linearFrequencies) {
            return 7680 - n * 64 - channel.finetune / 2;
        }
        return (
            MIDDLE_C_PERIOD *
            Math.pow(2, (48 - n) / 12 - channel.finetune / (128 * 12))
        );
    }

    protected periodToFrequency(period: number) {
        if (this.linearFrequencies) {
            return MIDDLE_C_RATE * Math.pow(2, (4608 - period) / 768);
        }
        return (MIDDLE_C_RATE * MIDDLE_C_PERIOD) / period;
    }

    protected processRow(channel: TrackerChannel) {
        const effect = channel.rowEffect;
        const volumeCommand = channel.rowVolume >> 4;

        if (!this.isNoteDelayed(channel)) {
            this.playRowNote(channel);
        }

        // Volume column (first tick)
        const value = channel.rowVolume & 0x0f;
        switch (volumeCommand) {
            default: {
                break;
            }

            case VolumeColumnCommands.fineSlideDown: {
                channel.slideVolume(-value);
                break;
            }

            case VolumeColumnCommands.fineSlideUp: {
                channel.slideVolume(value);
                break;
            }

            case VolumeColumnCommands.vibratoSpeed: {
                if (value) {
                    channel.vibratoSpeed = value;
                }
                break;
            }

            case VolumeColumnCommands.vibrato: {
                if (value) {
                    channel.vibratoDepth = value;
                }
                break;
            }

            case VolumeColumnCommands.panning: {
                channel.panning = value << 4;
                break;
            }

            case VolumeColumnCommands.tonePortamento: {
                if (value) {
                    channel.tonePortamentoSpeed = (value << 4) * 4;
                }
                break;
            }
        }

        // Store the parameter with the effect memory applied for the next ticks
        const param = (channel.rowParam = this.applyMemory(
            channel,
            effect,
            channel.rowParam
        ));
        switch (effect) {
            default: {
                this.processRowEffect(channel, effect, param);
                break;
            }

            case FastTrackerEffects.globalVolume: {
                this.globalVolume = Math.min(64, param);
                break;
            }

            case FastTrackerEffects.keyOff: {
                if (param === 0) {
                    this.keyOff(channel);
                }
                break;
            }

            case FastTrackerEffects.envelopePosition: {
                channel.volumeEnvelopeTick = param;
                channel.panningEnvelopeTick = param;
                break;
            }

            case FastTrackerEffects.extraFinePortamento: {
                if (param >> 4 === 1) {
                    this.slidePeriod(channel, -(param & 0x0f));
                } else if (param >> 4 === 2) {
                    this.slidePeriod(channel, param & 0x0f);
                }
                break;
            }
        }

        // Vibrato is applied on the first tick without advancing
        if (
            effect === ProTrackerEffects.vibrato ||
            effect === ProTrackerEffects.vibratoVolumeSlide ||
            volumeCommand === VolumeColumnCommands.vibrato
        ) {
            channel.vibrato(16, false);
        } else {
            channel.vibratoDelta = 0;
        }
    }

    protected processTick(channel: TrackerChannel) {
        const value = channel.rowVolume & 0x0f;
        switch (channel.rowVolume >> 4) {
            default: {
                break;
            }

            case VolumeColumnCommands.slideDown: {
                channel.slideVolume(-value);
                break;
            }

            case VolumeColumnCommands.slideUp: {
                channel.slideVolume(value);
                break;
            }

            case VolumeColumnCommands.vibrato: {
                channel.vibrato(16, true);
                break;
            }

            case VolumeColumnCommands.panningSlideLeft: {
                channel.slidePanning(-value);
                break;
            }

            case VolumeColumnCommands.panningSlideRight: {
                channel.slidePanning(value);
                break;
            }

            case VolumeColumnCommands.tonePortamento: {
                channel.tonePortamento();
                break;
            }
        }

        const effect = channel.rowEffect;
        const param = channel.rowParam;
        switch (effect) {
            default: {
                this.processTickEffect(channel, effect, param);
                break;
            }

            case ProTrackerEffects.arpeggio: {
                if (param) {
                    // Fast Tracker counts the arpeggio from the end of the row
                    const position = this.speed - this.tick;
                    channel.setArpeggio(
                        param,
                        position > 16 ? 2 : position === 16 ? 0 : position % 3
                    );
                }
                break;
            }

            case FastTrackerEffects.globalVolumeSlide: {
                this.globalVolume = Math.min(
                    64,
                    Math.max(
                        0,
                        this.globalVolume + (param >> 4 || -(param & 0x0f))
                    )
                );
                break;
            }

            case FastTrackerEffects.keyOff: {
                if (this.tick === param) {
                    this.keyOff(channel);
                }
                break;
            }

            case FastTrackerEffects.panningSlide: {
                channel.slidePanning(param >> 4 || -(param & 0x0f));
                break;
            }

            case FastTrackerEffects.multiRetrigger: {
                channel.multiRetrigger(param);
                break;
            }

            case FastTrackerEffects.tremor: {
                channel.tremor(param);
                break;
            }
        }
    }

    protected playRowNote(channel: TrackerChannel) {
        const note = channel.rowNote;
        const instrumentNumber = channel.rowInstrument;
        if (instrumentNumber) {
            channel.instrument = this.instruments[instrumentNumber - 1];
        }
        const isPortamento =
            channel.rowEffect === ProTrackerEffects.tonePortamento ||
            channel.rowEffect === ProTrackerEffects.tonePortamentoVolumeSlide ||
            channel.rowVolume >> 4 === VolumeColumnCommands.tonePortamento;

        if (note === NOTE_OFF) {
            this.keyOff(channel);
        } else if (note !== NOTE_NONE) {
            if (isPortamento && channel.sample) {
                channel.targetPeriod = this.noteToPeriod(note, channel);
            } else {
                const sample = this.selectSample(channel, note);
                if (sample) {
                    // Every note resets the finetune, set finetune (E5x) overrides it for this note
                    const param = channel.rowParam;
                    channel.finetune =
                        channel.rowEffect === ProTrackerEffects.extended &&
                        param >> 4 === ProTrackerExtendedEffects.finetune
                            ? ((param & 0x0f) - 8) * 16
                            : sample.finetune;
                    this.triggerNote(channel, note);
                } else {
                    channel.stop = true;
                }
            }
        }

        // An instrument number resets the volume, panning and envelopes
        if (instrumentNumber && channel.sample && note !== NOTE_OFF) {
            channel.volume = channel.sample.volume;
            if (channel.sample.panning >= 0) {
                channel.panning = channel.sample.panning;
            }
            channel.keyOn = true;
            channel.volumeEnvelopeTick = 0;
            channel.panningEnvelopeTick = 0;
            channel.fadeoutVolume = 1;
            channel.autoVibratoPosition = 0;
            channel.autoVibratoTicks = 0;
        }

        const volume = channel.rowVolume;
        if (volume >= 0x10 && volume <= 0x50) {
            channel.volume = volume - 0x10;
        }
    }

    protected updateChannel(channel: TrackerChannel) {
        const instrument = channel.instrument;
        const sample = channel.sample;
        if (!instrument || !sample) {
            return;
        }
        const volumeEnvelope = instrument.volumeEnvelope;
        if (volumeEnvelope.enabled) {
            channel.envelopeVolume =
                getEnvelopeValue(volumeEnvelope, channel.volumeEnvelopeTick) /
                64;
            channel.volumeEnvelopeTick = advanceEnvelope(
                volumeEnvelope,
                channel.volumeEnvelopeTick,
                channel.keyOn
            );
            if (!channel.keyOn) {
                channel.fadeoutVolume = Math.max(
                    0,
                    channel.fadeoutVolume - instrument.fadeout / 65_536
                );
            }
        } else {
            channel.envelopeVolume = 1;
        }

        const panningEnvelope = instrument.panningEnvelope;
        if (panningEnvelope.enabled) {
            channel.envelopePanning = getEnvelopeValue(
                panningEnvelope,
                channel.panningEnvelopeTick
            );
            channel.panningEnvelopeTick = advanceEnvelope(
                panningEnvelope,
                channel.panningEnvelopeTick,
                channel.keyOn
            );
        } else {
            channel.envelopePanning = 32;
        }

        if (sample.vibratoDepth > 0 && sample.vibratoRate > 0) {
            let depth = sample.vibratoDepth;
            if (sample.vibratoSweep > 0 && channel.keyOn) {
                depth *= Math.min(
                    1,
                    ++channel.autoVibratoTicks / sample.vibratoSweep
                );
            }
            const position = (channel.autoVibratoPosition =
                (channel.autoVibratoPosition + sample.vibratoRate) & 0xff);
            let value;
            switch (sample.vibratoType) {
                default: {
                    value = -AUTO_VIBRATO_SINE[position];
                    break;
                }

                case 1: {
                    value = position & 0x80 ? 64 : -64;
                    break;
                }

                case 2: {
                    value = ((0x40 - (position >> 1)) & 0x7f) - 0x40;
                    break;
                }

                case 3: {
                    value = ((0x40 + (position >> 1)) & 0x7f) - 0x40;
                    break;
                }
            }
            channel.autoVibratoDelta = (value * depth) / 64;
        } else {
            channel.autoVibratoDelta = 0;
        }
    }

    protected playDelayedNote(channel: TrackerChannel) {
        this.playRowNote(channel);
    }

    /**
     * Reads the extensions that OpenMPT writes after the sample data, setting the artist.
     * Each part is optional, but they are always stored in this order.
     * @param binary The file data.
     * @param offset The offset after the sample data.
     * @param instrumentCount The number of instruments.
     * @returns The song message, empty if there is none.
     */
    private readOpenMPTExtensions(
        binary: IndexedByteArray,
        offset: number,
        instrumentCount: number
    ) {
        // Chunk IDs are printable ASCII. Anything else ends the extensions
        const readID = () => {
            const id = readBinaryString(binary, 4, offset);
            return /^[\u0020-\u007E]{4}$/.test(id) ? id : "";
        };

        let message = "";
        if (readID() === "text") {
            const length = readLittleEndian(binary, 4, offset + 4);
            // Lines end with a carriage return
            message = readBinaryString(binary, length, offset + 8)
                .replaceAll("\r", "\n")
                .trim();
            offset += 8 + length;
        }
        // The MIDI configuration, pattern names and channel names
        for (const id of ["MIDI", "PNAM", "CNAM"]) {
            if (readID() === id) {
                offset += 8 + readLittleEndian(binary, 4, offset + 4);
            }
        }

        // Instrument extensions, each field is stored once per instrument
        if (readID() === "XTPM") {
            offset += 4;
            for (let id = readID(); id && id !== "STPM"; id = readID()) {
                offset +=
                    6 +
                    readLittleEndian(binary, 2, offset + 4) * instrumentCount;
            }
        }

        // Song extensions
        if (readID() === "STPM") {
            offset += 4;
            for (let id = readID(); id; id = readID()) {
                const size = readLittleEndian(binary, 2, offset + 4);
                if (id === "AUTH") {
                    // Stored as UTF-8, non-ASCII characters are kept as bytes
                    this.artist = readBinaryString(
                        binary,
                        size,
                        offset + 6
                    ).trim();
                }
                offset += 6 + size;
            }
        }
        return message;
    }

    /**
     * Releases the note. Without a volume envelope, the note is cut.
     * @param channel The channel.
     */
    private keyOff(channel: TrackerChannel) {
        channel.keyOn = false;
        if (!channel.instrument?.volumeEnvelope.enabled) {
            channel.volume = 0;
        }
    }

    /**
     * Applies the Fast Tracker effect memory.
     * @param channel The channel.
     * @param effect The effect number.
     * @param param The effect parameter.
     * @returns The parameter to use.
     */
    private applyMemory(
        channel: TrackerChannel,
        effect: number,
        param: number
    ) {
        switch (effect) {
            default: {
                return param;
            }

            case ProTrackerEffects.portamentoUp: {
                return (channel.portamentoUpMemory =
                    param || channel.portamentoUpMemory);
            }

            case ProTrackerEffects.portamentoDown: {
                return (channel.portamentoDownMemory =
                    param || channel.portamentoDownMemory);
            }

            case ProTrackerEffects.tonePortamentoVolumeSlide:
            case ProTrackerEffects.vibratoVolumeSlide:
            case ProTrackerEffects.volumeSlide: {
                return (channel.volumeSlideMemory =
                    param || channel.volumeSlideMemory);
            }

            case ProTrackerEffects.extended: {
                const value = param & 0x0f;
                switch (param >> 4) {
                    default: {
                        return param;
                    }

                    case ProTrackerExtendedEffects.finePortamentoUp: {
                        return (
                            (param & 0xf0) |
                            (channel.finePortamentoUpMemory =
                                value || channel.finePortamentoUpMemory)
                        );
                    }

                    case ProTrackerExtendedEffects.finePortamentoDown: {
                        return (
                            (param & 0xf0) |
                            (channel.finePortamentoDownMemory =
                                value || channel.finePortamentoDownMemory)
                        );
                    }

                    case ProTrackerExtendedEffects.fineVolumeUp: {
                        return (
                            (param & 0xf0) |
                            (channel.fineVolumeUpMemory =
                                value || channel.fineVolumeUpMemory)
                        );
                    }

                    case ProTrackerExtendedEffects.fineVolumeDown: {
                        return (
                            (param & 0xf0) |
                            (channel.fineVolumeDownMemory =
                                value || channel.fineVolumeDownMemory)
                        );
                    }
                }
            }

            case FastTrackerEffects.globalVolumeSlide: {
                return (channel.globalVolumeSlideMemory =
                    param || channel.globalVolumeSlideMemory);
            }

            case FastTrackerEffects.panningSlide: {
                return (channel.panningSlideMemory =
                    param || channel.panningSlideMemory);
            }

            case FastTrackerEffects.multiRetrigger: {
                // Both nibbles are remembered separately
                const memory = channel.retriggerMemory;
                return (channel.retriggerMemory =
                    (param & 0xf0 || memory & 0xf0) |
                    (param & 0x0f || memory & 0x0f));
            }

            case FastTrackerEffects.tremor: {
                return (channel.tremorMemory = param || channel.tremorMemory);
            }

            case FastTrackerEffects.extraFinePortamento: {
                const value = param & 0x0f;
                if (param >> 4 === 1) {
                    return (
                        0x10 |
                        (channel.extraFinePortamentoUpMemory =
                            value || channel.extraFinePortamentoUpMemory)
                    );
                }
                if (param >> 4 === 2) {
                    return (
                        0x20 |
                        (channel.extraFinePortamentoDownMemory =
                            value || channel.extraFinePortamentoDownMemory)
                    );
                }
                return param;
            }
        }
    }
}
