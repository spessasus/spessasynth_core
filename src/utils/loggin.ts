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
}
