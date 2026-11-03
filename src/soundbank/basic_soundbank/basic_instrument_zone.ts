import { BasicLinkedZone } from "./basic_linked_zone";
import type { BasicInstrument } from "./basic_instrument";
import type { BasicSample } from "./basic_sample";
import type { BasicSoundBank } from "./basic_soundbank";
import { GeneratorTypes } from "./generator_types";

/**
 * Represents a single instrument zone with an associated {@link BasicSample}.
 *
 * @group Sound Banks.Zones
 */
export class BasicInstrumentZone extends BasicLinkedZone<
    BasicInstrument,
    BasicSample
> {
    /**
     * For tracking on the individual zone level, since multiple presets can refer to the same instrument.
     * @internal
     */
    public useCount: number;

    protected readonly childGenerator = GeneratorTypes.sampleID;

    /**
     * Creates a new instrument zone.
     * @param instrument The parent instrument.
     * @param sample The sample to use in this zone.
     * @param link If the sample should be linked to the instrument.
     * @internal
     */
    public constructor(
        instrument: BasicInstrument,
        sample: BasicSample,
        link = true
    ) {
        super(instrument, sample, link);
        this.useCount = instrument.useCount;
    }

    // noinspection JSUnusedGlobalSymbols
    // noinspection JSUnusedGlobalSymbols
    /**
     * The instrument this zone belongs to.
     */
    public get parentInstrument() {
        return this.parent;
    }

    /**
     * The sample associated with this zone.
     */
    public get sample() {
        return this.child;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Sets a sample for this zone, unlinking the previous one from it.
     * @param sample The sample to set.
     */
    public set sample(sample: BasicSample) {
        this.setChild(sample);
    }

    protected getChildList(bank: BasicSoundBank) {
        return bank.samples;
    }
}
