/**
 * @license
 * Parts of this file are ported from the sound library of OpenMPT (https://openmpt.org/).
 * OpenMPT is distributed under the BSD license below.
 *
 * Copyright (c) 2004-2026, OpenMPT Project Developers and Contributors
 * Copyright (c) 1997-2003, Olivier Lapicque
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of the OpenMPT project nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

import type { IndexedByteArray } from "../../../utils/indexed_array";
import { readBinaryString } from "../../../utils/byte_functions/string";
import { readLittleEndian } from "../../../utils/byte_functions/little_endian";
import { MIDDLE_C_RATE } from "./tracker_module";
import { decodeADPCM } from "./fasttracker";
import {
    type ImpulseTrackerSample,
    type TrackerLoopType,
    TrackerLoopTypes
} from "./types";

/**
 * The block size of compressed samples, in sample points.
 */
const COMPRESSED_BLOCK_8_BIT = 0x80_00;
const COMPRESSED_BLOCK_16_BIT = 0x40_00;

/**
 * The conversion value of ModPlug ADPCM compressed samples.
 */
const CONVERSION_ADPCM = 0xff;

/**
 * Decodes one channel of an IT2.14 or IT2.15 compressed sample.
 * The data is split into blocks, each starting with its compressed size and resetting the decoder.
 * Every block is a little-endian bit stream of variable width values, with special values changing the width.
 * @param binary The file data.
 * @param offset The offset of the first block.
 * @param length The number of sample points.
 * @param is16Bit If the sample is 16-bit.
 * @param doubleDelta If the sample uses IT2.15 compression (the values are integrated twice).
 * @returns The decoded data and the offset after the last block.
 */
function decompressSample(
    binary: IndexedByteArray,
    offset: number,
    length: number,
    is16Bit: boolean,
    doubleDelta: boolean
) {
    const data = new Float32Array(length);
    const sampleBits = is16Bit ? 16 : 8;
    const baseWidth = sampleBits + 1;
    const blockSize = is16Bit
        ? COMPRESSED_BLOCK_16_BIT
        : COMPRESSED_BLOCK_8_BIT;
    const signShift = 32 - sampleBits;
    const scale = 1 / (1 << (sampleBits - 1));
    let position = offset;
    let written = 0;
    while (written < length && position + 2 <= binary.length) {
        const blockEnd = Math.min(
            binary.length,
            position + 2 + readLittleEndian(binary, 2, position)
        );
        let bitPosition = (position + 2) * 8;
        const bitEnd = blockEnd * 8;
        const blockLength = Math.min(blockSize, length - written);
        let width = baseWidth;
        let delta = 0;
        let doubleDeltaValue = 0;
        let decoded = 0;
        while (decoded < blockLength) {
            if (bitPosition + width > bitEnd) {
                break;
            }
            // Read the bits, least significant first
            let value = 0;
            for (let bit = 0; bit < width; bit++) {
                value |=
                    ((binary[bitPosition >> 3] >> (bitPosition & 7)) & 1) <<
                    bit;
                bitPosition++;
            }

            if (width < 7) {
                // Method 1: a single value changes the width, followed by the new width
                if (value === 1 << (width - 1)) {
                    const widthBits = is16Bit ? 4 : 3;
                    let newWidth = 1;
                    for (let bit = 0; bit < widthBits; bit++) {
                        newWidth +=
                            ((binary[bitPosition >> 3] >> (bitPosition & 7)) &
                                1) <<
                            bit;
                        bitPosition++;
                    }
                    width = newWidth < width ? newWidth : newWidth + 1;
                    continue;
                }
            } else if (width < baseWidth) {
                // Method 2: the values around the border change the width
                const border =
                    ((is16Bit ? 0xff_ff : 0xff) >> (baseWidth - width)) -
                    (is16Bit ? 8 : 4);
                if (value > border && value <= border + (is16Bit ? 16 : 8)) {
                    const newWidth = value - border;
                    width = newWidth < width ? newWidth : newWidth + 1;
                    continue;
                }
            } else if (width === baseWidth) {
                // Method 3: the highest bit marks a width change
                if (value & (1 << sampleBits)) {
                    width = (value + 1) & 0xff;
                    continue;
                }
            } else {
                // Invalid width, the block is corrupted
                break;
            }
            if (width === 0) {
                break;
            }

            // Sign extend the value
            const bits = Math.min(width, sampleBits);
            value = (value << (32 - bits)) >> (32 - bits);
            delta = ((delta + value) << signShift) >> signShift;
            doubleDeltaValue =
                ((doubleDeltaValue + delta) << signShift) >> signShift;
            data[written++] = (doubleDelta ? doubleDeltaValue : delta) * scale;
            decoded++;
        }
        position = blockEnd;
    }
    return { data, end: position };
}

