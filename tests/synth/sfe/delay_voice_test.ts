// DelayVoice: the sample, the envelopes and the LFOs all start late
import { BasicSample, GeneratorTypes, SampleTypes } from "../../../src";
import {
    check,
    checkStorage,
    finish,
    firstSound,
    lastSound,
    levelDb,
    makeBank,
    maxDifference,
    note,
    QUANTUM,
    render,
    SAMPLE_RATE,
    sineSample
} from "./sfe_test_utils";

// -1200 timecents is half a second
const DELAY = 0.5;
const delayTc = -1200;

console.info("Silence, then the sample from its start:");
// A non-looped sample, a short block of DC then silence
const impulse = new Float32Array(4410);
impulse.fill(0.5, 0, 441);
const impulseSample = new BasicSample(
    "block",
    SAMPLE_RATE,
    60,
    0,
    SampleTypes.monoSample,
    0,
    0
);
impulseSample.setAudioData(impulse, SAMPLE_RATE);
const plain = makeBank(impulseSample, {
    [GeneratorTypes.sampleModes]: 0
});
const delayed = makeBank(impulseSample, {
    [GeneratorTypes.sampleModes]: 0,
    [GeneratorTypes.delayVoice]: delayTc
});
const a = await render(plain, note(0, 2, 60), 1.5);
const b = await render(delayed, note(0, 2, 60), 1.5);
const startA = firstSound(a.left);
const startB = firstSound(b.left);
check(startA < QUANTUM, `no delay starts at once (${startA})`);
const lateBy = (startB - startA) / SAMPLE_RATE;
check(
    Math.abs(lateBy - DELAY) <= QUANTUM / SAMPLE_RATE,
    `the block comes ${lateBy.toFixed(4)} s late`
);
// Same shape: the block ends 441 points after it starts in both
const endA = lastSound(a.left);
const endB = lastSound(b.left);
check(
    Math.abs(endB - startB - (endA - startA)) <= 1,
    `the sample plays from its first point (${endA - startA} and ${endB - startB} points)`
);

console.info("Envelope starts late:");
// Attack of 0.25 s (-2400 timecents)
const attack = { [GeneratorTypes.attackVolEnv]: -2400 };
const c = await render(makeBank(sineSample(), attack), note(0, 3), 2);
const d = await render(
    makeBank(sineSample(), { ...attack, [GeneratorTypes.delayVoice]: delayTc }),
    note(0, 3),
    2
);
check(
    levelDb(d.left, 0, DELAY - 0.01) === -Infinity,
    "silent before the start"
);
// The delayed render shifted back by the delay must match the plain one
// The voice starts on the first quantum at or after its start time
const quantumShift = Math.ceil((DELAY * SAMPLE_RATE) / QUANTUM) * QUANTUM;
const diff = maxDifference(
    c.left.subarray(0, SAMPLE_RATE),
    d.left.subarray(quantumShift, quantumShift + SAMPLE_RATE)
);
check(
    diff < 1e-6,
    `the delayed voice is the same voice shifted (max diff ${diff})`
);

console.info("Note off before the start:");
const e = await render(
    makeBank(sineSample(), { [GeneratorTypes.delayVoice]: delayTc }),
    note(0, 0.1),
    1.5
);
check(
    levelDb(e.left, DELAY, DELAY + 0.02) > -40 && levelDb(e.left, 1, 1.5) < -90,
    "the voice still starts, then plays the minimum note length"
);

checkStorage(delayed, [GeneratorTypes.delayVoice]);
finish("delay_voice_test");
