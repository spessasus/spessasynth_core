import { BasicInstrument } from "../basic_soundbank/basic_instrument";
import { DLSZone } from "./dls_zone";
import type { BasicSample } from "../basic_soundbank/basic_sample";

export class DLSInstrument extends BasicInstrument {
    constructor() {
        super();
    }

    createZone(sample: BasicSample): DLSZone {
        const z = new DLSZone(this, sample);
        this.instrumentZones.push(z);
        return z;
    }
}
