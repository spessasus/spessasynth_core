import type { BasicSoundBank } from "./basic_soundbank/basic_soundbank.ts";
import type { Generator } from "./basic_soundbank/generator.ts";
import { Modulator } from "./basic_soundbank/modulator.ts";
import type { BasicSample } from "./basic_soundbank/basic_sample.ts";
import type { IndexedByteArray } from "../utils/indexed_array.ts";

export type SoundFontType = {
    id: string;
    soundfont: BasicSoundBank;
    bankOffset: number;
};
export type SoundFontInfoFourCC =
    | "INAM"
    | "ICRD"
    | "IENG"
    | "IPRD"
    | "ICOP"
    | "ICMT"
    | "ifil"
    | "isng"
    | "irom"
    | "iver"
    | "ISFT"
    | "DMOD"
    | "xdta";
export type SoundBankInfo = Partial<
    Record<SoundFontInfoFourCC, string | IndexedByteArray>
>;
export type SampleAndGenerators = {
    instrumentGenerators: Generator[];
    presetGenerators: Generator[];
    modulators: Modulator[];
    sample: BasicSample;
};

export type SampleEncodingFunction = (
    audioData: Float32Array,
    sampleRate: number
) => Promise<Uint8Array>;

export type ModulatorNumericBool = 0 | 1;
