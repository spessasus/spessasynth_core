import { IndexedByteArray } from "../../../utils/indexed_array.js";
import { writeDword, writeWord } from "../../../utils/byte_functions/little_endian.js";
import type { DLSDestinations, DLSSources } from "../../enums.ts";

export class Articulator {
    source: DLSSources;
    control: DLSSources;
    destination: DLSDestinations;
    // like SF2 amount
    scale: number;
    // like sf2 source transforms
    transform: number;

    constructor(
        source: DLSSources,
        control: DLSSources,
        destination: DLSDestinations,
        scale: number,
        transform: number
    ) {
        this.source = source;
        this.control = control;
        this.destination = destination;
        this.scale = scale;
        this.transform = transform;
    }

    writeArticulator(): IndexedByteArray {
        const out = new IndexedByteArray(12);
        writeWord(out, this.source);
        writeWord(out, this.control);
        writeWord(out, this.destination);
        writeWord(out, this.transform);
        writeDword(out, this.scale << 16);
        return out;
    }
}