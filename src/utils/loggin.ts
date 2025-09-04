let ENABLE_INFO = false;
let ENABLE_WARN = true;
let ENABLE_GROUP = false;

/**
 * Enables or disables logging.
 * @param enableInfo enables info.
 * @param enableWarn enables warning.
 * @param enableGroup enables groups.
 */
export function SpessaSynthLogging(
    enableInfo: boolean,
    enableWarn: boolean,
    enableGroup: boolean
) {
    ENABLE_INFO = enableInfo;
    ENABLE_WARN = enableWarn;
    ENABLE_GROUP = enableGroup;
}

export function SpessaSynthInfo(...message: unknown[]) {
    if (ENABLE_INFO) {
        console.info(...message);
    }
}

export function SpessaSynthWarn(...message: unknown[]) {
    if (ENABLE_WARN) {
        console.warn(...message);
    }
}

export function SpessaSynthGroup(...message: unknown[]) {
    if (ENABLE_GROUP) {
        console.group(...message);
    }
}

export function SpessaSynthGroupCollapsed(...message: unknown[]) {
    if (ENABLE_GROUP) {
        console.groupCollapsed(...message);
    }
}

export function SpessaSynthGroupEnd() {
    if (ENABLE_GROUP) {
        console.groupEnd();
    }
}
