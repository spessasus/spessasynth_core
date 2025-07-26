import {
    getStringBytes,
    readBytesAsString
} from "../utils/byte_functions/string";
import {
    SpessaSynthGroup,
    SpessaSynthGroupEnd,
    SpessaSynthInfo,
    SpessaSynthWarn
} from "../utils/loggin";
import { consoleColors } from "../utils/other";
import { readBytesAsUintBigEndian } from "../utils/byte_functions/big_endian";
import { readVariableLengthQuantity } from "../utils/byte_functions/variable_length_quantity";
import { RMIDINFOChunks } from "./enums";
import { inflateSync } from "../externals/fflate/fflate_wrapper";
import { IndexedByteArray } from "../utils/indexed_array";
import type { BasicMIDI } from "./basic_midi";

const metadataTypes = {
    XMFFileType: 0,
    nodeName: 1,
    nodeIDNumber: 2,
    resourceFormat: 3,
    filenameOnDisk: 4,
    filenameExtensionOnDisk: 5,
    macOSFileTypeAndCreator: 6,
    mimeType: 7,
    title: 8,
    copyrightNotice: 9,
    comment: 10,
    autoStart: 11, // Node Name of the FileNode containing the SMF image to autostart when the XMF file loads
    preload: 12, // Used to preload specific SMF and DLS file images.
    contentDescription: 13, // RP-42a (https://amei.or.jp/midistandardcommittee/Recommended_Practice/e/rp42.pdf)
    ID3Metadata: 14 // RP-47 (https://amei.or.jp/midistandardcommittee/Recommended_Practice/e/rp47.pdf)
} as const;

type metadataTypes = (typeof metadataTypes)[keyof typeof metadataTypes];

const referenceTypeIds = {
    inLineResource: 1,
    inFileResource: 2,
    inFileNode: 3,
    externalFile: 4,
    externalXMF: 5,
    XMFFileURIandNodeID: 6
} as const;

type referenceTypeIds =
    (typeof referenceTypeIds)[keyof typeof referenceTypeIds];

const resourceFormatIDs = {
    StandardMIDIFile: 0,
    StandardMIDIFileType1: 1,
    DLS1: 2,
    DLS2: 3,
    DLS22: 4,
    mobileDLS: 5,
    unknown: -1,
    folder: -2
} as const;

type resourceFormatStrings = keyof typeof resourceFormatIDs;
type resourceFormatIDs =
    (typeof resourceFormatIDs)[keyof typeof resourceFormatIDs];

const formatTypeIDs = {
    standard: 0,
    MMA: 1,
    registered: 2,
    nonRegistered: 3
} as const;

const unpackerIDs = {
    none: 0,
    MMAUnpacker: 1,
    registered: 2,
    nonRegistered: 3
} as const;

type unpackerIDs = (typeof unpackerIDs)[keyof typeof unpackerIDs];

type InternalUnpackerType = Partial<{
    id: unpackerIDs;
    standardID: number;
    manufacturerID: number;
    manufacturerInternalID: number;
    decodedSize: number;
}>;

class XMFNode {
    length: number;
    /**
     * 0 means it's a file node
     */
    itemCount: number;
    metadataLength: number;

    metadata: Record<string, string | number[] | IndexedByteArray> = {};

    nodeData: IndexedByteArray;

    innerNodes: XMFNode[] = [];

    packedContent = false;

    nodeUnpackers: InternalUnpackerType[] = [];

    resourceFormat: resourceFormatStrings = "unknown";

    referenceTypeID: referenceTypeIds;

