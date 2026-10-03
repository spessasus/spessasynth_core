import type {
    GSChorusParameter,
    GSDelayParameter,
    GSReverbParameter
} from "../../synthesizer/audio_engine/effects/types";
import type { GlobalMIDIParameter } from "../../synthesizer/audio_engine/parameters/midi";
import type { MIDIController } from "../enums";
import type { DrumParameter, UserDrumSetParameter } from "../types";
import type { ChannelMIDIParameter } from "../../synthesizer/audio_engine/channel/parameters/midi";

/**
 * Represents an analyzed global MIDI parameter change message.
 *
 * @group MIDI.Protocol
 */
export type GlobalMIDIParameterMessage = {
    [P in keyof GlobalMIDIParameter]: {
        /**
         * The message type identifier.
         */
        type: "Global MIDI Param";
        /**
         * The global MIDI parameter being modified.
         */
        parameter: P;
        /**
         * The new value of the global MIDI parameter.
         */
        value: GlobalMIDIParameter[P];
    };
}[keyof GlobalMIDIParameter];
/**
 * Represents an analyzed channel MIDI parameter change message.
 *
 * > **Note**
 * >
 * > Channel number may be above 15 for multi-port MIDI setups.
 *
 * @group MIDI.Protocol
 */
export type ChannelMIDIParameterMessage = {
    [P in keyof ChannelMIDIParameter]: {
        /**
         * The message type identifier.
         */
        type: "Channel MIDI Param";
        /**
         * The channel MIDI parameter being modified.
         */
        parameter: P;
        /**
         * The new value of the channel MIDI parameter.
         */
        value: ChannelMIDIParameter[P];
        /**
         * The MIDI channel number (it may be above 15 for multi-port MIDI setups).
         */
        channel: number;
    };
}[keyof ChannelMIDIParameter];
/**
 * Represents an analyzed channel GS Reverb Processor change.
 *
 * @group MIDI.Protocol
 */
export type GSReverbParameterMessage =
    | {
          [P in keyof GSReverbParameter]: {
              /**
               * The message type identifier.
               */
              type: "GS Reverb Param";
              /**
               * The GS reverb parameter being modified.
               */
              parameter: P;
              /**
               * The new value of the GS reverb parameter.
               */
              value: GSReverbParameter[P];
          };
      }[keyof GSReverbParameter]
    | {
          /**
           * The message type identifier.
           */
          type: "GS Reverb Param";
          /**
           * The GS reverb parameter being modified.
           */
          parameter: "macro";
          /**
           * The new value of the GS reverb parameter.
           */
          value: number;
      };
/**
 * Represents an analyzed channel GS Chorus Processor change.
 *
 * @group MIDI.Protocol
 */
export type GSChorusParameterMessage =
    | {
          [P in keyof GSChorusParameter]: {
              /**
               * The message type identifier.
               */
              type: "GS Chorus Param";
              /**
               * The GS chorus parameter being modified.
               */
              parameter: P;
              /**
               * The new value of the GS chorus parameter.
               */
              value: GSChorusParameter[P];
          };
      }[keyof GSChorusParameter]
    | {
          /**
           * The message type identifier.
           */
          type: "GS Chorus Param";
          /**
           * The GS chorus parameter being modified.
           */
          parameter: "macro";
          /**
           * The new value of the GS chorus parameter.
           */
          value: number;
      };
/**
 * Represents an analyzed channel GS Delay Processor change.
 *
 * @group MIDI.Protocol
 */
export type GSDelayParameterMessage =
    | {
          [P in keyof GSDelayParameter]: {
              /**
               * The message type identifier.
               */
              type: "GS Delay Param";
              /**
               * The GS delay parameter being modified.
               */
              parameter: P;
              /**
               * The new value of the GS delay parameter.
               */
              value: GSDelayParameter[P];
          };
      }[keyof GSDelayParameter]
    | {
          /**
           * The message type identifier.
           */
          type: "GS Delay Param";
          /**
           * The GS delay parameter being modified.
           */
          parameter: "macro";
          /**
           * The new value of the GS delay parameter.
           */
          value: number;
      };
