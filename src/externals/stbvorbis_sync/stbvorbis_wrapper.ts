import { stbvorbis } from "./stbvorbis_sync.min";

interface DecodedData {
    data: Float32Array[];
    error: string | null;
    sampleRate: number;
    eof: boolean;
}

interface stbvorbisType {
    decode: (buffer: Uint8Array | ArrayBuffer) => DecodedData;
    isInitialized: Promise<boolean>;
}

const stb: stbvorbisType = stbvorbis as stbvorbisType;

export { stb as stbvorbis };
