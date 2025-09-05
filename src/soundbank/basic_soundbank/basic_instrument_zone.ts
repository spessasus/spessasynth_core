import { BasicZone } from "./basic_zone";
import type { BasicInstrument } from "./basic_instrument";
import type { BasicSample } from "./basic_sample";
import { Generator } from "./generator";
import type { BasicSoundBank } from "./basic_soundbank";
import { generatorTypes } from "./generator_types";

export class BasicInstrumentZone extends BasicZone {
    /**
     * The instrument this zone belongs to.
     */
    public readonly parentInstrument: BasicInstrument;
    /**
     * For tracking on the individual zone level, since multiple presets can refer to the same instrument.
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
        this._sample = sample;
        sample.linkTo(this.parentInstrument);
        this.useCount = instrument.useCount;
    }

    /**
     * Zone's sample.
     */
    private _sample: BasicSample;

    /**
     * Zone's sample.
     */
    public get sample() {
        return this._sample;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Sets a sample for this zone.
     * @param sample the sample to set.
     */
    public set sample(sample: BasicSample) {
        if (this._sample) {
            this._sample.unlinkFrom(this.parentInstrument);
        }
        this._sample = sample;
        sample.linkTo(this.parentInstrument);
    }

    public getGenCount(): number {
        return super.getGenCount() + 1; // SampleID generator
    }

    public getWriteGenerators(bank: BasicSoundBank): Generator[] {
        const gens = super.getWriteGenerators(bank);
        const sampleID = bank.samples.indexOf(this.sample);
        if (sampleID < 0) {
            throw new Error(
                `${this.sample.name} does not exist in ${bank.soundBankInfo.name}! Cannot write sampleID generator.`
            );
        }
        gens.push(new Generator(generatorTypes.sampleID, sampleID, false));
        return gens;
    }
}
