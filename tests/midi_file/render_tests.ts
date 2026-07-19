import path from "node:path";
import * as child_process from "node:child_process";
import * as os from "node:os";
import * as worker_threads from "node:worker_threads";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import {
    audioToWav,
    BasicMIDI,
    IndexedByteArray,
    SoundBankLoader,
    SpessaLog,
    SpessaSynthProcessor,
    SpessaSynthSequencer
} from "../../src";
import { RIFFChunk } from "../../src/utils/riff_chunk";
import { readBinaryStringIndexed } from "../../src/utils/byte_functions/string";
import { readLittleEndianIndexed } from "../../src/utils/byte_functions/little_endian";

// ADJUST THESE TWO
const SF_LOCATION = path.join(
    os.homedir(),
    "htdocs/SpessaSynth/soundfonts/square.sf2"
);
const FSMP_LOCATION = path.join(
    os.homedir(),
    "Desktop/clutter/MidiPlayer x86/"
);

// For spessasynth rendering
const SF_OUT_DIR = "spessa";
const SF_LOG_OUT_DIR = "spessa_log";
const SF_RATE = 48_000;
const SF_TAIL = 2;
const BUFFER_SIZE = 128;
const TRIM_THRESHOLD = 0.0005;

// Out dir -> configuration preset number (suffix), like "scvaRender_003.ini"
const RENDERS = {
    scva: "3",
    syxg50: "4"
};

function readWav(bin: ArrayBuffer) {
    const fileData = new IndexedByteArray(bin);
    const main = RIFFChunk.read(fileData, false, false);
    if (main.header !== "RIFF") {
        throw new Error(`Unexpected wav header: ${main.header}`);
    }
    const wave = readBinaryStringIndexed(fileData, 4);
    if (wave !== "WAVE") {
        throw new Error(`Unexpected 'WAVE' string: ${wave}`);
    }
    const chunks: RIFFChunk[] = [];
    while (fileData.currentIndex < fileData.length) {
        chunks.push(RIFFChunk.read(fileData));
    }
    const fmt = chunks.find((c) => c.header === "fmt ");
    if (!fmt) {
        throw new Error("No fmt chunk");
    }
    const data = chunks.find((c) => c.header === "data");
    if (!data) {
        throw new Error("No data chunk");
    }

    const formatTag = readLittleEndianIndexed(fmt.data, 2);
    if (formatTag !== 1) {
        throw new Error(`Format not PCM: ${formatTag}`);
    }

    const channels = readLittleEndianIndexed(fmt.data, 2);
    const sampleRate = readLittleEndianIndexed(fmt.data, 4);
    // Skip sample rate, bytesPerSecond and bytesPerSample
    fmt.data.currentIndex += 6;
    const bitsPerSample = readLittleEndianIndexed(fmt.data, 2);
    const bytesPerSample = bitsPerSample / 8;

    // Read data
    const sampleLength = data.data.length / (channels * bytesPerSample);
    const sampleData: Float32Array<ArrayBuffer>[] = [];
    const shift = 32 - bitsPerSample;
    for (let i = 0; i < channels; i++) {
        sampleData.push(new Float32Array(sampleLength));
    }
    const divider = 1 << (bytesPerSample * 8 - 1);
    for (let sampleIndex = 0; sampleIndex < sampleLength; sampleIndex++) {
        for (let channel = 0; channel < channels; channel++) {
            const sample = readLittleEndianIndexed(data.data, bytesPerSample);

            sampleData[channel][sampleIndex] =
                ((sample << shift) >> shift) / divider;
        }
    }
    return {
        sampleData,
        sampleRate
    };
}

function wavToFlac(wavBuffer: Buffer) {
    return new Promise<Buffer>((resolve, reject) => {
        const ffmpeg = child_process.spawn("ffmpeg", [
            "-hide_banner",
            "-loglevel",
            "error",

            // Input from stdin
            "-i",
            "pipe:0",

            // Encode to flac
            "-c:a",
            "flac",
            "-compression_level",
            "12",

            // Output to stdout
            "-f",
            "flac",
            "pipe:1"
        ]);

        const chunks: Buffer[] = [];

        ffmpeg.stdout.on("data", (chunk: Buffer) => {
            chunks.push(chunk);
        });
        ffmpeg.on("close", (code) => {
            if (code !== 0)
                return reject(new Error(`ffmpeg exited with ${code}`));

            resolve(Buffer.concat(chunks));
        });

        ffmpeg.stdin.write(wavBuffer);
        ffmpeg.stdin.end();
    });
}

