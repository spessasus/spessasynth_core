// noinspection JSUnusedGlobalSymbols

import { SpessaSynthProcessor } from "./synthetizer/audio_engine/main_processor";
import { SpessaSynthSequencer } from "./sequencer/sequencer_engine";
import {
    ALL_CHANNELS_OR_DIFFERENT_ACTION,
    DEFAULT_PERCUSSION,
    DEFAULT_SYNTH_MODE,
    MIDI_CHANNEL_COUNT,
    VOICE_CAP
} from "./synthetizer/audio_engine/synth_constants";
import {
    channelConfiguration,
    NON_CC_INDEX_OFFSET
} from "./synthetizer/audio_engine/engine_components/controller_tables";
import { KeyModifier } from "./synthetizer/audio_engine/engine_components/key_modifier_manager";
import { SynthesizerSnapshot } from "./synthetizer/audio_engine/snapshot/synthesizer_snapshot";
import { ChannelSnapshot } from "./synthetizer/audio_engine/snapshot/channel_snapshot";

import { BasicSoundBank } from "./soundbank/basic_soundbank/basic_soundbank";
import {
    BasicSample,
    CreatedSample
} from "./soundbank/basic_soundbank/basic_sample";
import { BasicPresetZone } from "./soundbank/basic_soundbank/basic_preset_zone";
import { BasicInstrument } from "./soundbank/basic_soundbank/basic_instrument";
import { BasicPreset } from "./soundbank/basic_soundbank/basic_preset";
import { Generator } from "./soundbank/basic_soundbank/generator";
import { Modulator } from "./soundbank/basic_soundbank/modulator";
import { BasicZone } from "./soundbank/basic_soundbank/basic_zone";
import { BasicGlobalZone } from "./soundbank/basic_soundbank/basic_global_zone";
import { loadSoundFont } from "./soundbank/load_soundfont";
import {
    DLSDestinations,
    DLSSources,
    modulatorCurveTypes,
    modulatorSources,
    sampleTypes
} from "./soundbank/enums";

import { MIDI } from "./midi/midi_loader";
import { BasicMIDI } from "./midi/basic_midi";
import { MIDISequenceData } from "./midi/midi_sequence";
import { MIDIBuilder } from "./midi/midi_builder";
import { MIDIMessage } from "./midi/midi_message";
import { interpolationTypes, synthDisplayTypes } from "./synthetizer/enums";
import { messageTypes, midiControllers, RMIDINFOChunks } from "./midi/enums";
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
import { generatorTypes } from "./soundbank/basic_soundbank/generator_types";
import { BasicInstrumentZone } from "./soundbank/basic_soundbank/basic_instrument_zone";
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

// see All-NPN-Exports.md in the wiki
export {
    // synth and seq
    SpessaSynthSequencer,
    SpessaSynthProcessor,
    SynthesizerSnapshot,
    ChannelSnapshot,
    KeyModifier,
    channelConfiguration,
    interpolationTypes,
    synthDisplayTypes,
    DEFAULT_PERCUSSION,
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
    CreatedSample,
    BasicInstrumentZone,
    BasicInstrument,
    BasicPreset,
    BasicPresetZone,
    BasicSoundBank,
    modulatorSources,
    modulatorCurveTypes,
    generatorTypes,
    DLSSources,
    DLSDestinations,
    sampleTypes,

    // MIDI
    MIDI,
    MIDISequenceData,
    BasicMIDI,
    MIDIBuilder,
    MIDIMessage,
    RMIDINFOChunks,
    midiControllers,
    messageTypes,

    // utils
    IndexedByteArray,
    audioToWav,
    SpessaSynthLogging,
    SpessaSynthCoreUtils
};
