// SampleModes 4 (alternating loop) must play exactly like the same loop unrolled into a forward loop,
// With every interpolation, including the turns and pitched up playback
import {
    BasicSample,
    BasicSoundBank,
    GeneratorTypes,
    InterpolationTypes,
    SampleTypes,
    SpessaSynthProcessor
} from "../../../src";
import {
    check,
    finish,
    makeBank,
    QUANTUM,
    SAMPLE_RATE,
    sf2RoundTrip,
    sfeRoundTrip
} from "./sfe_test_utils";

const LENGTH = 3000;

// Smooth noise, so the interpolators have something to do
const data = new Float32Array(LENGTH);
let seed = 4321;
let value = 0;
for (let i = 0; i < LENGTH; i++) {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    value = value * 0.9 + (seed / 2_147_483_648 - 0.5) * 0.4;
    data[i] = value;
}

function sample(name: string, audio: Float32Array, start: number, end: number) {
    const s = new BasicSample(
        name,
        SAMPLE_RATE,
        60,
        0,
        SampleTypes.monoSample,
        start,
        end
    );
    s.setAudioData(audio, SAMPLE_RATE);
    return s;
}

// The same loop unrolled: forward to the end turn, then back without repeating either turn point
function banks(loopStart: number, loopEnd: number) {
    // Back from the point before the end turn to the point after the start turn
    const backLength = loopEnd - loopStart - 2;
    const unrolled = new Float32Array(loopEnd + backLength);
    unrolled.set(data.subarray(0, loopEnd));
    for (let i = 0; i < backLength; i++)
        unrolled[loopEnd + i] = data[loopEnd - 2 - i];
    return {
        alternating: makeBank(sample("alternating", data, loopStart, loopEnd), {
            [GeneratorTypes.sampleModes]: 4
        }),
        reference: makeBank(
            sample("unrolled", unrolled, loopStart, unrolled.length),
            { [GeneratorTypes.sampleModes]: 1 }
        )
    };
}

async function renderNote(
    bank: BasicSoundBank,
    interpolation: number,
    key: number
) {
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: false,
        eventsEnabled: false
    });
    synth.setSystemParameter(
        "interpolationType",
        interpolation as (typeof InterpolationTypes)[keyof typeof InterpolationTypes]
    );
    synth.soundBankManager.addSoundBank(bank, "main");
    await synth.ready;
    const count = SAMPLE_RATE;
    const left = new Float32Array(count);
    const right = new Float32Array(count);
    synth.noteOn(0, key, 127);
    for (let i = 0; i < count; i += QUANTUM) {
        synth.process(left, right, i, Math.min(QUANTUM, count - i));
    }
    return left;
}

// A long loop (turn points 700 and 1899) and a very short one (turn points 700 and 702)
for (const [loopStart, loopEnd] of [
    [700, 1900],
    [700, 703]
]) {
    const { alternating, reference } = banks(loopStart, loopEnd);
    for (const [name, interpolation] of Object.entries(InterpolationTypes)) {
        // Key 60 plays at the root, 79 more than 3 points per output sample, 41 below one
        for (const key of [60, 79, 41]) {
            const a = await renderNote(alternating, interpolation, key);
            const b = await renderNote(reference, interpolation, key);
            let maxDiff = 0;
            let peak = 0;
            for (let i = 0; i < a.length; i++) {
                maxDiff = Math.max(maxDiff, Math.abs(a[i] - b[i]));
                peak = Math.max(peak, Math.abs(b[i]));
            }
            check(
                peak > 0.001 && maxDiff < 1e-6,
                `loop ${loopStart}-${loopEnd}, ${name}, key ${key}: matches the unrolled loop (max difference ${maxDiff.toExponential(2)})`
            );
        }
    }
}

const { alternating } = banks(700, 1900);
// Mode 4 is SFe only: SFe keeps it, SF2 writes it as a forward loop (SFe 4.0, section 9.1)
const zoneMode = (b: BasicSoundBank) =>
    b.instruments[0].zones[0].getGenerator(GeneratorTypes.sampleModes, 0);
check(zoneMode(sfeRoundTrip(alternating)) === 4, "SFe keeps sampleModes 4");
check(
    zoneMode(sf2RoundTrip(alternating)) === 1,
    "SF2 writes sampleModes 4 as a forward loop"
);

finish("alternating_loop_test");