    constructor(binaryData: IndexedByteArray) {
        const nodeStartIndex = binaryData.currentIndex;
        this.length = readVariableLengthQuantity(binaryData);
        this.itemCount = readVariableLengthQuantity(binaryData);
        // header length
        const headerLength = readVariableLengthQuantity(binaryData);
        const readBytes = binaryData.currentIndex - nodeStartIndex;

        const remainingHeader = headerLength - readBytes;
        const headerData = binaryData.slice(
            binaryData.currentIndex,
            binaryData.currentIndex + remainingHeader
        );
        binaryData.currentIndex += remainingHeader;

        this.metadataLength = readVariableLengthQuantity(headerData);

        const metadataChunk = headerData.slice(
            headerData.currentIndex,
            headerData.currentIndex + this.metadataLength
        );
        headerData.currentIndex += this.metadataLength;

        let fieldSpecifier: metadataTypes | string;
        let key: string;
        while (metadataChunk.currentIndex < metadataChunk.length) {
            const firstSpecifierByte =
                metadataChunk[metadataChunk.currentIndex];
            if (firstSpecifierByte === 0) {
                metadataChunk.currentIndex++;
                fieldSpecifier = readVariableLengthQuantity(
                    metadataChunk
                ) as metadataTypes;
                if (
                    Object.values(metadataTypes).indexOf(fieldSpecifier) === -1
                ) {
                    SpessaSynthWarn(
                        `Unknown field specifier: ${fieldSpecifier}`
                    );
                    key = `unknown_${fieldSpecifier}`;
                } else {
                    key =
                        Object.keys(metadataTypes).find(
                            (k) =>
                                metadataTypes[
                                    k as keyof typeof metadataTypes
                                ] === fieldSpecifier
                        ) || "";
                }
            } else {
                // this is the length of string
                const stringLength = readVariableLengthQuantity(metadataChunk);
                fieldSpecifier = readBytesAsString(metadataChunk, stringLength);
                key = fieldSpecifier;
            }

            const numberOfVersions = readVariableLengthQuantity(metadataChunk);
            if (numberOfVersions === 0) {
                const dataLength = readVariableLengthQuantity(metadataChunk);
                const contentsChunk = metadataChunk.slice(
                    metadataChunk.currentIndex,
                    metadataChunk.currentIndex + dataLength
                );
                metadataChunk.currentIndex += dataLength;
                const formatID = readVariableLengthQuantity(contentsChunk);
                // text only
                if (formatID < 4) {
                    this.metadata[key] = readBytesAsString(
                        contentsChunk,
                        dataLength - 1
                    );
                } else {
                    this.metadata[key] = contentsChunk.slice(
                        contentsChunk.currentIndex
                    );
                }
            } else {
                // throw new Error ("International content is not supported.");
                // Skip the number of versions
                SpessaSynthWarn(`International content: ${numberOfVersions}`);
                // Length in bytes
                // Skip the whole thing!
                metadataChunk.currentIndex +=
                    readVariableLengthQuantity(metadataChunk);
            }
        }

        const unpackersStart = headerData.currentIndex;
        const unpackersLength = readVariableLengthQuantity(headerData);
        const unpackersData = headerData.slice(
            headerData.currentIndex,
            unpackersStart + unpackersLength
        );
        headerData.currentIndex = unpackersStart + unpackersLength;
        if (unpackersLength > 0) {
            this.packedContent = true;
            while (unpackersData.currentIndex < unpackersLength) {
                const unpacker: InternalUnpackerType = {};
                unpacker.id = readVariableLengthQuantity(
                    unpackersData
                ) as unpackerIDs;
                switch (unpacker.id) {
                    case unpackerIDs.nonRegistered:
                    case unpackerIDs.registered:
                        SpessaSynthGroupEnd();
                        throw new Error(
                            `Unsupported unpacker ID: ${unpacker.id}`
                        );

                    default:
                        SpessaSynthGroupEnd();
                        throw new Error(`Unknown unpacker ID: ${unpacker.id}`);

                    case unpackerIDs.none:
                        unpacker.standardID =
                            readVariableLengthQuantity(unpackersData);
                        break;

                    case unpackerIDs.MMAUnpacker:
                        {
                            let manufacturerID =
                                unpackersData[unpackersData.currentIndex++];
                            // one or three byte form, depending on if the first byte is zero
                            if (manufacturerID === 0) {
                                manufacturerID <<= 8;
                                manufacturerID |=
                                    unpackersData[unpackersData.currentIndex++];
                                manufacturerID <<= 8;
                                manufacturerID |=
                                    unpackersData[unpackersData.currentIndex++];
                            }
                            const manufacturerInternalID =
                                readVariableLengthQuantity(unpackersData);
                            unpacker.manufacturerID = manufacturerID;
                            unpacker.manufacturerInternalID =
                                manufacturerInternalID;
                        }
                        break;
                }
                unpacker.decodedSize =
                    readVariableLengthQuantity(unpackersData);
                this.nodeUnpackers.push(unpacker);
            }
        }
        binaryData.currentIndex = nodeStartIndex + headerLength;
        this.referenceTypeID = readVariableLengthQuantity(
            binaryData
        ) as referenceTypeIds;
        this.nodeData = binaryData.slice(
            binaryData.currentIndex,
            nodeStartIndex + this.length
        );
        binaryData.currentIndex = nodeStartIndex + this.length;
        switch (this.referenceTypeID) {
            case referenceTypeIds.inLineResource:
                break;

            case referenceTypeIds.externalXMF:
            case referenceTypeIds.inFileNode:
            case referenceTypeIds.XMFFileURIandNodeID:
            case referenceTypeIds.externalFile:
            case referenceTypeIds.inFileResource:
                SpessaSynthGroupEnd();
                throw new Error(
                    `Unsupported reference type: ${this.referenceTypeID}`
                );

            default:
                SpessaSynthGroupEnd();
                throw new Error(
                    `Unknown reference type: ${this.referenceTypeID}`
                );
        }

        // read the data
        if (this.isFile) {
            if (this.packedContent) {
                const compressed = this.nodeData.slice(2, this.nodeData.length);
                SpessaSynthInfo(
                    `%cPacked content. Attempting to deflate. Target size: %c${this.nodeUnpackers[0].decodedSize}`,
                    consoleColors.warn,
                    consoleColors.value
                );
                try {
                    this.nodeData = new IndexedByteArray(
                        inflateSync(compressed).buffer as ArrayBuffer
                    );
                } catch (e: unknown) {
                    SpessaSynthGroupEnd();
                    if (e instanceof Error) {
                        throw new Error(
                            `Error unpacking XMF file contents: ${e.message}.`
                        );
                    }
                }
            }
            /**
             * interpret the content
             */
            const resourceFormat: number[] = this.metadata[
                "resourceFormat"
            ] as number[];
            if (resourceFormat === undefined) {
                SpessaSynthWarn("No resource format for this file node!");
            } else {
                const formatTypeID = resourceFormat[0];
                if (formatTypeID !== formatTypeIDs.standard) {
                    SpessaSynthWarn(
                        `Non-standard formatTypeID: ${resourceFormat}`
                    );
                    this.resourceFormat =
                        resourceFormat.toString() as resourceFormatStrings;
                }
                const resourceFormatID = resourceFormat[1] as resourceFormatIDs;
                if (
                    Object.values(resourceFormatIDs).indexOf(
                        resourceFormatID
                    ) === -1
                ) {
                    SpessaSynthWarn(
                        `Unrecognized resource format: ${resourceFormatID}`
                    );
                } else {
                    this.resourceFormat = Object.keys(resourceFormatIDs).find(
                        (k) =>
                            resourceFormatIDs[
                                k as keyof typeof resourceFormatIDs
                            ] === resourceFormatID
                    ) as resourceFormatStrings;
                }
            }
        } else {
            // folder node
            this.resourceFormat = "folder";
            while (this.nodeData.currentIndex < this.nodeData.length) {
                const nodeStartIndex = this.nodeData.currentIndex;
                const nodeLength = readVariableLengthQuantity(this.nodeData);
                const nodeData = this.nodeData.slice(
                    nodeStartIndex,
                    nodeStartIndex + nodeLength
                );
                this.nodeData.currentIndex = nodeStartIndex + nodeLength;
                this.innerNodes.push(new XMFNode(nodeData));
            }
        }
    }

