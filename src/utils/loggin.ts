import type { SysExAcceptedArray } from "../midi/types";
import { arrayToHexString, ConsoleColors } from "./other";

/**
 * Manage the log level of `spessasynth_core`.
 */
export class SpessaSynthLog {
    /**
     * The most verbose log level, prints out a lot of small details.
     */
    public static infoEnabled = false;

    /**
     * The default log level, prints out warnings for unexpected and erroneous behavior.
     */
    public static warnEnabled = true;

    /**
     * If grouping of the log messages is allowed. Recommended for the `info` verbosity level.
     */
    public static groupEnabled = false;

    /**
     * Enables or disables logging.
     * @param enableInfo enables info.
     * @param enableWarn enables warning.
     * @param enableGroup enables groups.
     */
    public static setLogLevel(
        enableInfo: boolean,
        enableWarn: boolean,
        enableGroup: boolean
    ) {
        this.infoEnabled = enableInfo;
        this.warnEnabled = enableWarn;
        this.groupEnabled = enableGroup;
    }

    public static info(...message: unknown[]) {
        if (this.infoEnabled) console.info(...message);
    }

    public static warn(...message: unknown[]) {
        if (this.warnEnabled) console.warn(...message);
    }

    public static group(...message: unknown[]) {
        if (this.groupEnabled) console.group(...message);
    }

    public static groupCollapsed(...message: unknown[]) {
        if (this.groupEnabled) console.groupCollapsed(...message);
    }

    public static groupEnd() {
        if (this.groupEnabled) console.groupEnd();
    }

    /**
     * @internal
     */
    public static unsupported(
        what: string,
        syx: SysExAcceptedArray,
        reason = ""
    ) {
        if (this.infoEnabled)
            this.info(
                `%cUnsupported %c${what}%c message: %c${arrayToHexString(syx)}%c. ${reason}`,
                ConsoleColors.warn,
                ConsoleColors.recognized,
                ConsoleColors.warn,
                ConsoleColors.unrecognized,
                ConsoleColors.warn
            );
    }

    /**
     * @internal
     */
    public static gmInfo(what: string, value: number | string, unit = "") {
        if (this.infoEnabled)
            this.coolInfo(`General MIDI ${what}`, value, unit);
    }

    /**
     * @internal
     */
    public static gmFail(what: string, syx: SysExAcceptedArray) {
        if (this.infoEnabled) this.unsupported(`General MIDI ${what}`, syx);
    }

    /**
     * @internal
     */
    public static gsInfo(what: string, value: number | string, unit = "") {
        if (this.infoEnabled) this.coolInfo(`Roland GS ${what}`, value, unit);
    }

    /**
     * @internal
     */
    public static gsFail(what: string, syx: SysExAcceptedArray, reason = "") {
        if (this.infoEnabled)
            this.unsupported(`Roland GS ${what}`, syx, reason);
    }

    /**
     * @internal
     */
    public static xgInfo(what: string, value: number | string, unit = "") {
        if (this.infoEnabled) this.coolInfo(`Yamaha XG ${what}`, value, unit);
    }

    /**
     * @internal
     */
    public static xgFail(what: string, syx: SysExAcceptedArray, reason = "") {
        if (this.infoEnabled)
            this.unsupported(`Yamaha XG ${what}`, syx, reason);
    }

    /**
     * @internal
     */
    public static coolInfo(what: string, value: number | string, unit = "") {
        if (!this.infoEnabled) return;
        if (unit)
            SpessaSynthLog.info(
                `%c${what} is now set to %c${value}%c ${unit}.`,
                ConsoleColors.info,
                ConsoleColors.value,
                ConsoleColors.info
            );
        else
            SpessaSynthLog.info(
                `%c${what} is now set to %c${value}%c.`,
                ConsoleColors.info,
                ConsoleColors.value,
                ConsoleColors.info
            );
    }
}
