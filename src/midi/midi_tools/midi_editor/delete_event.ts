import { SpessaLog } from "../../../utils/loggin";
import { ConsoleColors } from "../../../utils/other";
import type { EventCursor } from "./event_cursor";
import type { ChannelStatus, EditContext } from "./types";

/**
 * Deletes the current event, or the whole N/RPN parameter if the current event is its data entry.
 * @param ctx The edit context.
 */
export function deleteCurrentEvent(ctx: EditContext) {
    const { cursor } = ctx;
    if (cursor.parameterChannel !== -1) {
        deleteCurrentParameter(cursor, ctx.channels[cursor.parameterChannel]);
        return;
    }
    cursor.deleteCurrent();
}

/**
 * Deletes the current data entry with its parameter selection.
 * @param cursor The cursor, at the data entry.
 * @param ch The channel of the parameter.
 */
function deleteCurrentParameter(cursor: EventCursor, ch: ChannelStatus) {
    // Delete the parameter selection pair + the data entry that we're currently processing.
    // We don't wait for lsb as it's not required to arrive :-(
    // Why, MIDI, why are you like this?
    // Now I have to handle this complex mess that has to work for either single or double data...
    // And both parameters aren't even required to be sent! Well, they are! But some files don't care.
    // And Sound Canvases don't seem to care either...

    // Testcase: MIDI_Jam & Spoon_Right In The Night.mid, channel 12.
    // That's why we track what we can and can't delete.
    const p = ch.param;
    const [msbCC, lsbCC] = p.paramControllers;
    const msb = p.paramMSB;
    const lsb = p.paramLSB;

    // Delete the current data entry event first.
    // This is safe because it's the event currently being processed in the loop,
    // Meaning its index is always higher than or equal
    // To the cached MSB/LSB (possibly on a different track).
    if (!ch.clearedParams.data) {
        cursor.deleteCurrent();
        SpessaLog.info(
            `%cClearing Non/Registered Parameter on %c${ch.channel}%c. (Current data entry)`,
            ConsoleColors.info,
            ConsoleColors.recognized,
            ConsoleColors.info
        );

        // Flag data as deleted
        ch.clearedParams.data = true;
    }

    // Delete params

    // The cached MSB/LSB indexes are kept valid by the cursor's `deleteAt`.
    // It shifts all cached indexes whenever an event is deleted.
    // The output no longer has them, but a later kept data entry may still rely on them.
    if (!ch.clearedParams.selection[msbCC]) {
        // Delete param MSB
        cursor.deleteAt(msb.track, msb.event);
        ch.selectionModified[msbCC] = true;

        // Flag MSB as deleted
        ch.clearedParams.selection[msbCC] = true;

        SpessaLog.info(
            `%cClearing Non/Registered Parameter on %c${ch.channel}%c. (Param MSB)`,
            ConsoleColors.info,
            ConsoleColors.recognized,
            ConsoleColors.info
        );
    }

    if (ch.clearedParams.selection[lsbCC]) {
        return;
    }

    // Delete param LSB
    cursor.deleteAt(lsb.track, lsb.event);
    ch.selectionModified[lsbCC] = true;

    // Flag LSB as deleted
    ch.clearedParams.selection[lsbCC] = true;

    SpessaLog.info(
        `%cClearing Non/Registered Parameter on %c${ch.channel}%c. (Param LSB)`,
        ConsoleColors.info,
        ConsoleColors.recognized,
        ConsoleColors.info
    );
}
