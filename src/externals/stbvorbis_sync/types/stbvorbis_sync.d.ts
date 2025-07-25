declare module "stbvorbis_sync" {
    type DecodedData = {
        data: Float32Array[];
        error: string | null;
        sampleRate: number;
        eof: boolean;
    };

    export const stbvorbis: {
        decode(buffer: Uint8Array): DecodedData;
        isInitialized: Promise<boolean>;
    };
}