/**
 * Reads one channel of uncompressed PCM sample data.
 * @param binary The file data.
 * @param offset The offset of the data.
 * @param length The number of sample points.
 * @param is16Bit If the sample is 16-bit.
 * @param signed If the data is signed.
 * @param bigEndian If 16-bit data is big-endian.
 * @param delta If the data is delta-encoded.
 */
function readPCM(
    binary: IndexedByteArray,
    offset: number,
    length: number,
    is16Bit: boolean,
    signed: boolean,
    bigEndian: boolean,
    delta: boolean
) {
    const bytes = is16Bit ? 2 : 1;
    const available = Math.max(
        0,
        Math.min(length, Math.floor((binary.length - offset) / bytes))
    );
    const data = new Float32Array(length);
    const bits = is16Bit ? 16 : 8;
    const shift = 32 - bits;
    let last = 0;
    for (let s = 0; s < available; s++) {
        let value: number;
        if (is16Bit) {
            const p = offset + s * 2;
            value = bigEndian
                ? (binary[p] << 8) | binary[p + 1]
                : binary[p] | (binary[p + 1] << 8);
        } else {
            value = binary[offset + s];
        }
        if (!signed) {
            value ^= 1 << (bits - 1);
        }
        value = (value << shift) >> shift;
        if (delta) {
            value = ((last + value) << shift) >> shift;
            last = value;
        }
        data[s] = value / (1 << (bits - 1));
    }
    return data;
}

/**
 * Reads a loop from a sample header, validating it against the sample length.
 * @param binary The file data.
 * @param offset The offset of the loop start (the end follows it).
 * @param enabled If the loop flag is set.
 * @param pingPong If the ping-pong flag is set.
 * @param length The sample length.
 */
function readLoop(
    binary: IndexedByteArray,
    offset: number,
    enabled: boolean,
    pingPong: boolean,
    length: number
) {
    const start = readLittleEndian(binary, 4, offset);
    const end = Math.min(length, readLittleEndian(binary, 4, offset + 4));
    const type: TrackerLoopType =
        !enabled || start >= end
            ? TrackerLoopTypes.none
            : pingPong
              ? TrackerLoopTypes.pingPong
              : TrackerLoopTypes.forward;
    return type === TrackerLoopTypes.none
        ? { type, start: 0, end: 0 }
        : { type, start, end };
}

/**
 * Reads an Impulse Tracker sample header and its data.
 * Supports 8 and 16-bit, signed and unsigned, big-endian, delta, IT2.14/IT2.15 compressed
 * and ModPlug ADPCM data, and stereo samples.
 * @param binary The file data.
 * @param offset The sample header offset.
 * @param trackerVersion The Cwt/v field of the module header.
 * @param muteMissingData If samples without the "sample data present" flag are empty.
 * Impulse Tracker sometimes keeps the length of deleted samples, but other trackers forget to set the flag.
 * @returns The sample and the offset after its data (or its header).
 */
