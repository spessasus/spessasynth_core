import type { SysExAcceptedArray } from "../midi/types";
import { arrayToHexString, ConsoleColors } from "./other";

/**
 * SpessaSynth can print out additional info to the console or print nothing at all.
 *
 * This class manages the log level of `spessasynth_core`.
 *
 * > **Tip**
 * >
 * > You can log information as `spessasynth_core` by calling the console-like methods,
 * > such as `.info`, `.warn`, `.group`, etc.
 *
 * @group Utilities
 */
export class SpessaLog {
    /**
     * The most verbose log level, prints out a lot of small details.
     * Disabled by default.
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
     * The log functions that get called with the data.
     * By default, they use `console` object.
     *
     * This may be overridden to capture the spessasynth log data.
     */
    public static logFunctions = {
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        group: console.group.bind(console),
        groupEnd: console.groupEnd.bind(console),
        groupCollapsed: console.groupCollapsed.bind(console)
    };

    /**
     * Enables or disables logging at various levels.
     * All the input variables are booleans corresponding to the things SpessaSynth logs.
     * @param enableInfo enables info: all general info such as parsing sound banks, MIDI files, RPN changes, etc.
     * @param enableWarn enables warning: all messages unrecognized by the synthesizer, other warnings.
     * @param enableGroup enables groups: the groups for parsing the sound banks and MIDI files.
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

    /**
     * Equivalent to `console.info`.
     * @param message
     */
    public static info(...message: unknown[]) {
        if (this.infoEnabled) this.logFunctions.info(...message);
    }

    /**
     * Equivalent to `console.warn`.
     * @param message
     */
    public static warn(...message: unknown[]) {
        if (this.warnEnabled) this.logFunctions.warn(...message);
    }

    /**
     * Equivalent to `console.group`.
     * @param message
     */
    public static group(...message: unknown[]) {
        if (this.groupEnabled) this.logFunctions.group(...message);
    }

    /**
     * Equivalent to `console.groupCollapsed`.
     * @param message
     */
    public static groupCollapsed(...message: unknown[]) {
        if (this.groupEnabled) this.logFunctions.groupCollapsed(...message);
    }

    /**
     * Equivalent to `console.groupEnd`.
     */
    public static groupEnd() {
        if (this.groupEnabled) this.logFunctions.groupEnd();
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
    public static coolInfo(
        what: string,
        value: number | string | boolean,
        unit = ""
    ) {
        if (!this.infoEnabled) return;
        if (unit)
            SpessaLog.info(
                `%c${what}%c is now set to %c${value}%c ${unit}.`,
                ConsoleColors.recognized,
                ConsoleColors.info,
                ConsoleColors.value,
                ConsoleColors.info
            );
        else
            SpessaLog.info(
                `%c${what}%c is now set to %c${value}%c.`,
                ConsoleColors.recognized,
                ConsoleColors.info,
                ConsoleColors.value,
                ConsoleColors.info
            );
    }
}
