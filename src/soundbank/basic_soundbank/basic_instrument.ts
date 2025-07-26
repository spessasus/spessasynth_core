import { BasicGlobalZone } from "./basic_global_zone";
import { BasicInstrumentZone } from "./basic_instrument_zone";
import { SpessaSynthWarn } from "../../utils/loggin";
import type { BasicPreset } from "./basic_preset";
import type { BasicSample } from "./basic_sample";

// noinspection JSUnusedGlobalSymbols
/**
 * Represents a single instrument
 */
export class BasicInstrument {
    /**
     * The instrument's name
     */
    instrumentName: string = "";

    /**
     * The instrument's zones
     */
    instrumentZones: BasicInstrumentZone[] = [];

    /**
     * Instrument's global zone
     */
    readonly globalZone: BasicGlobalZone = new BasicGlobalZone();

    /**
     * Instrument's linked presets (the presets that use it)
     * note that duplicates are allowed since one preset can use the same instrument multiple times
     */
    readonly linkedPresets: BasicPreset[] = [];

    // How many presets is this instrument used by
    get useCount(): number {
        return this.linkedPresets.length;
    }

    // The instrument's name.
    get name(): string {
        return this.instrumentName;
    }

    // The instrument's name.
    set name(value: string) {
        this.instrumentName = value;
    }

    /**
     * Creates a new instrument zone and returns it.
     * @param sample The sample to use in the zone.
     */
    createZone(sample: BasicSample): BasicInstrumentZone {
        const zone = new BasicInstrumentZone(this, sample);
        this.instrumentZones.push(zone);
        return zone;
    }

    /**
     * Links the instrument ta a given preset
     * @param preset the preset to link to
     */
    linkTo(preset: BasicPreset) {
        this.linkedPresets.push(preset);
        this.instrumentZones.forEach((z) => z.useCount++);
    }

    /**
     * Unlinks the instrument from a given preset
     * @param preset the preset to unlink from
     */
    unlinkFrom(preset: BasicPreset) {
        const index = this.linkedPresets.indexOf(preset);
        if (index < 0) {
            SpessaSynthWarn(
                `Cannot unlink ${preset.presetName} from ${this.instrumentName}: not linked.`
            );
            return;
        }
        this.linkedPresets.splice(index, 1);
        this.instrumentZones.forEach((z) => z.useCount--);
    }

    // Deletes unused zones of the instrument
    deleteUnusedZones() {
        this.instrumentZones = this.instrumentZones.filter((z) => {
            const stays = z.useCount > 0;
            if (!stays) {
                z.sample.unlinkFrom(this);
            }
            return stays;
        });
    }

    // Unlinks everything from this instrument
    deleteInstrument() {
        if (this.useCount > 0) {
            throw new Error(
                `Cannot delete an instrument that is used by: ${this.linkedPresets.map((p) => p.presetName)}.`
            );
        }
        this.instrumentZones.forEach((z) => z.sample.unlinkFrom(this));
    }

    /**
     * Deletes a given instrument zone if it has no uses
     * @param index the index of the zone to delete
     * @param force ignores the use count and deletes forcibly
     * @returns if the zone has been deleted
     */
    deleteZone(index: number, force: boolean = false): boolean {
        const zone = this.instrumentZones[index];
        zone.useCount -= 1;
        if (zone.useCount < 1 || force) {
            zone.sample.unlinkFrom(this);
            this.instrumentZones.splice(index, 1);
            return true;
        }
        return false;
    }
}