/**
 * Represents an analyzed channel GS Insertion Processor change.
 *
 * @group MIDI.Protocol
 */
export type GSInsertionParameterMessage =
    | {
          /**
           * An insertion effect processor parameter message (Roland GS).
           */
          type: "GS Insertion Param";
          /**
           * The type of the insertion processor.
           */
          parameter: "type";
          /**
           * The value, stored as `MSB << 8 | LSB`.
           */
          value: number;
      }
    | {
          /**
           * An insertion effect processor parameter message (Roland GS).
           */
          type: "GS Insertion Param";
          /**
           * The parameter name that was modified in the processor.
           */
          parameter:
              | "sendLevelToReverb"
              | "sendLevelToChorus"
              | "sendLevelToDelay";
          /**
           * The new value of the parameter.
           */
          value: number;
      }
    | {
          /**
           * An insertion effect processor parameter message (Roland GS).
           */
          type: "GS Insertion Param";
          /**
           * The parameter number that was modified in the processor, a 0-based number.
           * These are effect-specific.
           */
          parameter: number;
          /**
           * The new value of the parameter.
           */
          value: number;
      };

/**
 * Represents an analyzed Yamaha XG Reverb Processor change.
 *
 * @group MIDI.Protocol
 */
export type XGReverbParameterMessage =
    | {
          /**
           * A reverb effect processor parameter message (Yamaha XG).
           */
          type: "XG Reverb Param";
          /**
           * The reverb type, stored as a 16-bit number `MSB << 8 | LSB`.
           */
          parameter: "type";
          /**
           * The value, stored as `MSB << 8 | LSB`.
           */
          value: number;
      }
    | {
          /**
           * A reverb effect processor parameter message (Yamaha XG).
           */
          type: "XG Reverb Param";
          /**
           * Mixer setting for the reverb block.
           */
          parameter: "return" | "pan";
          /**
           * The new value of the parameter (0-127).
           */
          value: number;
      }
    | {
          /**
           * A reverb effect processor parameter message (Yamaha XG).
           */
          type: "XG Reverb Param";
          /**
           * The 0-based type-specific parameter number (0-15).
           * Meaning depends on the current `type`.
           */
          parameter: number;
          /**
           * The new value of the parameter (0-127).
           */
          value: number;
      };
/**
 * Represents an analyzed Yamaha XG Chorus Processor change.
 *
 * @group MIDI.Protocol
 */
export type XGChorusParameterMessage =
    | {
          /**
           * A chorus effect processor parameter message (Yamaha XG).
           */
          type: "XG Chorus Param";
          /**
           * The chorus type, stored as a 16-bit number `MSB << 8 | LSB`.
           */
          parameter: "type";
          /**
           * The value, stored as `MSB << 8 | LSB`.
           */
          value: number;
      }
    | {
          /**
           * A chorus effect processor parameter message (Yamaha XG).
           */
          type: "XG Chorus Param";
          /**
           * Mixer/routing setting for the chorus block.
           */
          parameter: "return" | "pan" | "sendToReverb";
          /**
           * The new value of the parameter (0-127).
           */
          value: number;
      }
    | {
          /**
           * A chorus effect processor parameter message (Yamaha XG).
           */
          type: "XG Chorus Param";
          /**
           * The 0-based type-specific parameter number (0-15).
           * Meaning depends on the current `type`.
           */
          parameter: number;
          /**
           * The new value of the parameter (0-127).
           */
          value: number;
      };
/**
 * Variation connection mode:
 * - `system` routes all channels via sends (like reverb and chorus).
 * - `insertion` routes a single `partNumber` channel straight through.
 *
 * @group MIDI.Protocol
 */
export type XGVariationConnection = "system" | "insertion";
/**
 * Represents an analyzed Yamaha XG Variation Processor change.
 *
 * Variation runs either as a system effect (all channels via sends, similarly to reverb and chorus and using the same CC as the GS delay)
 * or as an insertion effect (single `partNumber` channel routed straight
 * through it), selected by `connection`.
 *
 * @group MIDI.Protocol
 */
