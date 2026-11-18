import type { ChannelMIDIParameter } from "./parameters/midi";
import {
    type MatrixDestination,
    MatrixDestinations,
    type MatrixSource,
    MatrixSources
} from "./enums";
import { MIDIControllers } from "../../../midi/enums";

const SOURCE_COUNT = 6;
export const MATRIX_DESTINATION_COUNT = 11;
/**
 * The output row of the whole channel. Rows 0 to 127 are the per-key rows for poly pressure.
 */
export const MATRIX_CHANNEL_ROW = 128 * MATRIX_DESTINATION_COUNT;

const D = MatrixDestinations;

/**
 * Centered destinations rest at 64, the LFO depths at 0.
 */
const NEUTRAL = new Uint8Array(MATRIX_DESTINATION_COUNT);
NEUTRAL[D.pitch] = 64;
NEUTRAL[D.cutoff] = 64;
NEUTRAL[D.amplitude] = 64;
NEUTRAL[D.lfo1Rate] = 64;
NEUTRAL[D.lfo2Rate] = 64;

/**
 * The full range of each destination, from the SC-88Pro and XG manuals.
 * Centered cells scale (value - 64) / 64 onto it (pitch is in semitone steps instead),
 * the LFO depths scale value / 127 onto it.
 * Pitch, cutoff and the LFO pitch and filter depths are cents, the rates are Hz,
 * the amplitude and the LFO amplitude depths are fractions (100 % = 1).
 */
const RANGE = new Float64Array(MATRIX_DESTINATION_COUNT);
RANGE[D.cutoff] = 9600;
RANGE[D.amplitude] = 1;
RANGE[D.lfo1Rate] = 10;
RANGE[D.lfo2Rate] = 10;
RANGE[D.lfo1Pitch] = 600;
RANGE[D.lfo2Pitch] = 600;
RANGE[D.lfo1Filter] = 2400;
RANGE[D.lfo2Filter] = 2400;
RANGE[D.lfo1Amplitude] = 1;
RANGE[D.lfo2Amplitude] = 1;

/**
 * The state of a channel's GS and XG controller matrix, as stored in a channel snapshot.
 *
 * @group Synthesizer.Snapshots
 */
export interface ControllerMatrixSnapshot {
    /**
     * The system of the last written cell. GS applies amplitude linearly, XG in decibels.
     */
    system: "gs" | "xg";

    /**
     * The raw depth bytes, source * destination.
     */
    depths: Uint8Array;
}

/**
 * The GS and XG controller matrix of one channel.
 * Sources (mod wheel, pitch wheel, pressures and two assignable controllers)
 * drive pitch, cutoff, amplitude and the LFOs with depths set by System Exclusive.
 * @internal
 */
export class ControllerMatrix implements ControllerMatrixSnapshot {
    /**
     * The rules of the last written cell. GS applies amplitude linearly, XG in decibels.
     */
    public system: "gs" | "xg" = "gs";
    /**
     * True when any cell differs from its neutral value.
     */
    public active = false;
    /**
     * True when the poly pressure row is not neutral, the per-key rows are then used.
     */
    public polyPressureActive = false;
    /**
     * True when every per-key row is computed: the channel is in per-note pitch mode and a pitch wheel cell is set.
     */
    public perNoteRows = false;
    /**
     * Any LFO1 depth cell is set, so the vibrato LFO has to run even without depths of its own.
     */
    public lfo1Active = false;
    /**
     * Any LFO2 depth cell is set, so the modulation LFO has to run even without depths of its own.
     */
    public lfo2Active = false;

    /**
     * The raw depth bytes, source * destination.
     */
    public readonly depths = new Uint8Array(
        SOURCE_COUNT * MATRIX_DESTINATION_COUNT
    );

    /**
     * The outputs: 128 per-key rows and the channel row, each with one value per destination,
     * in the units of RANGE.
     */
    public readonly outputs = new Float64Array(
        MATRIX_CHANNEL_ROW + MATRIX_DESTINATION_COUNT
    );

    // Source values from 0 to 1 (the pitch wheel from -1 to 1), reused between the rows
    private readonly values = new Float64Array(SOURCE_COUNT);
    // The pitch wheel row is not neutral
    private pitchWheelActive = false;
    // CC 76 (vibrato rate) on the LFO1 rate, in Hz. It only counts while the matrix is on
    private vibratoRate = 0;

    public constructor() {
        this.reset();
    }

    /**
     * Gets a snapshot of this controller matrix.
     */
    public getSnapshot() {
        return {
            system: this.system,
            depths: this.depths.slice()
        } as ControllerMatrixSnapshot;
    }

    /**
     * Applies a snapshot to the controller matrix.
     * @param snapshot The snapshot to apply.
     */
    public applySnapshot(snapshot: ControllerMatrixSnapshot) {
        this.load(snapshot.system, snapshot.depths);
    }

    /**
     * Clears the table to neutral and turns the matrix off.
     */
    public reset() {
        for (let s = 0; s < SOURCE_COUNT; s++)
            this.depths.set(NEUTRAL, s * MATRIX_DESTINATION_COUNT);
        this.outputs.fill(0);
        this.system = "gs";
        this.active = false;
        this.polyPressureActive = false;
        this.pitchWheelActive = false;
        this.perNoteRows = false;
        this.lfo1Active = false;
        this.lfo2Active = false;
    }