if (!worker_threads.isMainThread) {
    // Worker thread logic here

    interface WorkerData {
        file: string;
        midiDir: string;
        outputDir: string;
        logOutputDir: string;
    }

    // Extract the data passed from the main thread
    const { file, midiDir, outputDir, logOutputDir } =
        worker_threads.workerData as WorkerData;

    const sfBin = await fs.readFile(SF_LOCATION);
    const sf = SoundBankLoader.fromArrayBuffer(sfBin.buffer);

    const inputPath = path.join(midiDir, file);
    const midiBin = await fs.readFile(inputPath);
    const midi = BasicMIDI.fromArrayBuffer(midiBin.buffer);
    const sampleCount = SF_RATE * (midi.duration + SF_TAIL);

    const synth = new SpessaSynthProcessor(SF_RATE, {
        eventsEnabled: false,
        maxBufferSize: BUFFER_SIZE
    });
    synth.soundBankManager.addSoundBank(sf, "main");
    const seq = new SpessaSynthSequencer(synth);

    const log = new Array<string>();

    SpessaLog.setLogLevel(true, true, true);
    const appendLog = (...a: unknown[]) => {
        const data = a
            .map((b) =>
                (b as string)
                    .toString()
                    // Exclude colors
                    .replaceAll("%c", "")
            )
            // Exclude the "color" syntax
            .filter((b) => !b.includes("color: "));
        log.push(data.join(" "));
    };

    SpessaLog.logFunctions = {
        info: appendLog,
        warn: appendLog,
        group: () => {
            /* Empty */
        },
        groupCollapsed: () => {
            /* Empty */
        },
        groupEnd: () => {
            /* Empty */
        }
    };

    seq.loadNewSongList([midi]);
    seq.play();

    const outLeft = new Float32Array(sampleCount);
    const outRight = new Float32Array(sampleCount);

    let filledSamples = 0;
    while (filledSamples < sampleCount) {
        seq.processTick();
        const bufferSize = Math.min(BUFFER_SIZE, sampleCount - filledSamples);
        synth.process(outLeft, outRight, filledSamples, bufferSize);
        filledSamples += bufferSize;
    }

    const name = "SPESSA_" + path.basename(inputPath, path.extname(inputPath));

    const logOutputName = `${name}.txt`;
    const logText = log.join("\n");
    await fs.writeFile(path.join(logOutputDir, logOutputName), logText, {
        encoding: "utf-8"
    });

    const outputName = `${name}.flac`;
    const wavBuffer = Buffer.from(audioToWav([outLeft, outRight], SF_RATE));
    const outputPath = path.join(outputDir, outputName);

    const flacBuffer = await wavToFlac(wavBuffer);
    await fs.writeFile(outputPath, flacBuffer);

    // Tell the main thread that we are done
    worker_threads.parentPort?.postMessage("done");

    process.exit(0);
}

console.warn(
    `
==============WARNING===================
    Only tested on Linux,
    may work with Windows.
    
    Detected OS: ${os.platform()}
    Renders all files with spessasynth
    and VSTi reference.
    
    Normalized and FLAC.
    Uses wine and Falcosoft MIDI Player,
    FFmpeg is required as well.

    VSTi only renders changed files.
========================================
`
);

console.info(`FSMP Location: ${FSMP_LOCATION}`);
console.info(`SF Location: ${SF_LOCATION}`);
console.info("\n");
const isWindows = os.platform() === "win32";
const dirname = import.meta.dirname;

const rootDir = path.join(dirname, "../..");

const midiDir = path.join(rootDir, "tests/midi_file/generated");
const outDir = path.join(rootDir, "tests/midi_file/rendered");

const checksumsPath = path.join(outDir, "checksums.json");
let checksumsJson = "{}";

try {
    checksumsJson = await fs.readFile(checksumsPath, {
        encoding: "utf-8"
    });
} catch {
    console.info("checksums.json not found.");
}

const checksums = JSON.parse(checksumsJson) as Record<string, string>;

console.info("Building test files...");
child_process.execSync("npm run test:midi", {
    stdio: "ignore",
    cwd: rootDir
});
console.info("Done.");

console.group("Comparing checksums...");
const midiFiles = await fs.readdir(midiDir);
const filesToRender: string[] = [];
for (const file of midiFiles) {
    const inputPath = path.join(midiDir, file);
    const bin = await fs.readFile(inputPath);
    const sha256 = createHash("sha256").update(bin).digest("hex");
    if (checksums[file] === sha256) {
        console.info(`Skipping ${file}, checksums match.`);
    } else {
        checksums[file] = sha256;
        filesToRender.push(file);
    }
}
console.info("Checksum check done.\n");
console.groupEnd();