    get isFile() {
        return this.itemCount === 0;
    }
}

/**
 * Parses an XMF file
 * @param midi {BasicMIDI}
 * @param binaryData {IndexedByteArray}
 * @returns {IndexedByteArray} the file byte array
 */
export function loadXMF(
    midi: BasicMIDI,
    binaryData: IndexedByteArray
): IndexedByteArray {
    midi.bankOffset = 0;
    // https://amei.or.jp/midistandardcommittee/Recommended_Practice/e/xmf-v1a.pdf
    // https://wiki.multimedia.cx/index.php?title=Extensible_Music_Format_(XMF)
    const sanityCheck = readBytesAsString(binaryData, 4);
    if (sanityCheck !== "XMF_") {
        SpessaSynthGroupEnd();
        throw new SyntaxError(
            `Invalid XMF Header! Expected "_XMF", got "${sanityCheck}"`
        );
    }

    SpessaSynthGroup("%cParsing XMF file...", consoleColors.info);
    const version = readBytesAsString(binaryData, 4);
    SpessaSynthInfo(
        `%cXMF version: %c${version}`,
        consoleColors.info,
        consoleColors.recognized
    );
    // https://amei.or.jp/midistandardcommittee/Recommended_Practice/e/rp43.pdf
    // version 2.00 has additional bytes
    if (version === "2.00") {
        const fileTypeId = readBytesAsUintBigEndian(binaryData, 4);
        const fileTypeRevisionId = readBytesAsUintBigEndian(binaryData, 4);
        SpessaSynthInfo(
            `%cFile Type ID: %c${fileTypeId}%c, File Type Revision ID: %c${fileTypeRevisionId}`,
            consoleColors.info,
            consoleColors.recognized,
            consoleColors.info,
            consoleColors.recognized
        );
    }

    // file length
    readVariableLengthQuantity(binaryData);

    const metadataTableLength = readVariableLengthQuantity(binaryData);
    // skip metadata
    binaryData.currentIndex += metadataTableLength;

    // skip to tree root
    binaryData.currentIndex = readVariableLengthQuantity(binaryData);
    const rootNode = new XMFNode(binaryData);
    let midiArray: IndexedByteArray | undefined = undefined;
    /**
     * find the stuff we care about
     */
    const searchNode = (node: XMFNode) => {
        const checkMeta = (xmf: string, rmid: RMIDINFOChunks) => {
            if (
                node.metadata[xmf] !== undefined &&
                typeof node.metadata[xmf] === "string"
            ) {
                midi.RMIDInfo[rmid] = getStringBytes(node.metadata[xmf]);
            }
        };
        // meta
        checkMeta("nodeName", RMIDINFOChunks.name);
        checkMeta("title", RMIDINFOChunks.name);
        checkMeta("copyrightNotice", RMIDINFOChunks.copyright);
        checkMeta("comment", RMIDINFOChunks.comment);
        if (node.isFile) {
            switch (node.resourceFormat) {
                default:
                    return;
                case "DLS1":
                case "DLS2":
                case "DLS22":
                case "mobileDLS":
                    SpessaSynthInfo(
                        "%cFound embedded DLS!",
                        consoleColors.recognized
                    );
                    midi.embeddedSoundFont = node.nodeData.buffer;
                    break;

                case "StandardMIDIFile":
                case "StandardMIDIFileType1":
                    SpessaSynthInfo(
                        "%cFound embedded MIDI!",
                        consoleColors.recognized
                    );
                    midiArray = node.nodeData;
                    break;
            }
        } else {
            for (const n of node.innerNodes) {
                searchNode(n);
            }
        }
    };
    searchNode(rootNode);
    SpessaSynthGroupEnd();
    if (!midiArray) {
        throw new Error("No MIDI data in the XMF file!");
    }
    return midiArray;
}
