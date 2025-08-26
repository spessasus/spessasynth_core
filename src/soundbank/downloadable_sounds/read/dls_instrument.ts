import { BasicInstrument } from "../../basic_soundbank/basic_instrument";
import { DLSZone } from "./dls_zone";
import type { BasicSample } from "../../basic_soundbank/basic_sample";

export class DLSInstrument extends BasicInstrument {
    public constructor() {
        super();
    }

    public createZone(sample: BasicSample): DLSZone {
        const z = new DLSZone(this, sample);
        this.zones.push(z);
        return z;
    }
}
