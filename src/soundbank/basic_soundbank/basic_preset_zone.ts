import { BasicZone } from "./basic_zone";
import type { BasicPreset } from "./basic_preset";
import type { BasicInstrument } from "./basic_instrument";
import type { BasicSoundBank } from "./basic_soundbank";
import { Generator } from "./generator";
import { generatorTypes } from "./generator_types";

export class BasicPresetZone extends BasicZone {
    /**
     * The preset this zone belongs to.
     */
    public readonly parentPreset: BasicPreset;

    /**
     * Creates a new preset zone.
     * @param preset the preset this zone belongs to.
     * @param instrument the instrument to use in this zone.
     */
    public constructor(preset: BasicPreset, instrument: BasicInstrument) {
        super();
        this.parentPreset = preset;
        this._instrument = instrument;
        this._instrument.linkTo(this.parentPreset);
    }

    /**
     * Zone's instrument.
     */
    private _instrument: BasicInstrument;

    /**
     * Zone's instrument.
     */
    public get instrument() {
        return this._instrument;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Zone's instrument.
     */
    public set instrument(instrument: BasicInstrument) {
        if (this._instrument) {
            this._instrument.unlinkFrom(this.parentPreset);
        }
        this._instrument = instrument;
        this._instrument.linkTo(this.parentPreset);
    }

    public getGenCount(): number {
        return super.getGenCount() + 1; // Instrument generator
    }

    public getWriteGenerators(bank: BasicSoundBank): Generator[] {
        const gens = super.getWriteGenerators(bank);
        if (!bank) {
            throw new Error(
                "Instrument ID cannot be determined without the sound bank itself."
            );
        }
        const instrumentID = bank.instruments.indexOf(this.instrument);
        if (instrumentID < 0) {
            throw new Error(
                `${this.instrument.name} does not exist in ${bank.soundBankInfo.name}! Cannot write instrument generator.`
            );
        }
        gens.push(
            new Generator(generatorTypes.instrument, instrumentID, false)
        );
        return gens;
    }
}
