import { BasicZone } from "./basic_zone";
import type { BasicPreset } from "./basic_preset";
import type { BasicInstrument } from "./basic_instrument";
import type { BasicSoundBank } from "./basic_soundbank";
import { Generator } from "./generator";
import { GeneratorTypes } from "./generator_types";

/**
 * Represents a single preset zone with an associated {@link BasicInstrument}.
 *
 * @group Sound Banks.Zones
 */
export class BasicPresetZone extends BasicZone {
    /**
     * The preset this zone belongs to.
     */
    public readonly parentPreset: BasicPreset;

    /**
     * Creates a new preset zone.
     * @param preset the preset this zone belongs to.
     * @param instrument the instrument to use in this zone.
     * @internal
     */
    public constructor(preset: BasicPreset, instrument: BasicInstrument) {
        super();
        this.parentPreset = preset;
        this._instrument = instrument;
        this._instrument.linkTo(this.parentPreset);
    }

    /**
     * The instrument associated with this zone.
     */
    private _instrument: BasicInstrument;

    /**
     * The instrument associated with this zone.
     */
    public get instrument() {
        return this._instrument;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Sets an instrument for this zone, unliking the previous one from it.
     * @param instrument The instrument to set.
     */
    public set instrument(instrument: BasicInstrument) {
        if (this._instrument) {
            this._instrument.unlinkFrom(this.parentPreset);
        }
        this._instrument = instrument;
        this._instrument.linkTo(this.parentPreset);
    }

    /**
     * @internal
     * @param bank
     */
    public getWriteGenerators(bank: BasicSoundBank): Generator[] {
        const gens = super.getWriteGenerators(bank);
        if (!bank) {
            throw new Error(
                "Instrument ID cannot be determined without the sound bank itself."
            );
        }
        const instrumentID = bank.instruments.indexOf(this.instrument);
        if (instrumentID === -1) {
            throw new Error(
                `${this.instrument.name} does not exist in ${bank.soundBankInfo.name}! Cannot write instrument generator.`
            );
        }
        gens.push(
            new Generator(GeneratorTypes.instrument, instrumentID, false)
        );
        return gens;
    }
}
