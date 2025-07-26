import { DecodedModulator } from "../basic_soundbank/modulator.js";

import { generatorTypes } from "../basic_soundbank/generator_types.js";

export const DEFAULT_DLS_REVERB = new DecodedModulator(
    0x00db,
    0x0,
    generatorTypes.reverbEffectsSend,
    1000,
    0
);

export const DEFAULT_DLS_CHORUS = new DecodedModulator(
    0x00dd,
    0x0,
    generatorTypes.chorusEffectsSend,
    1000,
    0
);

export const DLS_1_NO_VIBRATO_MOD = new DecodedModulator(
    0x0081,
    0x0,
    generatorTypes.vibLfoToPitch,
    0,
    0
);

export const DLS_1_NO_VIBRATO_PRESSURE = new DecodedModulator(
    0x000d,
    0x0,
    generatorTypes.vibLfoToPitch,
    0,
    0
);
