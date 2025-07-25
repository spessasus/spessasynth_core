// noinspection JSUnusedGlobalSymbols

import { SpessaSynthProcessor } from "./synthetizer/audio_engine/main_processor.js";
import { SpessaSynthSequencer } from "./sequencer/sequencer_engine.js";
import {
    ALL_CHANNELS_OR_DIFFERENT_ACTION,
    DEFAULT_PERCUSSION,
    DEFAULT_SYNTH_MODE,
    MIDI_CHANNEL_COUNT,
    VOICE_CAP
} from "./synthetizer/synth_constants.js";
import {
    channelConfiguration,
    NON_CC_INDEX_OFFSET
} from "./synthetizer/audio_engine/engine_components/controller_tables.js";
import { KeyModifier } from "./synthetizer/audio_engine/engine_components/key_modifier_manager.js";
import { masterParameterType } from "./synthetizer/audio_engine/engine_methods/controller_control/master_parameters.js";
import { SynthesizerSnapshot } from "./synthetizer/audio_engine/snapshot/synthesizer_snapshot.js";
import { ChannelSnapshot } from "./synthetizer/audio_engine/snapshot/channel_snapshot.js";

import { BasicSoundBank } from "./soundfont/basic_soundfont/basic_soundbank.js";
import {
    BasicSample,
    CreatedSample,
    sampleTypes
} from "./soundfont/basic_soundfont/basic_sample.js";
import { BasicPresetZone } from "./soundfont/basic_soundfont/basic_preset_zone.js";
import { BasicInstrument } from "./soundfont/basic_soundfont/basic_instrument.js";
import { BasicPreset } from "./soundfont/basic_soundfont/basic_preset.js";
import { Generator } from "./soundfont/basic_soundfont/generator.js";
import {
    Modulator,
    modulatorCurveTypes,
    modulatorSources
} from "./soundfont/basic_soundfont/modulator.js";
import { BasicZone } from "./soundfont/basic_soundfont/basic_zone.js";
import { BasicGlobalZone } from "./soundfont/basic_soundfont/basic_global_zone.js";
import { loadSoundFont } from "./soundfont/load_soundfont.js";

import { MIDI } from "./midi/midi_loader.js";
import { BasicMIDI } from "./midi/basic_midi.js";
import { MIDISequenceData } from "./midi/midi_sequence.js";
import { MIDIBuilder } from "./midi/midi_builder.js";
import {
    messageTypes,
    midiControllers,
    MIDIMessage
} from "./midi/midi_message.js";
import {
    interpolationTypes,
    synthDisplayTypes
} from "./synthetizer/audio_engine/engine_components/enums.js";
import { RMIDINFOChunks } from "./midi/midi_tools/rmidi_writer.js";
import { IndexedByteArray } from "./utils/indexed_array.js";
import { audioToWav } from "./utils/buffer_to_wav.js";
import {
    SpessaSynthGroupCollapsed,
    SpessaSynthGroupEnd,
    SpessaSynthInfo,
    SpessaSynthLogging,
    SpessaSynthWarn
} from "./utils/loggin.js";
import { readBytesAsUintBigEndian } from "./utils/byte_functions/big_endian.js";
import { readLittleEndian } from "./utils/byte_functions/little_endian.js";
import { readBytesAsString } from "./utils/byte_functions/string.js";
import { readVariableLengthQuantity } from "./utils/byte_functions/variable_length_quantity.js";
import { consoleColors } from "./utils/other.js";
import { inflateSync } from "./externals/fflate/fflate.min.js";
import { DLSDestinations } from "./soundfont/dls/dls_destinations.js";
import { DLSSources } from "./soundfont/dls/dls_sources.js";
import { generatorTypes } from "./soundfont/basic_soundfont/generator_types.js";
import { BasicInstrumentZone } from "./soundfont/basic_soundfont/basic_instrument_zone.js";
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
    masterParameterType,
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
