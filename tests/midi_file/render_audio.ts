import * as child_process from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import * as worker_threads from "node:worker_threads";
import {
    audioToWav,
    BasicMIDI,
    IndexedByteArray,
    SoundBankLoader,
    SpessaLog,
    SpessaSynthProcessor,
    SpessaSynthSequencer
} from "../../src";
import { readLittleEndianIndexed } from "../../src/utils/byte_functions/little_endian";
import { readBinaryStringIndexed } from "../../src/utils/byte_functions/string";
import { RIFFChunk } from "../../src/utils/riff_chunk";
import {
    type RenderTargetArch,
    type RenderTargetConfig,
    renderTestsConfig
} from "./config";

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
    if (formatTag !== 1 && formatTag !== 3) {
        throw new Error(`Format not PCM: ${formatTag}`);
    }

    const channels = readLittleEndianIndexed(fmt.data, 2);
    const sampleRate = readLittleEndianIndexed(fmt.data, 4);
    // Skip sample rate, bytesPerSecond and bytesPerSample
    fmt.data.currentIndex += 6;
    const bitsPerSample = readLittleEndianIndexed(fmt.data, 2);
    const bytesPerSample = bitsPerSample / 8;
    if (formatTag === 3 && bitsPerSample !== 32) {
        throw new Error(`Unsupported IEEE float depth: ${bitsPerSample}`);
    }

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
            if (formatTag === 3) {
                const offset =
                    (sampleIndex * channels + channel) * bytesPerSample;
                sampleData[channel][sampleIndex] = new DataView(
                    data.data.buffer,
                    data.data.byteOffset + offset,
                    bytesPerSample
                ).getFloat32(0, true);
            } else {
                const sample = readLittleEndianIndexed(
                    data.data,
                    bytesPerSample
                );
                sampleData[channel][sampleIndex] =
                    ((sample << shift) >> shift) / divider;
            }
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

    const sfBin = await fs.readFile(renderTestsConfig.paths.soundFont);
    const sf = SoundBankLoader.fromArrayBuffer(sfBin.buffer);

    const inputPath = path.join(midiDir, file);
    const midiBin = await fs.readFile(inputPath);
    const midi = BasicMIDI.fromArrayBuffer(midiBin.buffer);
    const { bufferSize, logFileName, outputFileName, sampleRate, tailSeconds } =
        renderTestsConfig.spessasynth;
    const sampleCount = sampleRate * (midi.duration + tailSeconds);

    const synth = new SpessaSynthProcessor(sampleRate, {
        eventsEnabled: false,
        maxBufferSize: bufferSize
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
        const currentBufferSize = Math.min(
            bufferSize,
            sampleCount - filledSamples
        );
        synth.process(outLeft, outRight, filledSamples, currentBufferSize);
        filledSamples += currentBufferSize;
    }

    const name = path.basename(inputPath, path.extname(inputPath));
    const outputDir = path.join(renderedDir, name);
    await fs.mkdir(outputDir, { recursive: true });

    await fs.writeFile(path.join(outputDir, logFileName), log.join("\n"), {
        encoding: "utf-8"
    });

    const wavBuffer = Buffer.from(audioToWav([outLeft, outRight], sampleRate));
    await fs.writeFile(path.join(outputDir, outputFileName), wavBuffer);

    // Tell the main thread that we are done
    worker_threads.parentPort?.postMessage("done");

    process.exit(0);
}

console.warn(
    `
==============WARNING===================
    Tested on both Linux and Windows.
    On Linux, wine and mingw64-gcc is required for VST renders.
    On Windows, Visual Studio is required for VST renders.
    
    Detected OS: ${os.platform()}
    Renders all files with spessasynth_core
    and the configured native VST renderer.
    
    Normalized and WAV.
    
    VSTi only renders changed files.
========================================
`
);

console.info(`SF Location: ${renderTestsConfig.paths.soundFont}`);
console.info("\n");
const isWindows = os.platform() === "win32";
const { paths } = renderTestsConfig;
const { checksumsDir, midiDir, renderedDir, rendererDir, rootDir } = paths;

const writeQueues = new Map<string, Promise<void>>();

async function writeTargetChecksums(
    target: string,
    checksums: Record<string, string>
) {
    const checksumsPath = path.join(checksumsDir, `${target}.json`);
    const currentQueue = writeQueues.get(target) ?? Promise.resolve();
    const nextQueue = currentQueue
        .catch(() => {
            /* Empty */
        })
        .then(async () => {
            await fs.mkdir(checksumsDir, { recursive: true });
            const tempPath = `${checksumsPath}.tmp`;
            await fs.writeFile(tempPath, JSON.stringify(checksums), {
                encoding: "utf-8"
            });
            await fs.rename(tempPath, checksumsPath);
        });
    writeQueues.set(target, nextQueue);
    return nextQueue;
}