export function readImpulseTrackerSample(
    binary: IndexedByteArray,
    offset: number,
    trackerVersion: number,
    muteMissingData: boolean
) {
    const name = readBinaryString(binary, 26, offset + 0x14);
    let c5Speed = readLittleEndian(binary, 4, offset + 0x3c) || MIDDLE_C_RATE;
    c5Speed = Math.max(256, c5Speed);
    const defaultPanning = binary[offset + 0x2f];
    const sample: ImpulseTrackerSample = {
        name,
        data: new Float32Array(0),
        loopType: TrackerLoopTypes.none,
        loopStart: 0,
        loopEnd: 0,
        volume: Math.min(64, binary[offset + 0x13]),
        globalVolume: Math.min(64, binary[offset + 0x11]),
        panning:
            defaultPanning & 0x80
                ? Math.min(256, (defaultPanning & 0x7f) * 4)
                : -1,
        finetune: c5Speed,
        relativeNote: 0,
        middleCRate: c5Speed,
        // 0 sine, 1 ramp down, 2 square, 3 random, 4 ramp up (OpenMPT)
        vibratoType: binary[offset + 0x4f] & 7,
        vibratoSweep: binary[offset + 0x4e],
        vibratoDepth: binary[offset + 0x4d] & 0x7f,
        vibratoRate: binary[offset + 0x4c]
    };
    const flags = binary[offset + 0x12];
    const headerEnd = offset + 0x50;
    if (headerEnd > binary.length) {
        return { sample, end: headerEnd };
    }
    if (muteMissingData && (flags & 1) === 0) {
        return { sample, end: headerEnd };
    }

    const conversion = binary[offset + 0x2e];
    const is16Bit = (flags & 2) !== 0;
    // Old Impulse Tracker versions did not clear the stereo flag when importing samples
    const isStereo = (flags & 4) !== 0 && trackerVersion >= 0x2_14;
    const isCompressed = (flags & 8) !== 0;
    const length = readLittleEndian(binary, 4, offset + 0x30);
    const dataOffset = readLittleEndian(binary, 4, offset + 0x48);
    if (length === 0 || dataOffset >= binary.length) {
        return { sample, end: headerEnd };
    }

    const channels = new Array<Float32Array>();
    let end: number;
    if (isCompressed) {
        // IT2.15 compression integrates twice
        const doubleDelta = (conversion & 4) !== 0;
        let position = dataOffset;
        for (let c = 0; c < (isStereo ? 2 : 1); c++) {
            // A value takes at least one bit, don't trust a corrupt header length
            const decoded = decompressSample(
                binary,
                position,
                Math.min(length, (binary.length - position) * 8),
                is16Bit,
                doubleDelta
            );
            channels.push(decoded.data);
            position = decoded.end;
        }
        end = position;
    } else if (!is16Bit && conversion === CONVERSION_ADPCM) {
        channels.push(
            decodeADPCM(
                binary,
                dataOffset,
                Math.max(
                    0,
                    Math.min(length, (binary.length - dataOffset - 16) * 2)
                )
            )
        );
        end = dataOffset + 16 + Math.ceil(length / 2);
    } else {
        // Stereo samples store the left channel first, then the right
        const bytes = (is16Bit ? 2 : 1) * length;
        // Truncated data is padded with silence, but don't trust a corrupt header length
        const readLength = Math.min(
            length,
            Math.floor((binary.length - dataOffset) / (is16Bit ? 2 : 1))
        );
        for (let c = 0; c < (isStereo ? 2 : 1); c++) {
            channels.push(
                readPCM(
                    binary,
                    dataOffset + c * bytes,
                    readLength,
                    is16Bit,
                    (conversion & 1) !== 0,
                    (conversion & 2) !== 0,
                    (conversion & 4) !== 0
                )
            );
        }
        end = dataOffset + bytes * channels.length;
    }
    sample.data = channels[0];
    if (channels.length > 1) {
        sample.rightData = channels[1];
    }

    const sampleLength = sample.data.length;
    const loop = readLoop(
        binary,
        offset + 0x34,
        (flags & 0x10) !== 0,
        (flags & 0x40) !== 0,
        sampleLength
    );
    sample.loopType = loop.type;
    sample.loopStart = loop.start;
    sample.loopEnd = loop.end;
    const sustain = readLoop(
        binary,
        offset + 0x40,
        (flags & 0x20) !== 0,
        (flags & 0x80) !== 0,
        sampleLength
    );
    if (sustain.type !== TrackerLoopTypes.none) {
        sample.sustainLoopType = sustain.type;
        sample.sustainLoopStart = sustain.start;
        sample.sustainLoopEnd = sustain.end;
    }
    return { sample, end: Math.max(headerEnd, end) };
}
