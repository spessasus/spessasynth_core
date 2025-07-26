import { stbvorbis } from "./stbvorbis_sync.min";

type DecodedData = {
    data: Float32Array[];
    error: string | null;
    sampleRate: number;
    eof: boolean;
};

type stbvorbisType = {
    decode: (buffer: Uint8Array | ArrayBuffer) => DecodedData;
    isInitialized: Promise<boolean>;
};

const stb: stbvorbisType = stbvorbis as stbvorbisType;

export { stb as stbvorbis };
