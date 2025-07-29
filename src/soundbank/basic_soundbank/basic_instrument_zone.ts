import { BasicZone } from "./basic_zone";
import type { BasicInstrument } from "./basic_instrument";
import type { BasicSample } from "./basic_sample";

export class BasicInstrumentZone extends BasicZone {
    /**
     * The parent instrument.
     */
    public readonly parentInstrument: BasicInstrument;

    /**
     * Zone's sample.
     */
    public sample: BasicSample;
    /**
     * For tracking on the individual zone level, since multiple presets can refer to the same instrument.
     * @type {number}
     */
    public useCount: number;

    /**
     * Creates a new instrument zone.
     * @param instrument The parent instrument.
     * @param sample The sample to use in this zone.
     */
    public constructor(instrument: BasicInstrument, sample: BasicSample) {
        super();
        this.parentInstrument = instrument;
        this.sample = sample;
        sample.linkTo(this.parentInstrument);
        this.useCount = instrument.useCount;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Sets a sample for this zone
     * @param sample the sample to set
     */
    public setSample(sample: BasicSample) {
        if (this.sample) {
            this.sample.unlinkFrom(this.parentInstrument);
        }
        this.sample = sample;
        sample.linkTo(this.parentInstrument);
    }
}
