/**
 * @this {SpessaSynthProcessor}
 */
export function updatePresetList()
{
    /**
     * @type {{bank: number, presetName: string, program: number}[]}
     */
    const mainFont = this.soundfontManager.getPresetList();
    this.clearCache();
    this.callEvent("presetlistchange", mainFont);
    this.getDefaultPresets();
    // unlock presets
    this.midiAudioChannels.forEach(c =>
    {
        c.setPresetLock(false);
    });
    this.resetAllControllers(false);
}