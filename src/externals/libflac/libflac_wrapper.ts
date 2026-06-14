import * as Flac from "./dist/libflac";
import { Decoder } from "./lib/decoder";

const libflacDecoder: Decoder = new Decoder(Flac, {verify: true, isOgg: false});

export { libflacDecoder as libflacDecoder };
export { Flac as Flac };