export type XGVariationParameterMessage =
    | {
          /**
           * A variation effect processor parameter message (Yamaha XG).
           */
          type: "XG Variation Param";
          /**
           * The variation type, stored as a 16-bit number `MSB << 8 | LSB`.
           */
          parameter: "type";
          /**
           * The value, stored as `MSB << 8 | LSB`.
           */
          value: number;
      }
    | {
          /**
           * A variation effect processor parameter message (Yamaha XG).
           */
          type: "XG Variation Param";
          /**
           * Mixer/routing setting for the variation block.
           *
           * `partNumber` is the channel routed through the variation effect in the insertion mode.
           * (0-63 parts, 127 OFF).
           */
          parameter:
              | "return"
              | "pan"
              | "sendToReverb"
              | "sendToChorus"
              | "partNumber";
          /**
           * The new value of the parameter (0-127).
           */
          value: number;
      }
    | {
          /**
           * A variation effect processor parameter message (Yamaha XG).
           */
          type: "XG Variation Param";
          /**
           * Switches the variation block between system and insertion mode.
           */
          parameter: "connection";
          /**
           * The connection mode.
           */
          value: XGVariationConnection;
      }
    | {
          /**
           * A variation effect processor parameter message (Yamaha XG).
           */
          type: "XG Variation Param";
          /**
           * The 0-based type-specific parameter number (0-15).
           * Meaning depends on the current `type`.
           */
          parameter: number;
          /**
           * The new value of the parameter, stored as a 14-bit number `(MSB << 7) | LSB`.
           * This is also the case for parameters 10-15! (MSB << 7)
           */
          value: number;
      };

/**
 * Represents an analyzed Yamaha XG Insertion Processor change (EFFECT 2).
 *
 * Insertion runs like variation in `insertion` mode, where it attaches to a single `partNumber` channel and its audio is routed straight through it.
 *
 * @group MIDI.Protocol
 */
export type XGInsertionParameterMessage =
    | {
          /**
           * An insertion effect processor parameter message (Yamaha XG).
           */
          type: "XG Insertion Param";
          /**
           * The insertion effect number.
           * For example 0 is the first insertion effect.
           */
          insertionNumber: number;
          /**
           * The insertion type, stored as a 16-bit number `MSB << 8 | LSB`.
           */
          parameter: "type";
          /**
           * The value, stored as `MSB << 8 | LSB`.
           */
          value: number;
      }
    | {
          /**
           * An insertion effect processor parameter message (Yamaha XG).
           */
          type: "XG Insertion Param";
          /**
           * The insertion effect number (second address byte).
           */
          insertionNumber: number;
          /**
           * The channel routed through the insertion effect
           * (0-63 parts, 64-126 A/D, 127 OFF).
           */
          parameter: "partNumber";
          /**
           * The new value of the parameter.
           */
          value: number;
      }
    | {
          /**
           * An insertion effect processor parameter message (Yamaha XG).
           */
          type: "XG Insertion Param";
          /**
           * The insertion effect number (second address byte).
           */
          insertionNumber: number;
          /**
           * The 0-based type-specific parameter number (0-15).
           * Meaning depends on the current `type`.
           */
          parameter: number;
          /**
           * The new value of the parameter, stored as a 14-bit number `(MSB << 7) | LSB`.
           * This is also the case for MSB only setters! (MSB << 7)
           */
          value: number;
      };

/**
 * Represents an analyzed channel drum setup parameter change, set via NRPN.
 *
 * > **Note**
 * >
 * > Channel number may be above 15 for multi-port MIDI setups.
 *
 * @group MIDI.Protocol
 */
