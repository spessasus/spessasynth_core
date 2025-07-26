import { BasicPreset } from "../basic_soundbank/basic_preset";
import { DLSInstrument } from "./dls_instrument";
import type { BasicSoundBank } from "../basic_soundbank/basic_soundbank";

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

        this.createZone(this.dlsInstrument);
    }
}
