import { arrayToHexString, consoleColors } from "../../../utils/other";
import { SpessaSynthInfo } from "../../../utils/loggin";
import { ALL_CHANNELS_OR_DIFFERENT_ACTION } from "../engine_components/synth_constants";
import { type SysExAcceptedArray } from "./system_exclusive/helpers";
import { handleGM } from "./system_exclusive/handle_gm";
import { handleGS } from "./system_exclusive/handle_gs";
import { handleXG } from "./system_exclusive/handle_xg";
import type { SynthesizerCore } from "../synthesizer_core";

/**
 * Executes a system exclusive message for the synthesizer.
 * @param syx The system exclusive message as an array of bytes.
 * @param channelOffset The channel offset to apply (default is 0).
 * @remarks
 * This is a rather extensive method that handles various system exclusive messages,
 * including Roland GS, MIDI Tuning Standard, and other non-realtime messages.
 */
export function systemExclusiveInternal(
    this: SynthesizerCore,
    syx: SysExAcceptedArray,
    channelOffset: number
) {
    const manufacturer = syx[0];
    // Ensure that the device ID matches
    if (
        // The device ID can be set to "all" which it is by default
        this.masterParameters.deviceID !== ALL_CHANNELS_OR_DIFFERENT_ACTION &&
        syx[1] !== 0x7f && // 0x7f means broadcast, i.e. all MIDI devices
        this.masterParameters.deviceID !== syx[1]
    ) {
        // Not our device ID
        return;
    }

    switch (manufacturer) {
        default: {
            SpessaSynthInfo(
                `%cUnknown manufacturer: %c${arrayToHexString(syx)}`,
                consoleColors.warn,
                consoleColors.unrecognized
            );
            break;
        }

        // Non realtime GM
        case 0x7e:
        // Realtime GM
        case 0x7f: {
            handleGM.call(this, syx, channelOffset);
            break;
        }

        // Roland
        case 0x41: {
            handleGS.call(this, syx, channelOffset);
            break;
        }

        // Yamaha
        case 0x43: {
            handleXG.call(this, syx, channelOffset);
            break;
        }
    }
}
