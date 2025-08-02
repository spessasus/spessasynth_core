import { IndexedByteArray } from "../../../utils/indexed_array";
import {
    writeDword,
    writeWord
} from "../../../utils/byte_functions/little_endian";
import type { DLSDestination, DLSSource } from "../../enums";

export class Articulator {
    public readonly source: DLSSource;
    public readonly control: DLSSource;
    public readonly destination: DLSDestination;
    // Like SF2 amount
    public readonly scale: number;
    // Like sf2 source transforms
    public readonly transform: number;

    public constructor(
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

    public writeArticulator(): IndexedByteArray {
        const out = new IndexedByteArray(12);
        writeWord(out, this.source);
        writeWord(out, this.control);
        writeWord(out, this.destination);
        writeWord(out, this.transform);
        writeDword(out, this.scale << 16);
        return out;
    }
}
