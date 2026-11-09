import { SpessaLog } from "../../utils/loggin";
import { IndexedByteArray } from "../../utils/indexed_array";
import { ConsoleColors } from "../../utils/other";
import { BasicMIDI } from "../basic_midi";
import { readBinaryStringIndexed } from "../../utils/byte_functions/string";
import { RIFFChunk } from "../../utils/riff_chunk";
import { parseSMFInternal } from "./midi";
import type { RMIDInfoFourCC } from "../types";
import { readLittleEndian } from "../../utils/byte_functions/little_endian";

/**
 * Loads a RIFF MIDI File (RMIDI) from given binary data
 * @param outputMIDI The BasicMIDI instance to populate with the parsed MIDI data.
 * @param binaryData The IndexedByteArray containing the file data.
 * @param fileName The optional name of the file, will be used if the MIDI file does not have a name.
 */
export function parseRMIDIInternal(
    outputMIDI: BasicMIDI,
    binaryData: IndexedByteArray,
    fileName: string
) {
    // https://github.com/spessasus/sf2-rmidi-specification#readme
    // Skip size (we already verified "RIFF" if we're here)
    binaryData.currentIndex += 8;
    const rmid = readBinaryStringIndexed(binaryData, 4);
    if (rmid !== "RMID") {
        SpessaLog.groupEnd();
        throw new SyntaxError(
            `Invalid RMIDI Header! Expected "RMID", got "${rmid}"`
        );
    }
    const riff = RIFFChunk.read(binaryData);
    if (riff.header !== "data") {
        SpessaLog.groupEnd();
        throw new SyntaxError(
            `Invalid RMIDI Chunk header! Expected "data", got "${riff.header}"`
        );
    }
    // OutputMIDI is a rmid, load the midi into an array for parsing
    const smfFileBinary = riff.data;

    let isSF2RMIDI = false;
    let dbnk: number | undefined;
    // Load the remaining chunks (the embedded sound bank and the INFO list)
    while (binaryData.currentIndex < binaryData.length) {
        const startIndex = binaryData.currentIndex;
        const currentChunk = RIFFChunk.read(binaryData);
        if (currentChunk.header === "RIFF") {
            const type = readBinaryStringIndexed(
                currentChunk.data,
                4
            ).toLowerCase();
            if (type === "sfbk" || type === "sfpk" || type === "dls ") {
                SpessaLog.info(
                    "%cFound embedded soundbank!",
                    ConsoleColors.recognized
                );
                outputMIDI.embeddedSoundBank = binaryData.slice(
                    startIndex,
                    startIndex + currentChunk.headerSize + currentChunk.size
                ).buffer;
                if (type === "dls ") {
                    // Assume bank offset of 0 by default. If we find any bank selects, then the offset is 1.
                    outputMIDI.isDLSRMIDI = true;
                } else {
                    isSF2RMIDI = true;
                }
            } else {
                SpessaLog.warn(`Unknown RIFF chunk: "${type}"`);
                // The spec says to keep chunks we don't know
                outputMIDI.rmidiExtraChunks.file.push(
                    RIFFChunk.write(currentChunk.header, currentChunk.data)
                );
            }
        } else if (currentChunk.header === "LIST") {
            const type = readBinaryStringIndexed(currentChunk.data, 4);
            if (type === "INFO") {
                SpessaLog.info(
                    "%cFound RMIDI INFO chunk!",
                    ConsoleColors.recognized
                );
                while (currentChunk.data.currentIndex < currentChunk.size) {
                    const infoChunk = RIFFChunk.read(currentChunk.data);
                    const headerTyped = infoChunk.header as RMIDInfoFourCC;
                    const infoData = infoChunk.data;
                    if (infoChunk.size === 0) {
                        // Empty chunks are illegal, drop them
                        SpessaLog.warn(
                            `Discarding empty RMIDI Info: ${headerTyped}`
                        );
                        continue;
                    }
                    switch (headerTyped) {
                        default: {
                            SpessaLog.warn(
                                `Unknown RMIDI Info: ${headerTyped as string}`
                            );
                            outputMIDI.rmidiExtraChunks.info.push(
                                RIFFChunk.write(infoChunk.header, infoData)
                            );
                            break;
                        }

                        case "INAM": {
                            outputMIDI.rmidiInfo.name = infoData;
                            break;
                        }

                        case "IALB": {
                            outputMIDI.rmidiInfo.album = infoData;
                            break;
                        }

                        case "IPRD": {
                            outputMIDI.rmidiInfo.album ??= infoData;
                            break;
                        }

                        case "ICRT":
                        case "ICRD": {
                            // Older RMIDIs written by spessasynth erroneously used ICRT instead of ICRD.
                            outputMIDI.rmidiInfo.creationDate = infoData;
                            break;
                        }

                        case "IART": {
                            outputMIDI.rmidiInfo.artist = infoData;
                            break;
                        }

                        case "IGNR": {
                            outputMIDI.rmidiInfo.genre = infoData;
                            break;
                        }

                        case "IPIC": {
                            outputMIDI.rmidiInfo.picture = infoData;
                            break;
                        }

                        case "ICOP": {
                            outputMIDI.rmidiInfo.copyright = infoData;
                            break;
                        }

                        case "ICMT": {
                            outputMIDI.rmidiInfo.comment = infoData;
                            break;
                        }

                        case "IENG": {
                            outputMIDI.rmidiInfo.engineer = infoData;
                            break;
                        }

                        case "ISFT": {
                            outputMIDI.rmidiInfo.software = infoData;
                            break;
                        }

                        case "ISBJ": {
                            outputMIDI.rmidiInfo.subject = infoData;
                            break;
                        }

                        case "IENC": {
                            outputMIDI.rmidiInfo.infoEncoding = infoData;
                            break;
                        }

                        case "MENC": {
                            outputMIDI.rmidiInfo.midiEncoding = infoData;
                            break;
                        }

                        case "DBNK": {
                            // Invalid offsets are treated as missing.
                            const offset =
                                infoData.length === 2
                                    ? readLittleEndian(infoData, 2)
                                    : undefined;
                            if (offset === undefined || offset > 127) {
                                SpessaLog.warn(
                                    `Invalid DBNK chunk (${offset ?? `${infoData.length} bytes`}), ignoring it.`
                                );
                                break;
                            }
                            dbnk = offset;
                            break;
                        }
                    }
                }
            } else {
                outputMIDI.rmidiExtraChunks.file.push(
                    RIFFChunk.write(currentChunk.header, currentChunk.data)
                );
            }
        } else {
            outputMIDI.rmidiExtraChunks.file.push(
                RIFFChunk.write(currentChunk.header, currentChunk.data)
            );
        }
    }

    if (outputMIDI.embeddedSoundBank === undefined) {
        // If no embedded bank, assume 0
        outputMIDI.bankOffset = 0;
    } else if (dbnk !== undefined) {
        outputMIDI.bankOffset = dbnk;
    } else if (isSF2RMIDI) {
        // Defaults to 1 according to the spec
        outputMIDI.bankOffset = 1;
    } else if (outputMIDI.isDLSRMIDI) {
        // Assume bank offset of 0 by default. If we find any bank selects (in the SMF parser),
        // Then the offset is 1.
        outputMIDI.bankOffset = 0;
    }

    // Send the extracted SMF to the parser
    parseSMFInternal(outputMIDI, smfFileBinary, fileName);

    // The DBNK chunk overrides the bank offset detected by the SMF parser
    if (outputMIDI.embeddedSoundBank !== undefined && dbnk !== undefined) {
        outputMIDI.bankOffset = dbnk;
    }
}
