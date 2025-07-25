import { BasicZone } from "./basic_zone.js";
import type { BasicInstrument } from "./basic_instrument.ts";
import type { BasicSample } from "./basic_sample.ts";

export class BasicInstrumentZone extends BasicZone {
    /**
     * The parent instrument.
     */
    parentInstrument: BasicInstrument;

    /**
     * Zone's sample.
     */
    sample: BasicSample | undefined;
    /**
     * For tracking on the individual zone level, since multiple presets can refer to the same instrument.
     * @type {number}
     */
    useCount: number;

    /**
     * @param instrument
     */
    constructor(instrument: BasicInstrument) {
        super();
        this.parentInstrument = instrument;
        this.useCount = instrument.useCount;
    }

    /**
     * Sets a sample for this zone
     * @param sample the sample to set
     */
    setSample(sample: BasicSample) {
        this.sample = sample;
        sample.linkTo(this.parentInstrument);
    }
}
