import type { XGVariationPreset } from "../xg_variation_program";
import { XGKaraokeBase } from "./xg_karaoke";

/**
 * KARAOKE 2 (`14 01`): a filtered echo for vocals.
 */
export class XGKaraoke2 extends XGKaraokeBase {
    public readonly type = 0x14_01;
    protected readonly preset: XGVariationPreset = {
        words: [
            181, 181, 0, 128, 0, 0, 128, 0, 0, 0, 0, 0, 128, 0, 0, 0, 128, 0, 0,
            0, 128, 0, 0, 128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 512, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 512, 0, 0, 0, 0, 0, 0, 0, 128, 0, 0, 512, 256,
            256, 0, 0, 512, 0, 512, 0, 0, 0, 128, 256, 256, 0, 256, 256, 0, 512,
            0, 512, 4616, 0, 0, 4615, 0, 1467, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            4624, 4618, 3551, 0, 4617, 4620, 4619, 4622, 2725, 4621, 4623
        ],
        defaults: [55, 105, 0, 50, 0, 0, 0, 0, 0, 64, 1, 0, 0, 0, 0, 0]
    };
}
