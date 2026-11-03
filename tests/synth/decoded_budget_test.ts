import {
    BasicSoundBank,
    SoundBankLoader,
    SpessaLog,
    SpessaSynthProcessor
} from "../../src";
import fs from "node:fs/promises";

// Checks SynthProcessorOptions.decodedSampleBudget: the decoded data stays under the budget
// And the output is the same as without a budget (released samples decode to the same data)
// Usage: tsx decoded_budget_test.ts <sf2 or sf3 path>

SpessaLog.setLogLevel(false, false, false);
await BasicSoundBank.ready;

const path = process.argv[2];
if (!path) {
    console.info("Usage: tsx decoded_budget_test.ts <sf2 or sf3 path>");
    process.exit(1);
}
const file = await fs.readFile(path);
const buffer = file.buffer.slice(
    file.byteOffset,
    file.byteOffset + file.byteLength
);

const rate = 44_100;
const budget = 512 * 1024;

const renderSong = (decodedSampleBudget: number) => {
    // A fresh bank each time, so no decoded data carries over
    const bank = SoundBankLoader.fromArrayBuffer(buffer);
    const proc = new SpessaSynthProcessor(rate, { decodedSampleBudget });
    proc.soundBankManager.addSoundBank(bank, "main");
    const left = new Float32Array(128);
    const right = new Float32Array(128);
    const out = new Array<number>();
    let peak = 0;
    // Walk the programs twice so released samples play again
    for (let pass = 0; pass < 2; pass++) {
        for (let program = 0; program < 128; program += 3) {
            proc.programChange(0, program);
            proc.noteOn(0, 40 + (program % 40), 100);
            proc.noteOn(9, 35 + (program % 40), 100);
            for (let q = 0; q < 40; q++) {
                left.fill(0);
                right.fill(0);
                proc.process(left, right, 0, 128);
                out.push(left[0], left[64], right[127]);
            }
            proc.noteOff(0, 40 + (program % 40));
            peak = Math.max(peak, proc.decodedSampleBytes);
        }
    }
    const decodedNow = bank.samples.reduce(
        (sum, s) =>
            sum + (s.storedForm === "float32" ? 0 : s.releaseDecoded() ? 1 : 0),
        0
    );
    return { out, peak, decodedNow };
};

const free = renderSong(Infinity);
const limited = renderSong(budget);

let failures = 0;
const check = (ok: boolean, message: string) => {
    console.info(ok ? "PASS:" : "FAIL:", message);
    if (!ok) failures++;
};

check(free.peak === 0, "no budget means no tracking");
check(
    limited.peak <= budget + 4 * 1024 * 1024,
    `tracked decoded data peaks at ${(limited.peak / 1024).toFixed(0)} kB (budget ${budget / 1024} kB, one sample may go over)`
);
check(
    limited.decodedNow < free.decodedNow,
    `fewer samples stay decoded: ${limited.decodedNow} with the budget, ${free.decodedNow} without`
);
let same = free.out.length === limited.out.length;
for (let i = 0; same && i < free.out.length; i++) {
    same = free.out[i] === limited.out[i];
}
check(same, "the output is the same with and without the budget");

if (failures > 0) {
    console.error(`${failures} checks failed`);
    process.exit(1);
}
console.info("All decoded budget checks passed.");
