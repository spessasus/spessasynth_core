import { BasicZone } from "./basic_zone.js";
import type { BasicPreset } from "./basic_preset.ts";
import type { BasicInstrument } from "./basic_instrument.ts";

export class BasicPresetZone extends BasicZone {
    /**
     * The parent preset.
     */
    readonly parentPreset: BasicPreset;

    /**
     * Zone's instrument.
     */
    instrument: BasicInstrument | undefined;

    /**
     * Creates a new preset zone
     * @param preset the preset this zone belongs to
     */
    constructor(preset: BasicPreset) {
        super();
        this.parentPreset = preset;
    }

    /**
     * Sets an instrument for this zone
     * @param instrument the instrument to use
     */
    setInstrument(instrument: BasicInstrument) {
        this.instrument = instrument;
        this.instrument.linkTo(this.parentPreset);
    }
}
