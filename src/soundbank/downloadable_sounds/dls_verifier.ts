import { type FourCC, RIFFChunk } from "../../utils/riff_chunk";
import type { DLSChunkFourCC } from "../types";
import { SpessaLog } from "../../utils/loggin";
import { readBinaryStringIndexed } from "../../utils/byte_functions/string";

export abstract class DLSVerifier {
    /**
     * @param chunk The chunk to verify.
     * @param expected The accepted chunk headers.
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
     * @param text The FourCC to verify.
     * @param expected The accepted FourCCs.
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
     * @param error The error description.
     * @throws error always
     */
    protected static parsingError(error: string): never {
        SpessaLog.groupEnd();
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
            chunks.push(RIFFChunk.read(chunk.data));
        }
        return chunks;
    }
}
