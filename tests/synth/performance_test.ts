// Process arguments
import {
    BasicMIDI,
    SoundBankLoader,
    SpessaSynthProcessor,
    SpessaSynthSequencer
} from "../../src";
import fs from "node:fs/promises";
import path from "node:path";

const fileName = `performance-test-${new Date().toISOString()}.txt`;

const LOG_PATH = path.join(import.meta.dirname, "../files/other/", fileName);

async function writeLog(data: string) {
    let file = "";
    try {
        file = await fs.readFile(LOG_PATH, { encoding: "utf-8" });
    } catch {
        // Pass
    }
    file += data.replaceAll("\n", "") + "\n";
    await fs.writeFile(LOG_PATH, file, { encoding: "utf-8" });
    console.info(data);
}

export async function runPerformanceTest(
    sfPath: string,
    midPath: string,
    passes: number
) {
    const sf = await fs.readFile(sfPath);
    const mid = await fs.readFile(midPath);
    const midi = BasicMIDI.fromArrayBuffer(mid.buffer);
    const sampleRate = 44_100;
    const sampleCount = Math.ceil(44_100 * (midi.duration + 2));
    const sbk = SoundBankLoader.fromArrayBuffer(sf.buffer);
    const BUFFER_SIZE = 128;

    const outLeft = new Float32Array(sampleCount);
    const outRight = new Float32Array(sampleCount);

    const times = new Array<number>();
    for (let i = 0; i < passes; i++) {
        const synth = new SpessaSynthProcessor(sampleRate, {
            eventsEnabled: false
        });
        synth.soundBankManager.addSoundBank(sbk, "main");
        await synth.processorInitialized;
        const seq = new SpessaSynthSequencer(synth);
        seq.loadNewSongList([midi]);
        seq.play();
        let filledSamples = 0;

        await writeLog(`Rendering MIDI. Pass ${i} / ${passes}`);
        const start = performance.now();
        while (filledSamples < sampleCount) {
            // Process sequencer
            seq.processTick();
            // Render
            const bufferSize = Math.min(
                BUFFER_SIZE,
                sampleCount - filledSamples
            );
            synth.process(outLeft, outRight, filledSamples, bufferSize);
            filledSamples += bufferSize;
        }
        const time = performance.now() - start;
        await writeLog(`Pass ${i}: ${Math.floor(time)}ms`);
        times.push(time);
    }
    const avg = times.reduce((sum, i) => sum + i, 0) / times.length;
    await writeLog(`Average time: ${Math.floor(avg)}ms`);
    console.info("File written to", LOG_PATH);
}

if (import.meta.main) {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.info("Usage: tsx index.ts <soundbank path> <midi path>");
        process.exit();
    }
    await runPerformanceTest(args[0], args[1], 10);
}
