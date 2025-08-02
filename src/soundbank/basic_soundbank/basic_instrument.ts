import { BasicGlobalZone } from "./basic_global_zone";
import { BasicInstrumentZone } from "./basic_instrument_zone";
import { SpessaSynthWarn } from "../../utils/loggin";
import type { BasicPreset } from "./basic_preset";
import type { BasicSample } from "./basic_sample";

// Noinspection JSUnusedGlobalSymbols
/**
 * Represents a single instrument
 */
export class BasicInstrument {
    /**
     * The instrument's name
     */
    public name = "";

    /**
     * The instrument's zones
     */
    public zones: BasicInstrumentZone[] = [];

    /**
     * Instrument's global zone
     */
    public readonly globalZone: BasicGlobalZone = new BasicGlobalZone();

    /**
     * Instrument's linked presets (the presets that use it)
     * note that duplicates are allowed since one preset can use the same instrument multiple times
     */
    public readonly linkedTo: BasicPreset[] = [];

    // How many presets is this instrument used by
    public get useCount(): number {
        return this.linkedTo.length;
    }

    /**
     * Creates a new instrument zone and returns it.
     * @param sample The sample to use in the zone.
     */
    public createZone(sample: BasicSample): BasicInstrumentZone {
        const zone = new BasicInstrumentZone(this, sample);
        this.zones.push(zone);
        return zone;
    }

    /**
     * Links the instrument ta a given preset
     * @param preset the preset to link to
     */
    public linkTo(preset: BasicPreset) {
        this.linkedTo.push(preset);
        this.zones.forEach((z) => z.useCount++);
    }

    /**
     * Unlinks the instrument from a given preset
     * @param preset the preset to unlink from
     */
    public unlinkFrom(preset: BasicPreset) {
        const index = this.linkedTo.indexOf(preset);
        if (index < 0) {
            SpessaSynthWarn(
                `Cannot unlink ${preset.name} from ${this.name}: not linked.`
            );
            return;
        }
        this.linkedTo.splice(index, 1);
        this.zones.forEach((z) => z.useCount--);
    }

    // Deletes unused zones of the instrument
    public deleteUnusedZones() {
        this.zones = this.zones.filter((z) => {
            const stays = z.useCount > 0;
            if (!stays) {
                z.sample.unlinkFrom(this);
            }
            return stays;
        });
    }

    // Unlinks everything from this instrument
    public delete() {
        if (this.useCount > 0) {
            throw new Error(
                `Cannot delete an instrument that is used by: ${this.linkedTo.map((p) => p.name).toString()}.`
            );
        }
        this.zones.forEach((z) => z.sample.unlinkFrom(this));
    }

    /**
     * Deletes a given instrument zone if it has no uses
     * @param index the index of the zone to delete
     * @param force ignores the use count and deletes forcibly
     * @returns if the zone has been deleted
     */
    public deleteZone(index: number, force = false): boolean {
        const zone = this.zones[index];
        zone.useCount -= 1;
        if (zone.useCount < 1 || force) {
            zone.sample.unlinkFrom(this);
            this.zones.splice(index, 1);
            return true;
        }
        return false;
    }
}
