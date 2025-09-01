import {
    type FourCC,
    readRIFFChunk,
    type RIFFChunk
} from "../../utils/riff_chunk";
import type { DLSChunkFourCC } from "../types";
import { SpessaSynthGroupEnd } from "../../utils/loggin";
import { readBinaryStringIndexed } from "../../utils/byte_functions/string";

export abstract class DLSVerifier {
    /**
     * @param chunk
     * @param expected
     * @throws error if the check doesn't pass
     */
    protected static verifyHeader(chunk: RIFFChunk, ...expected: FourCC[]) {
        for (const expect of expected) {
            if (chunk.header.toLowerCase() === expect.toLowerCase()) {
                return;
            }
        }
        this.parsingError(
            `Invalid DLS chunk header! Expected "${expected.join(", or ")}" got "${chunk.header.toLowerCase()}"`
        );
    }

    /**
     * @param text {string}
     * @param expected {string}
     * @throws error if the check doesn't pass
     */
    protected static verifyText(text: string, ...expected: DLSChunkFourCC[]) {
        for (const expect of expected) {
            if (text.toLowerCase() === expect.toLowerCase()) {
                return;
            }
        }
        this.parsingError(
            `FourCC error: Expected "${expected.join(", or ")}" got "${text.toLowerCase()}"`
        );
    }

    /**
     * @throws error if the check doesn't pass
     */
    protected static parsingError(error: string) {
        SpessaSynthGroupEnd();
        throw new Error(`DLS parse error: ${error} The file may be corrupted.`);
    }

    protected static verifyAndReadList(
        chunk: RIFFChunk,
        ...type: DLSChunkFourCC[]
    ) {
        this.verifyHeader(chunk, "LIST");
        chunk.data.currentIndex = 0;
        this.verifyText(readBinaryStringIndexed(chunk.data, 4), ...type);
        const chunks: RIFFChunk[] = [];
        while (chunk.data.length > chunk.data.currentIndex) {
            chunks.push(readRIFFChunk(chunk.data));
        }
        return chunks;
    }
}
