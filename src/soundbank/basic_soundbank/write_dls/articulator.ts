import { IndexedByteArray } from "../../../utils/indexed_array";
import {
    writeDword,
    writeWord
} from "../../../utils/byte_functions/little_endian";
import type { DLSDestination, DLSSource } from "../../enums";

export class Articulator {
    source: DLSSource;
    control: DLSSource;
    destination: DLSDestination;
    // like SF2 amount
    scale: number;
    // like sf2 source transforms
    transform: number;

    constructor(
        source: DLSSource,
        control: DLSSource,
        destination: DLSDestination,
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