    /**
     * Writes one cell. Switching between GS and XG rules clears the table first.
     * The caller recomputes.
     * @param rules the rules of the message
     * @param source the source row
     * @param destination the destination column
     * @param value the depth byte
     */
    public setCell(
        rules: "gs" | "xg",
        source: MatrixSource,
        destination: MatrixDestination,
        value: number
    ) {
        if (rules !== this.system) {
            this.reset();
            this.system = rules;
        }
        // Pitch control goes from -24 to +24 semitones on both
        if (destination === D.pitch)
            value = Math.max(0x28, Math.min(0x58, value));
        this.depths[source * MATRIX_DESTINATION_COUNT + destination] = value;
        this.updateFlags();
    }

    /**
     * Restores the whole table (from a snapshot). The caller recomputes.
     * @param rules the rules
     * @param depths the depth bytes, source * destination
     */
    public load(rules: "gs" | "xg", depths: Uint8Array) {
        this.reset();
        this.system = rules;
        this.depths.set(depths.subarray(0, this.depths.length));
        this.updateFlags();
    }

    /**
     * Recomputes the outputs from the current source values.
     * @param controllers the channel's controller table (14-bit values)
     * @param params the channel's MIDI parameters
     * @param polyPressures the per-key pressures
     * @param pitchWheels the per-key pitch wheels when the channel is in per-note pitch mode
     */
    public recompute(
        controllers: Int16Array,
        params: Readonly<ChannelMIDIParameter>,
        polyPressures: Uint8Array,
        pitchWheels?: Int16Array
    ) {
        if (!this.active) return;
        const v = this.values;
        v[MatrixSources.modulationWheel] = (controllers[1] >> 7) / 127;
        v[MatrixSources.pitchWheel] = (params.pitchWheel - 8192) / 8192;
        v[MatrixSources.channelPressure] = params.pressure / 127;
        v[MatrixSources.polyPressure] = 0;
        v[MatrixSources.cc1] = (controllers[params.cc1] >> 7) / 127;
        v[MatrixSources.cc2] = (controllers[params.cc2] >> 7) / 127;
        // Up to 10 Hz either way, for special cases such as J-Cycle.mid
        this.vibratoRate =
            ((controllers[MIDIControllers.vibratoRate] - 8192) / 8192) *
            RANGE[D.lfo1Rate];
        this.computeRow(MATRIX_CHANNEL_ROW);
        // Every key has its own pitch wheel in the per-note mode
        const perNote = pitchWheels !== undefined && this.pitchWheelActive;
        this.perNoteRows = perNote;
        if (!perNote && !this.polyPressureActive) return;
        for (let key = 0; key < 128; key++) {
            const p = polyPressures[key];
            if (perNote)
                v[MatrixSources.pitchWheel] = (pitchWheels[key] - 8192) / 8192;
            else if (p === 0) continue;
            v[MatrixSources.polyPressure] = p / 127;
            this.computeRow(key * MATRIX_DESTINATION_COUNT);
        }
    }

    private updateFlags() {
        const d = this.depths;
        let active = false;
        let paf = false;
        let pitchWheel = false;
        let lfo1 = false;
        let lfo2 = false;
        for (let s = 0; s < SOURCE_COUNT; s++) {
            const row = s * MATRIX_DESTINATION_COUNT;
            for (let dest = 0; dest < MATRIX_DESTINATION_COUNT; dest++) {
                if (d[row + dest] === NEUTRAL[dest]) continue;
                active = true;
                if (s === MatrixSources.polyPressure) paf = true;
                if (s === MatrixSources.pitchWheel) pitchWheel = true;
                if (dest >= D.lfo1Pitch && dest <= D.lfo1Amplitude) lfo1 = true;
                else if (dest >= D.lfo2Pitch) lfo2 = true;
            }
        }
        this.active = active;
        this.polyPressureActive = paf;
        this.pitchWheelActive = pitchWheel;
        this.lfo1Active = lfo1;
        this.lfo2Active = lfo2;
        if (!active) this.outputs.fill(0);
    }

    private computeRow(offset: number) {
        const depths = this.depths;
        const values = this.values;
        const out = this.outputs;
        for (let dest = 0; dest < MATRIX_DESTINATION_COUNT; dest++) {
            const neutral = NEUTRAL[dest];
            let sum = 0;
            for (let s = 0; s < SOURCE_COUNT; s++) {
                const d = depths[s * MATRIX_DESTINATION_COUNT + dest];
                if (d === neutral) continue;
                let scale;
                if (dest === D.pitch) {
                    // One semitone per step
                    scale = (d - 64) * 100;
                } else if (neutral === 64) {
                    scale = ((d - 64) / 64) * RANGE[dest];
                } else {
                    scale = (d / 127) * RANGE[dest];
                }
                sum += scale * values[s];
            }
            out[offset + dest] = sum;
        }
        out[offset + D.lfo1Rate] += this.vibratoRate;
    }
}