async function fileExists(filePath: string) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * This builds the renderer if not found
 */
async function getRendererPath(arch: RenderTargetArch) {
    const rendererName = `renderer_${arch}.exe`;
    const rendererPath = path.join(rendererDir, arch, rendererName);

    if (!(await fileExists(rendererPath))) {
        console.info(`Renderer ${arch} not found. Building renderer...`);
        child_process.execFileSync("npm", ["run", "build:renderer"], {
            cwd: rootDir,
            stdio: "inherit",
            shell: true
        });
    }

    if (!(await fileExists(rendererPath))) {
        throw new Error(`Failed to build renderer: ${rendererPath}`);
    }

    return rendererPath;
}

console.info("Building test files...");
child_process.execSync("npm run test:midi:generate", {
    stdio: "ignore",
    cwd: rootDir
});
console.info("Done.");

console.group("Comparing checksums...");
const midiFiles = await fs.readdir(midiDir);
const fileHashes = new Map<string, string>();
for (const file of midiFiles) {
    const inputPath = path.join(midiDir, file);
    const bin = await fs.readFile(inputPath);
    const sha256 = createHash("sha256").update(bin).digest("hex");
    fileHashes.set(file, sha256);
}

/**
 * Target: Map<fileName: checksum>
 */
const targetChecksums = new Map<string, Record<string, string>>();
/**
 * Target: fileName[]
 */
const filesToRenderByTarget = new Map<string, string[]>();

// Check if checksums exist for each target
for (const renderTarget of Object.keys(renderTestsConfig.renderTargets)) {
    const targetChecksumsPath = path.join(checksumsDir, `${renderTarget}.json`);
    let checksums: Record<string, string> = {};
    try {
        const checksumsJson = await fs.readFile(targetChecksumsPath, {
            encoding: "utf-8"
        });
        checksums = JSON.parse(checksumsJson) as Record<string, string>;
    } catch {
        console.info(`Checksums for ${renderTarget} not found.`);
    }
    targetChecksums.set(renderTarget, checksums);

    const targetFiles: string[] = [];
    for (const file of midiFiles) {
        const sha256 = fileHashes.get(file)!;
        if (checksums[file] === sha256) {
            console.info(
                `Skipping ${file} for ${renderTarget}, checksums match.`
            );
        } else {
            targetFiles.push(file);
        }
    }
    filesToRenderByTarget.set(renderTarget, targetFiles);
}
console.info("Checksum check done.\n");
console.groupEnd();

const totalVstFilesToRender = Array.from(filesToRenderByTarget.values()).reduce(
    (sum, files) => sum + files.length,
    0
);

console.info(
    `Beginning render. Files to render across VST targets: ${totalVstFilesToRender}`
);

function execRenderer(command: string, args: string[], cwd: string) {
    return new Promise<{
        status: number | null;
        stdout: string[];
    }>((resolve, reject) => {
        const proc = child_process.spawn(command, args, {
            cwd,
            env: {
                ...process.env,
                WINEDEBUG: "-all",
                DISPLAY: ""
            },
            stdio: ["ignore", "pipe", "pipe"]
        });
        const stdout = new Array<string>();
        proc.stdout.setEncoding("utf-8");
        proc.stderr.setEncoding("utf-8");
        proc.stdout.on("data", (chunk: string) => {
            stdout.push(chunk);
        });
        proc.stderr.on("data", (chunk: string) => {
            stdout.push(chunk);
        });
        proc.on("error", (err) => {
            reject(err);
        });
        proc.on("close", (code) => {
            resolve({ status: code, stdout });
        });
    });
}

