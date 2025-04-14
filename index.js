import { SpessaSynthProcessor } from "./src/synthetizer/audio_engine/main_processor.js";
import { SpessaSynthSequencer } from "./src/sequencer/sequencer_engine.js";
import { ALL_CHANNELS_OR_DIFFERENT_ACTION, DEFAULT_PERCUSSION, VOICE_CAP } from "./src/synthetizer/synth_constants.js";
import { NON_CC_INDEX_OFFSET } from "./src/synthetizer/audio_engine/engine_components/controller_tables.js";

import { BasicSoundBank } from "./src/soundfont/basic_soundfont/basic_soundfont.js";
import { BasicSample } from "./src/soundfont/basic_soundfont/basic_sample.js";
import { BasicInstrumentZone, BasicPresetZone } from "./src/soundfont/basic_soundfont/basic_zones.js";
import { BasicInstrument } from "./src/soundfont/basic_soundfont/basic_instrument.js";
import { BasicPreset } from "./src/soundfont/basic_soundfont/basic_preset.js";
import { Generator } from "./src/soundfont/basic_soundfont/generator.js";
import { Modulator } from "./src/soundfont/basic_soundfont/modulator.js";
import { loadSoundFont } from "./src/soundfont/load_soundfont.js";

import { MIDI } from "./src/midi/midi_loader.js";
import { BasicMIDI } from "./src/midi/basic_midi.js";
import { MIDIBuilder } from "./src/midi/midi_builder.js";
import { messageTypes, midiControllers, MIDIMessage } from "./src/midi/midi_message.js";
import { RMIDINFOChunks } from "./src/midi/midi_tools/rmidi_writer.js";
import { IndexedByteArray } from "./src/utils/indexed_array.js";
import { audioToWav } from "./src/utils/buffer_to_wav.js";
import {
    SpessaSynthGroupCollapsed,
    SpessaSynthGroupEnd,
    SpessaSynthInfo,
    SpessaSynthLogging,
    SpessaSynthWarn
} from "./src/utils/loggin.js";
import { consoleColors } from "./src/utils/other.js";

const OtherUtilites = {
    consoleColors,
    SpessaSynthInfo,
    SpessaSynthWarn,
    SpessaSynthGroupCollapsed,
    SpessaSynthGroupEnd
};

export {
    // synth and seq
    SpessaSynthSequencer,
    SpessaSynthProcessor,
    DEFAULT_PERCUSSION,
    VOICE_CAP,
    ALL_CHANNELS_OR_DIFFERENT_ACTION,
    NON_CC_INDEX_OFFSET,
    
    // sound banks
    loadSoundFont,
    BasicSoundBank,
    BasicSample,
    BasicInstrumentZone,
    BasicInstrument,
    BasicPreset,
    BasicPresetZone,
    Generator,
    Modulator,
    
    // MIDI
    MIDI,
    BasicMIDI,
    MIDIBuilder,
    MIDIMessage,
    RMIDINFOChunks,
    
    // utils
    IndexedByteArray,
    audioToWav,
    SpessaSynthLogging,
    midiControllers,
    messageTypes,
    OtherUtilites
};