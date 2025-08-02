import { BasicPreset } from "../basic_soundbank/basic_preset";
import { DLSInstrument } from "./dls_instrument";
import type { BasicSoundBank } from "../basic_soundbank/basic_soundbank";

export class DLSPreset extends BasicPreset {
    public readonly dlsInstrument: DLSInstrument = new DLSInstrument();

    /**
     * Creates a new DLS preset
     */
    public constructor(
        dls: BasicSoundBank,
        ulBank: number,
        ulInstrument: number
    ) {
        // Use stock default modulators, dls won't ever have DMOD chunk
        super(dls);
        this.program = ulInstrument & 127;
        const bankMSB = (ulBank >> 8) & 127;
        const bankLSB = ulBank & 127;
        // Switch accordingly
        if (bankMSB > 0) {
            this.bank = bankMSB;
        } else {
            this.bank = bankLSB;
        }
        const isDrums = ulBank >> 31;
        if (isDrums) {
            // Soundfont bank is 128, so we change it here
            this.bank = 128;
        }

        this.createZone(this.dlsInstrument);
    }
}
