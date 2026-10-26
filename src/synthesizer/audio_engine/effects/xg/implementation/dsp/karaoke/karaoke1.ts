import type { XGVariationPreset } from "../xg_variation_program";
import { XGKaraokeBase } from "./xg_karaoke";

/**
 * KARAOKE 1 (`14 00`): a filtered echo for vocals.
 */
export class XGKaraoke1 extends XGKaraokeBase {
    public readonly type = 0x14_00;
    protected readonly preset: XGVariationPreset = {
        words: [
            181, 181, 0, 128, 0, 0, 128, 0, 0, 0, 0, 0, 128, 0, 0, 0, 128, 0, 0,
            0, 128, 0, 0, 128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 512, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 512, 0, 0, 0, 0, 0, 0, 0, 128, 0, 0, 512, 256,
            256, 0, 0, 512, 0, 512, 0, 0, 0, 128, 256, 256, 0, 256, 256, 0, 512,
            0, 512, 4616, 0, 0, 4615, 0, 1467, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            4624, 4618, 3551, 0, 4617, 4620, 4619, 4622, 2725, 4621, 4623
        ],
        defaults: [63, 97, 0, 48, 0, 0, 0, 0, 0, 64, 2, 0, 0, 0, 0, 0]
    };
}
