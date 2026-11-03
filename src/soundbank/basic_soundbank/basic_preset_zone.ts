import { BasicLinkedZone } from "./basic_linked_zone";
import type { BasicPreset } from "./basic_preset";
import type { BasicInstrument } from "./basic_instrument";
import type { BasicSoundBank } from "./basic_soundbank";
import { GeneratorTypes } from "./generator_types";

/**
 * Represents a single preset zone with an associated {@link BasicInstrument}.
 *
 * @group Sound Banks.Zones
 */
export class BasicPresetZone extends BasicLinkedZone<
    BasicPreset,
    BasicInstrument
> {
    protected readonly childGenerator = GeneratorTypes.instrument;

    /**
     * Creates a new preset zone.
     * @param preset the preset this zone belongs to.
     * @param instrument the instrument to use in this zone.
     * @param link if the instrument should be linked to the preset.
     * @internal
     */
    public constructor(
        preset: BasicPreset,
        instrument: BasicInstrument,
        link = true
    ) {
        super(preset, instrument, link);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * The preset this zone belongs to.
     */
    public get parentPreset() {
        return this.parent;
    }

    /**
     * The instrument associated with this zone.
     */
    public get instrument() {
        return this.child;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Sets an instrument for this zone, unlinking the previous one from it.
     * @param instrument The instrument to set.
     */
    public set instrument(instrument: BasicInstrument) {
        this.setChild(instrument);
    }

    protected getChildList(bank: BasicSoundBank) {
        return bank.instruments;
    }
}
