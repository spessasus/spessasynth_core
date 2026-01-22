import { DecodedModulator } from "../basic_soundbank/modulator";
import { generatorTypes } from "../basic_soundbank/generator_types";

export const DEFAULT_DLS_REVERB = new DecodedModulator(
    0x00_db,
    0x0,
    generatorTypes.reverbEffectsSend,
    1000,
    0
);

export const DEFAULT_DLS_CHORUS = new DecodedModulator(
    0x00_dd,
    0x0,
    generatorTypes.chorusEffectsSend,
    1000,
    0
);

export const DLS_1_NO_VIBRATO_MOD = new DecodedModulator(
    0x00_81,
    0x0,
    generatorTypes.vibLfoToPitch,
    0,
    0
);

export const DLS_1_NO_VIBRATO_PRESSURE = new DecodedModulator(
    0x00_0d,
    0x0,
    generatorTypes.vibLfoToPitch,
    0,
    0
);
