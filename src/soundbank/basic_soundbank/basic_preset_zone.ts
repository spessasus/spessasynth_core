import { BasicZone } from "./basic_zone";
import type { BasicPreset } from "./basic_preset";
import type { BasicInstrument } from "./basic_instrument";

export class BasicPresetZone extends BasicZone {
    /**
     * The parent preset.
     */
    readonly parentPreset: BasicPreset;

    /**
     * Zone's instrument.
     */
    instrument: BasicInstrument;

    /**
     * Creates a new preset zone.
     * @param preset the preset this zone belongs to.
     * @param instrument the instrument to use in this zone.
     */
    constructor(preset: BasicPreset, instrument: BasicInstrument) {
        super();
        this.parentPreset = preset;
        this.instrument = instrument;
        this.instrument.linkTo(this.parentPreset);
    }

    /**
     * Sets an instrument for this zone.
     * @param instrument the instrument to use.
     */
    setInstrument(instrument: BasicInstrument) {
        if (this.instrument) {
            this.instrument.unlinkFrom(this.parentPreset);
        }
        this.instrument = instrument;
        this.instrument.linkTo(this.parentPreset);
    }
}
