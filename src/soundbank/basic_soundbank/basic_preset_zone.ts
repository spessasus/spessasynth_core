import { BasicZone } from "./basic_zone";
import type { BasicPreset } from "./basic_preset";
import type { BasicInstrument } from "./basic_instrument";
import type { BasicSoundBank } from "./basic_soundbank";
import { Generator } from "./generator";
import { generatorTypes } from "./generator_types";

export class BasicPresetZone extends BasicZone {
    /**
     * The parent preset.
     */
    public readonly parentPreset: BasicPreset;

    /**
     * Zone's instrument.
     */
    public instrument: BasicInstrument;

    /**
     * Creates a new preset zone.
     * @param preset the preset this zone belongs to.
     * @param instrument the instrument to use in this zone.
     */
    public constructor(preset: BasicPreset, instrument: BasicInstrument) {
        super();
        this.parentPreset = preset;
        this.instrument = instrument;
        this.instrument.linkTo(this.parentPreset);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Sets an instrument for this zone.
     * @param instrument the instrument to use.
     */
    public setInstrument(instrument: BasicInstrument) {
        if (this.instrument) {
            this.instrument.unlinkFrom(this.parentPreset);
        }
        this.instrument = instrument;
        this.instrument.linkTo(this.parentPreset);
    }

    public getGenCount(): number {
        return super.getGenCount() + 1; // Instrument generator
    }

    public getSFGenerators(bank: BasicSoundBank): Generator[] {
        const gens = super.getSFGenerators(bank);
        if (!bank) {
            throw new Error(
                "Instrument ID cannot be determined without the sound bank itself."
            );
        }
        gens.push(
            new Generator(
                generatorTypes.instrument,
                bank.instruments.indexOf(this.instrument),
                false
            )
        );
        return gens;
    }
}
