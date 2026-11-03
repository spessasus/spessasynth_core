import {
    BasicInstrument,
    type BasicInstrumentZone,
    BasicPreset,
    BasicSample,
    BasicSoundBank,
    type GeneratorType,
    GeneratorTypes,
    SampleTypes,
    SoundBankLoader,
    SpessaLog,
    SpessaSynthProcessor
} from "../../../src";

// The channels look for a preset before the bank is added, which warns on every render
SpessaLog.warnEnabled = false;

export const SAMPLE_RATE = 44_100;
export const QUANTUM = 128;

let failures = 0;

/**
 * Logs a check and counts it as failed if the condition is false.
 */
export function check(condition: boolean, message: string) {
    if (condition) {
        console.info(`  ok   ${message}`);
    } else {
        failures++;
        console.error(`  FAIL ${message}`);
    }
}

/**
 * Prints the result and exits with code 1 if any check failed.
 */
export function finish(name: string) {
    if (failures > 0) {
        console.error(`${name}: ${failures} check(s) failed!`);
        process.exit(1);
    }
    console.info(`${name}: all checks passed!`);
}

/**
 * A looped sine at 440 Hz, root key 69.
 */
export function sineSample() {
    const length = SAMPLE_RATE;
    const data = new Float32Array(length);
    // 440 Hz fits 440 whole cycles into one second, so the loop is seamless
    for (let i = 0; i < length; i++)
        data[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE);
    const s = new BasicSample(
        "sine",
        SAMPLE_RATE,
        69,
        0,
        SampleTypes.monoSample,
        0,
        length
    );
    s.setAudioData(data, SAMPLE_RATE);
    return s;
}

/**
 * Looped white noise, root key 60.
 */
export function noiseSample() {
    const length = SAMPLE_RATE;
    const data = new Float32Array(length);
    // Fixed seed so every run is the same
    let seed = 12_345;
    for (let i = 0; i < length; i++) {
        seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
        data[i] = (seed / 2_147_483_648) * 2 - 1;
    }
    const s = new BasicSample(
        "noise",
        SAMPLE_RATE,
        60,
        0,
        SampleTypes.monoSample,
        0,
        length
    );
    s.setAudioData(data, SAMPLE_RATE);
    return s;
}

/**
 * Builds a bank with one preset (0:0) holding one instrument zone with the given sample.
 * The zone loops and has a fast release unless the generators say otherwise.
 */
export function makeBank(
    sample: BasicSample,
    generators: Partial<Record<GeneratorType, number>> = {},
    configure?: (zone: BasicInstrumentZone, bank: BasicSoundBank) => void
) {
    const bank = new BasicSoundBank();
    bank.addSamples(sample);
    const inst = new BasicInstrument();
    inst.name = "test";
    const zone = inst.createZone(sample);
    zone.setGenerator(GeneratorTypes.sampleModes, 1);
    zone.setGenerator(GeneratorTypes.releaseVolEnv, -7200);
    for (const [type, value] of Object.entries(generators))
        zone.setGenerator(Number(type) as GeneratorType, value);
    configure?.(zone, bank);
    bank.addInstruments(inst);
    const preset = new BasicPreset(bank);
    preset.name = "test";
    preset.createZone(inst);
    bank.addPresets(preset);
    bank.flush();
    return bank;
}

export interface RenderEvent {
    time: number;
    run: (synth: SpessaSynthProcessor) => void;
}

/**
 * Renders the bank on channel 0, applying the events at their times (rounded to the quantum).
 * @returns the left channel.
 */
export async function render(
    bank: BasicSoundBank,
    events: RenderEvent[],
    seconds: number
) {
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    synth.soundBankManager.addSoundBank(bank, "main");
    await synth.ready;
    const count = Math.ceil(seconds * SAMPLE_RATE);
    const left = new Float32Array(count);
    const right = new Float32Array(count);
    const done = new Set<RenderEvent>();
    let voicesAtEnd = 0;
    for (let i = 0; i < count; i += QUANTUM) {
        for (const e of events) {
            if (done.has(e) || e.time * SAMPLE_RATE > i) continue;
            done.add(e);
            e.run(synth);
        }
        synth.process(left, right, i, Math.min(QUANTUM, count - i));
        voicesAtEnd = synth.voiceCount;
    }
    return { left, right, voicesAtEnd };
}

