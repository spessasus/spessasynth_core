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
        this.bankMSB = (ulBank >> 8) & 127;
        this.bankLSB = ulBank & 127;
        this.isGMGSDrum = ulBank >> 31 > 0;

        this.createZone(this.dlsInstrument);
    }
}
