import type { ChannelModification, ModifyMIDIOptions } from "./types";

/**
 * Parses the modify options once for the whole edit.
 * @param opts The modify options.
 * @returns The parsed options.
 */
export function parseEditOptions(opts: ModifyMIDIOptions) {
    const { channels, ...globalOptions } = opts;

    // Track only channels to change here
    const channelChanges = new Map<number, ChannelModification>();
    const clearedChannels = new Set<number>();
    if (channels) {
        for (const [channel, ch] of channels) {
            if (ch === "clear") clearedChannels.add(channel);
            else channelChanges.set(channel, ch);
        }
    }

    const hasXGEffects =
        (Boolean(opts.xgReverbParams) && opts.xgReverbParams !== "clear") ||
        (Boolean(opts.xgChorusParams) && opts.xgChorusParams !== "clear") ||
        (Boolean(opts.xgVariationParams) &&
            opts.xgVariationParams !== "clear") ||
        [...(opts.xgInsertionParams?.values() ?? [])].some(
            (p) => p !== "clear"
        );
    const hasGSEffects =
        (Boolean(opts.gsReverbParams) && opts.gsReverbParams !== "clear") ||
        (Boolean(opts.gsChorusParams) && opts.gsChorusParams !== "clear") ||
        (Boolean(opts.gsDelayParams) && opts.gsDelayParams !== "clear") ||
        (Boolean(opts.gsEqualizerParams) &&
            opts.gsEqualizerParams !== "clear") ||
        (Boolean(opts.gsInsertionParams) && opts.gsInsertionParams !== "clear");

    // Are only xg changes requested?
    const xgOnly = hasXGEffects && !hasGSEffects;

    return {
        ...globalOptions,
        channelChanges,
        clearedChannels,
        hasGSEffects,
        hasXGEffects,
        // A meaningful GM reset gets replaced (unless GM is requested).
        // XG when only XG setups are requested, otherwise they would never be written
        gmReplacement: opts.fallbackReset ?? (xgOnly ? "xg" : "gs")
    };
}