console.info(`Beginning render. Files to render: ${filesToRender.length}`);
let totalRendered = 0;

try {
    // Check if FSMP is there
    await fs.access(FSMP_LOCATION, fs.constants.F_OK);

    if (filesToRender.length === 0) {
        console.info("Nothing to render with VSTi!");
    } else {
        console.group(`Rendering ${filesToRender.length} files with VSTi...`);
        for (const [targetDirname, presetNumber] of Object.entries(RENDERS)) {
            const outputDir = path.join(outDir, targetDirname);
            await fs.mkdir(outputDir, { recursive: true });
            let done = 0;

            for (const file of filesToRender) {
                const inputPath = path.join(midiDir, file);

                const command = isWindows ? "MidiPlayer.exe" : "wine";
                let args: string[];
                if (isWindows) {
                    args = [
                        `${inputPath}`,
                        "/preset",
                        `${presetNumber}`,
                        "/render",
                        "/traysilent",
                        "/close"
                    ];
                } else {
                    const windowsPath = "Z:" + inputPath.replaceAll("/", "\\");
                    args = [
                        "MidiPlayer.exe",
                        `${windowsPath}`,
                        "/preset",
                        `${presetNumber}`,
                        "/render",
                        "/traysilent",
                        "/close"
                    ];
                }

                console.info(
                    `\n(${done}/${filesToRender.length}) Rendering ${file} for ${targetDirname.toUpperCase()}`
                );
                const doneLabel = `${file} rendered in`;
                console.time(doneLabel);

                child_process.spawnSync(command, args, {
                    cwd: FSMP_LOCATION,
                    stdio: "inherit"
                });

                const name = path.basename(inputPath, path.extname(inputPath));

                const renderedPath = path.join(midiDir, `${name}.wav`);
                const fileBin = await fs.readFile(renderedPath);
                await fs.rm(renderedPath);
                const { sampleData, sampleRate } = readWav(fileBin.buffer);
                console.info("Trimming silence and normalizing...");

                // Trim leading silence
                const frames = sampleData[0].length;

                let start;

                outer: for (start = 0; start < frames; start++) {
                    for (const sample of sampleData) {
                        if (Math.abs(sample[start]) > TRIM_THRESHOLD) {
                            break outer;
                        }
                    }
                }

                const outputPath = path.join(
                    outputDir,
                    `${targetDirname.toUpperCase()}_${name}.flac`
                );
                const wavBuffer = Buffer.from(
                    audioToWav(
                        sampleData.map((ch) => ch.slice(start)),
                        sampleRate
                    )
                );
                const flacBuffer = await wavToFlac(wavBuffer);
                await fs.writeFile(outputPath, flacBuffer);
                done++;
                totalRendered++;
                console.timeEnd(doneLabel);
            }
        }

        console.info("VSTi render completed.\n");
        console.groupEnd();
    }
} catch {
    console.info("FSMP not installed, skipping VSTi render!");
}

console.group("Rendering with spessasynth...");

const outputDir = path.join(outDir, SF_OUT_DIR);
await fs.mkdir(outputDir, { recursive: true });
const logOutputDir = path.join(outDir, SF_LOG_OUT_DIR);
await fs.mkdir(logOutputDir, { recursive: true });

function runWorker(file: string) {
    return new Promise<void>((resolve, reject) => {
        // Import.meta.filename points to this file
        const worker = new worker_threads.Worker(import.meta.filename, {
            workerData: {
                file,
                midiDir,
                outputDir,
                logOutputDir
            }
        });

        worker.on("message", () => resolve());
        worker.on("error", reject);
        worker.on("exit", (code) => {
            if (code !== 0)
                reject(new Error(`Worker stopped with exit code ${code}`));
        });
    });
}

console.info(`Queueing ${midiFiles.length} files for render.`);
console.time("Spessasynth render completed in");

await Promise.all(
    midiFiles.map(async (file) => {
        await runWorker(file);
        totalRendered++;
        console.info(`Finished rendering ${file}`);
    })
);

console.timeEnd("Spessasynth render completed in");
console.groupEnd();

console.info("Writing checksums...");
await fs.writeFile(checksumsPath, JSON.stringify(checksums), {
    encoding: "utf-8"
});
console.info(`All done. ${totalRendered} files rendered.`);
