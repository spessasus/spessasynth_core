import { BasicPreset } from "../basic_soundbank/basic_preset.js";
import { DLSInstrument } from "./dls_instrument.js";
import type { BasicSoundBank } from "../basic_soundbank/basic_soundbank.ts";

export class DLSPreset extends BasicPreset {
    dlsInstrument: DLSInstrument = new DLSInstrument();

    /**
     * Creates a new DLS preset
     */
    constructor(dls: BasicSoundBank, ulBank: number, ulInstrument: number) {
        // use stock default modulators, dls won't ever have DMOD chunk
        super(dls);
        this.program = ulInstrument & 127;
        const bankMSB = (ulBank >> 8) & 127;
        const bankLSB = ulBank & 127;
        // switch accordingly
        if (bankMSB > 0) {
            this.bank = bankMSB;
        } else {
            this.bank = bankLSB;
        }
        const isDrums = ulBank >> 31;
        if (isDrums) {
            // soundfont bank is 128, so we change it here
            this.bank = 128;
        }

        const zone = this.createZone();
        zone.setInstrument(this.dlsInstrument);
    }
}
