// noinspection JSUnusedGlobalSymbols

import { SpessaSynthProcessor } from "./synthetizer/audio_engine/processor";
import { SpessaSynthSequencer } from "./sequencer/sequencer";
import {
    ALL_CHANNELS_OR_DIFFERENT_ACTION,
    DEFAULT_PERCUSSION,
    DEFAULT_SYNTH_MODE,
    MIDI_CHANNEL_COUNT,
    VOICE_CAP
} from "./synthetizer/audio_engine/engine_components/synth_constants";
import { NON_CC_INDEX_OFFSET } from "./synthetizer/audio_engine/engine_components/controller_tables";
import { KeyModifier } from "./synthetizer/audio_engine/engine_components/key_modifier_manager";
import { SynthesizerSnapshot } from "./synthetizer/audio_engine/snapshot/synthesizer_snapshot";
import { ChannelSnapshot } from "./synthetizer/audio_engine/snapshot/channel_snapshot";

import { BasicSoundBank } from "./soundbank/basic_soundbank/basic_soundbank";
import {
    BasicSample,
    EmptySample
} from "./soundbank/basic_soundbank/basic_sample";
import { BasicPresetZone } from "./soundbank/basic_soundbank/basic_preset_zone";
import { BasicInstrument } from "./soundbank/basic_soundbank/basic_instrument";
import { BasicPreset } from "./soundbank/basic_soundbank/basic_preset";
import { Generator } from "./soundbank/basic_soundbank/generator";
import { Modulator } from "./soundbank/basic_soundbank/modulator";
import { BasicZone } from "./soundbank/basic_soundbank/basic_zone";
import { BasicGlobalZone } from "./soundbank/basic_soundbank/basic_global_zone";
import { loadSoundFont } from "./soundbank/load_soundfont";
import { SoundBankLoader } from "./soundbank/sound_bank_loader";

import { MIDIMessage } from "./midi/midi_message";
import { BasicMIDI, MIDI } from "./midi/basic_midi";
import { MIDISequenceData } from "./midi/midi_sequence";
import { MIDIBuilder } from "./midi/midi_builder";
import { IndexedByteArray } from "./utils/indexed_array";
import { audioToWav } from "./utils/buffer_to_wav";
import {
    SpessaSynthGroupCollapsed,
    SpessaSynthGroupEnd,
    SpessaSynthInfo,
    SpessaSynthLogging,
    SpessaSynthWarn
} from "./utils/loggin";
import { readBytesAsUintBigEndian } from "./utils/byte_functions/big_endian";
import { readLittleEndian } from "./utils/byte_functions/little_endian";
import { readBytesAsString } from "./utils/byte_functions/string";
import { readVariableLengthQuantity } from "./utils/byte_functions/variable_length_quantity";
import { consoleColors } from "./utils/other";
import { inflateSync } from "./externals/fflate/fflate_wrapper";
import { BasicInstrumentZone } from "./soundbank/basic_soundbank/basic_instrument_zone";
import { DEFAULT_MASTER_PARAMETERS } from "./synthetizer/audio_engine/engine_components/master_parameters";
// you shouldn't use these...
const SpessaSynthCoreUtils = {
    consoleColors,
    SpessaSynthInfo,
    SpessaSynthWarn,
    SpessaSynthGroupCollapsed,
    SpessaSynthGroupEnd,
    readBytesAsUintBigEndian,
    readLittleEndian,
    readBytesAsString,
    readVariableLengthQuantity,
    inflateSync
};

export * from "./soundbank/types";
export * from "./soundbank/enums";
export * from "./midi/types";
export * from "./midi/enums";
export * from "./synthetizer/types";
export * from "./synthetizer/enums";

// see All-NPN-Exports.md in the wiki
export {
    // synth and seq
    SpessaSynthSequencer,
    SpessaSynthProcessor,
    SynthesizerSnapshot,
    ChannelSnapshot,
    KeyModifier,
    DEFAULT_PERCUSSION,
    DEFAULT_MASTER_PARAMETERS,
    VOICE_CAP,
    ALL_CHANNELS_OR_DIFFERENT_ACTION,
    NON_CC_INDEX_OFFSET,
    DEFAULT_SYNTH_MODE,
    MIDI_CHANNEL_COUNT,

    // sound banks
    loadSoundFont,
    Generator,
    Modulator,
    BasicZone,
    BasicGlobalZone,
    BasicSample,
    EmptySample,
    BasicInstrumentZone,
    BasicInstrument,
    BasicPreset,
    BasicPresetZone,
    BasicSoundBank,
    SoundBankLoader,

    // MIDI
    MIDIMessage,
    MIDI,
    MIDISequenceData,
    BasicMIDI,
    MIDIBuilder,

    // utils
    IndexedByteArray,
    audioToWav,
    SpessaSynthLogging,
    SpessaSynthCoreUtils
};