async function renderVSTTarget(
    file: string,
    inputPath: string,
    outputDir: string,
    renderTarget: string,
    params: RenderTargetConfig,
    progress?: string
) {
    if (progress) {
        console.info(
            `Starting to render ${file} (${progress}) for ${renderTarget}`
        );
    }
    const doneLabel = `${file} for ${renderTarget} took`;
    console.time(doneLabel);

    const rendererPath = await getRendererPath(params.arch);
    const vstPath = params.vstPath;
    const renderedPath = path.join(outputDir, `${renderTarget}_temp.wav`);

    // Run the command
    try {
        if (!(await fileExists(vstPath))) {
            console.error(`VST not found: ${vstPath}. Skipping!`);
            return false;
        }

        // Add wine if linux
        const command = isWindows ? rendererPath : "wine";

        const rendererArgument = path.relative(rendererDir, rendererPath);
        const vstArgument = path.relative(rendererDir, vstPath);
        const inputArgument = path.relative(rendererDir, inputPath);
        const outputArgument = path.relative(rendererDir, renderedPath);

        const args = isWindows
            ? [vstArgument, inputArgument, outputArgument]
            : [rendererArgument, vstArgument, inputArgument, outputArgument];
        const result = await execRenderer(command, args, rendererDir);

        // Write logs
        const logs = [[command, ...args].join(" "), ...result.stdout]
            .filter((line) => line.length > 0)
            .join("\n");

        await fs.writeFile(path.join(outputDir, `${renderTarget}.log`), logs, {
            encoding: "utf-8"
        });

        if (result.status !== 0) {
            console.warn(
                `Renderer exited with code ${result.status} for ${renderTarget}.\n` +
                    `Check the log file for more information.`
            );
            return false;
        }

        const fileBin = await fs.readFile(renderedPath);
        const { sampleData, sampleRate } = readWav(fileBin.buffer);
        // Trim leading silence
        const frames = sampleData[0].length;

        let start;

        outer: for (start = 0; start < frames; start++) {
            for (const sample of sampleData) {
                if (Math.abs(sample[start]) > renderTestsConfig.trimThreshold) {
                    break outer;
                }
            }
        }

        const outputPath = path.join(outputDir, `${renderTarget}.wav`);
        const wavBuffer = Buffer.from(
            audioToWav(
                sampleData.map((ch) => ch.slice(start)),
                sampleRate,
                {
                    normalizeAudio: true
                }
            )
        );
        await fs.writeFile(outputPath, wavBuffer);
        await fs.rm(renderedPath);
        return true;
    } catch (error) {
        console.warn(
            `Failed to render ${file} with ${renderTarget}:`,
            error,
            "Skipping!"
        );
        return false;
    } finally {
        console.timeEnd(doneLabel);
        console.info();
    }
}

if (totalVstFilesToRender === 0) {
    console.info("Nothing to render with VST!");
} else {
    // Ensure all required renderers are built before starting rendering
    const arches = new Set(
        Object.values(renderTestsConfig.renderTargets).map((t) => t.arch)
    );
    for (const arch of arches) {
        await getRendererPath(arch);
    }

    console.group(
        `Rendering ${totalVstFilesToRender} total files across VST targets...`
    );
    console.time("VST render completed in");

    for (const [renderTarget, params] of Object.entries(
        renderTestsConfig.renderTargets
    )) {
        const filesToRender = filesToRenderByTarget.get(renderTarget) ?? [];
        if (filesToRender.length === 0) {
            console.info(`Nothing to render for ${renderTarget}!`);
            continue;
        }

        console.group(
            `Rendering ${filesToRender.length} files for ${renderTarget} (${params.multithreaded ? "multithreaded" : "single threaded"})...`
        );
        console.time(`${renderTarget} render completed in`);

        let targetRendered = 0;

        const renderSingleFile = async (file: string, logStart: boolean) => {
            const inputPath = path.join(midiDir, file);
            const name = path.basename(inputPath, path.extname(inputPath));
            const outputDir = path.join(renderedDir, name);
            await fs.mkdir(outputDir, { recursive: true });

            const ok = await renderVSTTarget(
                file,
                inputPath,
                outputDir,
                renderTarget,
                params,
                logStart
                    ? `${targetRendered}/${filesToRender.length}`
                    : undefined
            );
            targetRendered++;
            console.info(
                `Finished rendering ${file} (${targetRendered}/${filesToRender.length}) for ${renderTarget}`
            );

            if (ok) {
                const sha256 = fileHashes.get(file);
                if (sha256) {
                    const currentChecksums = targetChecksums.get(renderTarget)!;
                    currentChecksums[file] = sha256;
                    await writeTargetChecksums(renderTarget, currentChecksums);
                }
            }
        };

        if (params.multithreaded) {
            console.info(
                `Queueing ${filesToRender.length} files for ${renderTarget}.`
            );
            await Promise.all(
                filesToRender.map((file) => renderSingleFile(file, false))
            );
        } else {
            for (const file of filesToRender) {
                await renderSingleFile(file, true);
            }
        }

        console.timeEnd(`${renderTarget} render completed in`);
        console.groupEnd();
    }

    console.timeEnd("VSTi render completed in");
    console.info("VSTi render completed.\n");
    console.groupEnd();
}

console.group("Rendering with SpessaSynth...");

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
console.time("SpessaSynth render completed in");

let totalRendered = 0;
await Promise.all(
    midiFiles.map(async (file) => {
        await runWorker(file);
        totalRendered++;
        console.info(`Finished rendering ${file}`);
    })
);

console.timeEnd("SpessaSynth render completed in");
console.groupEnd();

console.info(`All done. ${totalRendered} files rendered with SpessaSynth.`);
