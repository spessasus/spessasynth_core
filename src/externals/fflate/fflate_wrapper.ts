// @ts-expect-error minified lib that I can't move
import { inflateSync } from "./fflate.min";

type inflateFunc = (input: Uint8Array) => Uint8Array<ArrayBuffer>;

// @ts-expect-error minified lib that I can't move
const inf: inflateFunc = inflateSync as inflateFunc;

export { inf as inflateSync };
