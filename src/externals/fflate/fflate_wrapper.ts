// @ts-expect-error minified lib that I can't move
import { inflateSync as inf } from "./fflate.min";

// @ts-expect-error minified lib that I can't move
const inflateSync = inf as (input: Uint8Array) => Uint8Array<ArrayBuffer>;

export { inflateSync };