/**
 * Renders like {@link render} and returns only the left channel.
 */
export async function renderLeft(
    bank: BasicSoundBank,
    events: RenderEvent[],
    seconds: number
) {
    const { left } = await render(bank, events, seconds);
    return left;
}

/**
 * Note on at the time, and note off after the length (if given).
 */
export function note(
    time: number,
    length?: number,
    key = 69,
    velocity = 127
): RenderEvent[] {
    const events: RenderEvent[] = [
        { time, run: (s) => s.noteOn(0, key, velocity) }
    ];
    if (length !== undefined)
        events.push({ time: time + length, run: (s) => s.noteOff(0, key) });
    return events;
}

/**
 * RMS level in dB of the buffer between the two times.
 */
export function levelDb(buffer: Float32Array, from: number, to: number) {
    const start = Math.floor(from * SAMPLE_RATE);
    const end = Math.min(buffer.length, Math.floor(to * SAMPLE_RATE));
    let sum = 0;
    for (let i = start; i < end; i++) sum += buffer[i] * buffer[i];
    const rms = Math.sqrt(sum / Math.max(1, end - start));
    return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

/**
 * Frequency in Hz from the rising zero crossings between the two times.
 */
export function frequency(buffer: Float32Array, from: number, to: number) {
    const start = Math.floor(from * SAMPLE_RATE);
    const end = Math.min(buffer.length, Math.floor(to * SAMPLE_RATE));
    let first = -1;
    let last = -1;
    let crossings = 0;
    for (let i = start + 1; i < end; i++) {
        if (buffer[i - 1] <= 0 && buffer[i] > 0) {
            // Interpolate the crossing point
            const t = i - 1 + -buffer[i - 1] / (buffer[i] - buffer[i - 1]);
            if (first < 0) first = t;
            else crossings++;
            last = t;
        }
    }
    return crossings > 0 ? (crossings * SAMPLE_RATE) / (last - first) : 0;
}

/**
 * Index of the first sample with an absolute value above the threshold, or -1.
 */
export function firstSound(buffer: Float32Array, threshold = 1e-4) {
    return buffer.findIndex((v) => Math.abs(v) > threshold);
}

/**
 * Index of the last sample with an absolute value above the threshold, or -1.
 */
export function lastSound(buffer: Float32Array, threshold = 1e-4) {
    for (let i = buffer.length - 1; i >= 0; i--)
        if (Math.abs(buffer[i]) > threshold) return i;
    return -1;
}

/**
 * Largest absolute difference between two buffers.
 */
export function maxDifference(a: Float32Array, b: Float32Array) {
    let diff = 0;
    for (let i = 0; i < a.length; i++)
        diff = Math.max(diff, Math.abs(a[i] - b[i]));
    return diff;
}

/**
 * Writes the bank as SFE and reads it back.
 */
export function sfeRoundTrip(bank: BasicSoundBank) {
    return SoundBankLoader.fromArrayBuffer(bank.writeSFE());
}

/**
 * Writes the bank as SF2 and reads it back.
 */
export function sf2RoundTrip(bank: BasicSoundBank) {
    return SoundBankLoader.fromArrayBuffer(bank.writeSF2());
}

/**
 * The value of a generator in the first instrument zone, or undefined.
 */
export function zoneGenerator(bank: BasicSoundBank, type: GeneratorType) {
    return bank.instruments[0].zones[0].generators.find((g) => g.type === type)
        ?.value;
}

/**
 * Checks that the generators survive an SFE round trip and are dropped by an SF2 one.
 */
export function checkStorage(bank: BasicSoundBank, types: GeneratorType[]) {
    const sfe = sfeRoundTrip(bank);
    const sf2 = sf2RoundTrip(bank);
    for (const type of types) {
        const value = zoneGenerator(bank, type);
        check(
            zoneGenerator(sfe, type) === value,
            `generator ${type} kept by SFE (${value})`
        );
        check(
            zoneGenerator(sf2, type) === undefined,
            `generator ${type} dropped by SF2`
        );
    }
}