export type ChannelDrumSetupMessage = {
    [K in keyof DrumParameter]: {
        /**
         * A drum setup parameter message, set by NRPN.
         */
        type: "Channel Drum Setup";
        /**
         * The MIDI channel number (it may be above 15).
         */
        channel: number;
        /**
         * The MIDI drum note number being modified.
         */
        key: number;
        /**
         * The drum parameter name.
         */
        parameter: K;
        /**
         * The value for the drum parameter.
         */
        value: DrumParameter[K];
    };
}[keyof DrumParameter];
/**
 * Represents an analyzed map drum setup parameter change, set via System Exclusive.
 *
 * @group MIDI.Protocol
 */
export type MapDrumSetupMessage = {
    [K in keyof DrumParameter]: {
        /**
         * A drum setup parameter message, set by SysEx.
         */
        type: "Map Drum Setup";
        /**
         * The drum map (or drum setup in XG) number, specifying which drum set to edit.
         */
        drumMap: number;
        /**
         * The MIDI drum note number being modified.
         */
        key: number;
        /**
         * The drum parameter name.
         */
        parameter: K;
        /**
         * The value for the drum parameter.
         */
        value: DrumParameter[K];
    };
}[keyof DrumParameter];
/**
 * The analysis result of an RPN (Registered Parameter Number) or NRPN (Non-Registered Parameter Number) MIDI message.
 *
 * > **Note**
 * >
 * > Channel number may be above 15 for multi-port MIDI setups.
 *
 * @group MIDI.Protocol
 */
export type AnalyzedParameter =
    | {
          /**
           * An unhandled or unrecognized parameter message.
           */
          type: "Other";
      }
    | {
          /**
           * A standard MIDI controller change mapped from an NRPN or parameter.
           */
          type: "Controller Change";
          /**
           * The MIDI controller being modified.
           */
          controller: MIDIController;
          /**
           * The 7-bit controller value (0-127).
           */
          value: number;
          /**
           * The MIDI channel number (it may be above 15).
           */
          channel: number;
      }
    | ChannelMIDIParameterMessage
    | ChannelDrumSetupMessage;
/**
 * The analysis result of a System Exclusive (SysEx) or (N)RPN MIDI message.
 *
 * Represents various parsed MIDI events, including effect parameters, channel setups,
 * program changes, display data, global parameters, user drum setups, and other analyzed parameters.
 *
 * @group MIDI.Protocol
 */
export type AnalyzedMIDIMessage =
    | AnalyzedParameter
    | GSReverbParameterMessage
    | GSChorusParameterMessage
    | GSDelayParameterMessage
    | GSInsertionParameterMessage
    | XGReverbParameterMessage
    | XGChorusParameterMessage
    | XGVariationParameterMessage
    | XGInsertionParameterMessage
    | {
          /**
           * An XG insertion (EFFECT2) message.
           */
          type: "XG Insertion Param";
      }
    | {
          /**
           * A MIDI program change message configured via System Exclusive.
           */
          type: "Program Change";
          /**
           * The MIDI channel number.
           */
          channel: number;
          /**
           * The MIDI program number (0-127).
           */
          value: number;
      }
    | {
          /**
           * A System Exclusive display data message (e.g., Roland GS or Yamaha XG LCD text or graphic display data).
           */
          type: "Display Data";
      }
    | GlobalMIDIParameterMessage
    | {
          [K in keyof UserDrumSetParameter]: {
              /**
               * A user drum set parameter setup message.
               */
              type: "User Drum Setup";
              /**
               * The 0-based user drum set index.
               */
              drumSet: number;
              /**
               * The MIDI note number within the user drum set.
               */
              midiNote: number;
              /**
               * The user drum set parameter name.
               */
              parameter: K;
              /**
               * The value for the user drum set parameter.
               */
              value: UserDrumSetParameter[K];
          };
      }[keyof UserDrumSetParameter]
    | MapDrumSetupMessage;
/**
 * The analysis result of a System Exclusive (SysEx) MIDI message.
 *
 * @group MIDI.Protocol
 */
export type AnalyzedSysExMessage = Exclude<
    AnalyzedMIDIMessage,
    ChannelDrumSetupMessage
>;
