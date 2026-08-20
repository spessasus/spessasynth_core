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
    "Desktop/clutter/MidiPlayer x86/MidiPlayer.exe"
);

// For spessasynth rendering
const SF_RATE = 48_000;
const SF_TAIL = 2;
const BUFFER_SIZE = 128;
const TRIM_THRESHOLD = 0.0005;
const SPESSA_LOG = "spessa.log";
const SPESSA_OUT = "spessa.wav";

// VSTi Template name -> Configuration preset number (suffix), like "scvaRender_003.ini"
const RENDERS = {
    scva: "3",
    syxg50: "4"
};
const FSMP_CLI = ["/render", "/traysilent", "/close"];

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

if (!worker_threads.isMainThread) {
    // Worker thread logic here

    interface WorkerData {
        file: string;
        midiDir: string;
        renderedDir: string;
    }

    // Extract the data passed from the main thread
    const { file, midiDir, renderedDir } =
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

    const name = path.basename(inputPath, path.extname(inputPath));
    const outputDir = path.join(renderedDir, name);
    await fs.mkdir(outputDir, { recursive: true });

    await fs.writeFile(path.join(outputDir, SPESSA_LOG), log.join("\n"), {
        encoding: "utf-8"
    });

    const wavBuffer = Buffer.from(audioToWav([outLeft, outRight], SF_RATE));
    await fs.writeFile(path.join(outputDir, SPESSA_OUT), wavBuffer);

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
    
    Normalized and WAV.
    Uses wine and Falcosoft MIDI Player.
    
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
const renderedDir = path.join(rootDir, "tests/midi_file/rendered");

const checksumsPath = path.join(renderedDir, "checksums.json");
let checksumsJson = "{}";

try {
    checksumsJson = await fs.readFile(checksumsPath, {
        encoding: "utf-8"
    });
} catch {
    console.info("checksums.json not found.");
}

/**
 * File name -> sha256
 */
const checksums = JSON.parse(checksumsJson) as Record<string, string>;

async function writeChecksums() {
    await fs.writeFile(checksumsPath, JSON.stringify(checksums), {
        encoding: "utf-8"
    });
}

console.info("Building test files...");
child_process.execSync("npm run test:midi", {
    stdio: "ignore",
    cwd: rootDir
});
console.info("Done.");

console.group("Comparing checksums...");
const midiFiles = await fs.readdir(midiDir);
const filesToRender: string[] = [];
/**
 * File name -> sha256
 */
const pendingChecksums = new Map<string, string>();
for (const file of midiFiles) {
    const inputPath = path.join(midiDir, file);
    const bin = await fs.readFile(inputPath);
    const sha256 = createHash("sha256").update(bin).digest("hex");
    if (checksums[file] === sha256) {
        console.info(`Skipping ${file}, checksums match.`);
    } else {
        pendingChecksums.set(file, sha256);
        filesToRender.push(file);
    }
}
console.info("Checksum check done.\n");
console.groupEnd();

let fsmpAvailable = true;
try {
    // Check if FSMP is there
    await fs.access(FSMP_LOCATION, fs.constants.F_OK);
} catch {
    fsmpAvailable = false;
    console.info("FSMP not installed, skipping VSTi render!");
}

let totalRendered = 0;

console.info(`Beginning render. Files to render: ${filesToRender.length}`);

if (fsmpAvailable) {
    if (filesToRender.length === 0) {
        console.info("Nothing to render with VSTi!");
    } else {
        console.group(`Rendering ${filesToRender.length} files with VSTi...`);
        for (const file of filesToRender) {
            const inputPath = path.join(midiDir, file);
            const name = path.basename(inputPath, path.extname(inputPath));

            let success = true;
            for (const [vstiName, presetNumber] of Object.entries(RENDERS)) {
                console.info(
                    `Rendering ${file} (${totalRendered}/${filesToRender.length}) for ${vstiName}`
                );
                const doneLabel = `${file} (${vstiName}) rendered in`;
                console.time(doneLabel);

                const command = isWindows ? FSMP_LOCATION : "wine";
                const filePath = isWindows
                    ? inputPath
                    : "Z:" + inputPath.replaceAll("/", "\\");
                const args = [
                    filePath,
                    "/preset",
                    `${presetNumber}`,
                    ...FSMP_CLI
                ];

                // Command is "wine" on linux, add the path to executable here
                if (!isWindows) {
                    args.unshift(path.basename(FSMP_LOCATION));
                }

                // Create the output directory
                const outputDir = path.join(renderedDir, name);
                await fs.mkdir(outputDir, { recursive: true });

                // Run the command
                try {
                    const result = child_process.spawnSync(command, args, {
                        cwd: path.dirname(FSMP_LOCATION),
                        encoding: "utf-8"
                    });

                    // Write logs
                    const logs = [
                        [command, ...args].join(" "),
                        "Stdout:",
                        result.stdout?.trimEnd() ?? "",
                        "Stderr:",
                        result.stderr?.trimEnd() ?? ""
                    ]
                        .filter((line) => line.length > 0)
                        .join("\n");

                    await fs.writeFile(
                        path.join(outputDir, `${vstiName}.log`),
                        logs,
                        { encoding: "utf-8" }
                    );

                    if (result.status !== 0) {
                        console.warn(
                            `FSMP exited with code ${result.status}. Skipping!`
                        );
                        success = false;
                        continue;
                    }

                    const renderedPath = path.join(midiDir, `${name}.wav`);
                    const fileBin = await fs.readFile(renderedPath);
                    await fs.rm(renderedPath);
                    const { sampleData, sampleRate } = readWav(fileBin.buffer);
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

                    const outputPath = path.join(outputDir, `${vstiName}.wav`);
                    const wavBuffer = Buffer.from(
                        audioToWav(
                            sampleData.map((ch) => ch.slice(start)),
                            sampleRate
                        )
                    );
                    await fs.writeFile(outputPath, wavBuffer);
                } catch (error) {
                    console.warn(
                        `Failed to render ${file} with ${vstiName}:`,
                        error,
                        "Skipping!"
                    );
                    success = false;
                } finally {
                    console.timeEnd(doneLabel);
                }
            }
            totalRendered++;

            if (success) {
                // Write right away as spessa always renders everything
                const sha256 = pendingChecksums.get(file);
                if (sha256) {
                    checksums[file] = sha256;
                    await writeChecksums();
                }
            }
        }

        console.info("VSTi render completed.\n");
        console.groupEnd();
    }
}

console.group("Rendering with spessasynth...");

await fs.mkdir(renderedDir, { recursive: true });

function runWorker(file: string) {
    return new Promise<void>((resolve, reject) => {
        // Import.meta.filename points to this file
        const worker = new worker_threads.Worker(import.meta.filename, {
            workerData: {
                file,
                midiDir,
                renderedDir
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

totalRendered = 0;
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
await writeChecksums();
console.info(`All done. ${totalRendered} files rendered.`);
