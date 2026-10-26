/**
 * The number of bytes each pattern cell takes up.
 */
const CELL_SIZE = 5;

/**
 * No note in the cell.
 */
export const NOTE_NONE = 0;
/**
 * The highest playable note (B-9), notes are one-based.
 */
export const NOTE_MAX = 120;
/**
 * Note cut (^^ in Scream Tracker).
 */
export const NOTE_CUT = 253;
/**
 * Key off (=== in Fast Tracker).
 */
export const NOTE_OFF = 254;

/**
 * A pattern of a tracker module.
 * Each cell stores a note, an instrument, a volume column value, an effect and its parameter.
 * The effect numbering and the volume column meaning are specific to the module format.
 */
export class TrackerPattern {
    public readonly rows: number;
    public readonly channels: number;
    private readonly data: Uint8Array;

    public constructor(rows: number, channels: number) {
        this.rows = rows;
        this.channels = channels;
        this.data = new Uint8Array(rows * channels * CELL_SIZE);
    }

    /**
     * Writes a cell.
     * @param row The row index.
     * @param channel The channel index.
     * @param note The one-based note, or one of the special note values.
     * @param instrument The one-based instrument, 0 means none.
     * @param volume The format-specific volume column value, 0 means none.
     * @param effect The format-specific effect number.
     * @param param The effect parameter.
     */
    public setCell(
        row: number,
        channel: number,
        note: number,
        instrument: number,
        volume: number,
        effect: number,
        param: number
    ) {
        const offset = (row * this.channels + channel) * CELL_SIZE;
        this.data[offset] = note;
        this.data[offset + 1] = instrument;
        this.data[offset + 2] = volume;
        this.data[offset + 3] = effect;
        this.data[offset + 4] = param;
    }

    /**
     * Gets the byte offset of a cell, used with the get methods.
     * @param row The row index.
     * @param channel The channel index.
     */
    public getCellOffset(row: number, channel: number) {
        return (row * this.channels + channel) * CELL_SIZE;
    }

    public getNote(offset: number) {
        return this.data[offset];
    }

    public getInstrument(offset: number) {
        return this.data[offset + 1];
    }

    public getVolume(offset: number) {
        return this.data[offset + 2];
    }

    public getEffect(offset: number) {
        return this.data[offset + 3];
    }

    public getParam(offset: number) {
        return this.data[offset + 4];
    }
}
