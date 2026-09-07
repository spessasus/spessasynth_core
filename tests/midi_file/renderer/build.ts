import { exec, execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const isWindows = os.platform() === "win32";

const RENDERER_DIR = import.meta.dirname;
const BIN_DIR = path.join(RENDERER_DIR, "bin");

const DOWNLOAD_URLS = {
    bass: "https://www.un4seen.com/files/bass24.zip",
    bassmidi: "https://www.un4seen.com/files/bassmidi24.zip",
    bass_vst: "https://www.un4seen.com/files/z/5/bass_vst24.zip"
} as const;

const REQUIRED_HEADERS = ["bass.h", "bassmidi.h", "bass_vst.h"];

async function download(url: string, dest: string) {
    console.info(`Downloading ${path.basename(dest)}...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(dest, buffer);
    console.info(
        `Downloaded ${path.basename(dest)} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`
    );
}

async function extractZip(zipPath: string, destDir: string) {
    await fs.mkdir(destDir, { recursive: true });
    await (isWindows
        ? execAsync(
              `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
              { encoding: "utf-8" }
          )
        : execFileAsync("unzip", ["-q", "-o", zipPath, "-d", destDir], {
              encoding: "utf-8"
          }));
}

async function fileExists(p: string) {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

async function copyHeaders(dir: string, destDir: string) {
    const items = await fs.readdir(dir, { withFileTypes: true });
    for (const item of items) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) {
            await copyHeaders(full, destDir);
        } else if (item.name.endsWith(".h")) {
            await fs.copyFile(full, path.join(destDir, item.name));
        }
    }
}

async function findVSVarsall() {
    const programFilesX86 =
        process.env["ProgramFiles(x86)"] ?? String.raw`C:\Program Files (x86)`;
    const programFiles =
        process.env.ProgramFiles ?? String.raw`C:\Program Files`;

    const vswhere = path.join(
        programFilesX86,
        "Microsoft Visual Studio",
        "Installer",
        "vswhere.exe"
    );

    try {
        const { stdout } = await execAsync(
            `"${vswhere}" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`,
            { encoding: "utf-8" }
        );
        const installPath = stdout.trim();
        if (installPath) {
            const vcvarsall = path.join(
                installPath,
                "VC",
                "Auxiliary",
                "Build",
                "vcvarsall.bat"
            );
            if (await fileExists(vcvarsall)) {
                return vcvarsall;
            }
        }
    } catch {
        console.warn(
            "vswhere query failed or not found, trying default paths..."
        );
    }

    const possiblePaths = [
        // VS 2022
        path.join(
            programFiles,
            "Microsoft Visual Studio",
            "2022",
            "Community",
            "VC",
            "Auxiliary",
            "Build",
            "vcvarsall.bat"
        ),
        path.join(
            programFiles,
            "Microsoft Visual Studio",
            "2022",
            "Professional",
            "VC",
            "Auxiliary",
            "Build",
            "vcvarsall.bat"
        ),
        path.join(
            programFiles,
            "Microsoft Visual Studio",
            "2022",
            "Enterprise",
            "VC",
            "Auxiliary",
            "Build",
            "vcvarsall.bat"
        ),
        path.join(
            programFiles,
            "Microsoft Visual Studio",
            "2022",
            "BuildTools",
            "VC",
            "Auxiliary",
            "Build",
            "vcvarsall.bat"
        ),
        // VS 2019
        path.join(
            programFilesX86,
            "Microsoft Visual Studio",
            "2019",
            "Community",
            "VC",
            "Auxiliary",
            "Build",
            "vcvarsall.bat"
        ),
        path.join(
            programFilesX86,
            "Microsoft Visual Studio",
            "2019",
            "Professional",
            "VC",
            "Auxiliary",
            "Build",
            "vcvarsall.bat"
        ),
        path.join(
            programFilesX86,
            "Microsoft Visual Studio",
            "2019",
            "Enterprise",
            "VC",
            "Auxiliary",
            "Build",
            "vcvarsall.bat"
        ),
        path.join(
            programFilesX86,
            "Microsoft Visual Studio",
            "2019",
            "BuildTools",
            "VC",
            "Auxiliary",
            "Build",
            "vcvarsall.bat"
        )
    ];

    for (const p of possiblePaths) {
        if (await fileExists(p)) {
            return p;
        }
    }

    return null;
}

console.info("=== C++ VST Renderer Build (x86 + x64) ===\n");

// Check dependencies
console.group("--- Checking dependencies ---");
let needsDownload = false;

for (const header of REQUIRED_HEADERS) {
    // Check if any arch dir is missing the header
    if (
        !(await fileExists(path.join(BIN_DIR, "x86", header))) ||
        !(await fileExists(path.join(BIN_DIR, "x64", header)))
    ) {
        needsDownload = true;
        break;
    }
}

// Download and extract dependencies if needed
if (needsDownload) {
    console.info("BASS SDK not found. Downloading dependencies...\n");
    await fs.mkdir(BIN_DIR, { recursive: true });

    const tmpDir = path.join(os.tmpdir(), "bass_sdk_build");
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.mkdir(tmpDir, { recursive: true });

    const entries = Object.entries(DOWNLOAD_URLS) as [string, string][];
    for (const [name, url] of entries) {
        const zipPath = path.join(tmpDir, `${name}.zip`);
        const extractDir = path.join(tmpDir, `${name}_extracted`);

        await download(url, zipPath);
        await extractZip(zipPath, extractDir);
    }

    console.info("\nExtracting headers and libraries...\n");

    // Create arch dirs
    const x86Dir = path.join(BIN_DIR, "x86");
    const x64Dir = path.join(BIN_DIR, "x64");
    await fs.mkdir(x86Dir, { recursive: true });
    await fs.mkdir(x64Dir, { recursive: true });

    // Copy headers to both arch dirs
    for (const [name] of entries) {
        const extractDir = path.join(tmpDir, `${name}_extracted`);
        const cDir = path.join(extractDir, "c");
        await copyHeaders(cDir, x86Dir);
        await copyHeaders(cDir, x64Dir);
    }

    // Copy x86 libs and DLLs
    for (const [name] of entries) {
        const extractDir = path.join(tmpDir, `${name}_extracted`);
        const libName = `${name}.lib`;
        const dllName = `${name}.dll`;
        const x86Lib = path.join(extractDir, "c", libName);
        const x86Dll = path.join(extractDir, dllName);

        if (await fileExists(x86Lib)) {
            await fs.copyFile(x86Lib, path.join(x86Dir, libName));
        }
        if (await fileExists(x86Dll)) {
            await fs.copyFile(x86Dll, path.join(x86Dir, dllName));
        }
    }

    // Copy x64 libs and DLLs
    for (const [name] of entries) {
        const extractDir = path.join(tmpDir, `${name}_extracted`);
        const libName = `${name}.lib`;
        const dllName = `${name}.dll`;
        const x64Lib = path.join(extractDir, "c", "x64", libName);
        const x64Dll = path.join(extractDir, "x64", dllName);

        if (await fileExists(x64Lib)) {
            await fs.copyFile(x64Lib, path.join(x64Dir, libName));
        }
        if (await fileExists(x64Dll)) {
            await fs.copyFile(x64Dll, path.join(x64Dir, dllName));
        }
    }

    await fs.rm(tmpDir, { recursive: true, force: true });
    console.info("Dependencies ready.\n");
} else {
    console.info("BASS SDK found. Skipping download.\n");
}

console.groupEnd();
console.info("---\n");

// Compile both architectures
const sourceFile = path.join(RENDERER_DIR, "renderer.cpp");
const archs = [
    { name: "x86", arch: "x86", outName: "renderer_x86.exe" },
    { name: "x64", arch: "amd64", outName: "renderer_x64.exe" }
] as const;

if (isWindows) {
    // Use visual studio compiler
    const vcvarsall = await findVSVarsall();

    if (!vcvarsall) {
        console.error(
            "Visual Studio C++ tools not found. Please install Visual Studio with C++ Development!."
        );
        process.exit(1);
    }

    console.info(`Found Visual Studio: ${vcvarsall}\n`);

    for (const { arch, outName, name } of archs) {
        const archDir = path.join(BIN_DIR, name);
        const outPath = path.join(archDir, outName);

        console.group(`--- Building ${arch} ---`);

        const compileCmd =
            `call "${vcvarsall}" ${arch === "x86" ? "x86" : "amd64"} && ` +
            [
                `cl`,
                `/nologo`,
                `/std:c++17`,
                `/O2`,
                `/Oi`,
                `/Ot`,
                `/GL`,
                `/fp:fast`,
                `/DNDEBUG`,
                `/EHsc`,
                `/W3`,
                arch === "x86" ? `/arch:SSE2` : ``,
                `/I"${archDir}"`,
                `/Fe:"${outPath}"`,
                `"${sourceFile}"`,
                `/link`,
                `/LTCG`,
                `/OPT:REF`,
                `/OPT:ICF`,
                `/INCREMENTAL:NO`,
                `/LIBPATH:"${archDir}"`,
                `bass.lib bassmidi.lib bass_vst.lib`
            ]
                .filter(Boolean)
                .join(" ");

        try {
            console.info(`Compiling renderer.cpp (${arch})...`);
            const { stdout, stderr } = await execAsync(
                `cmd /c "${compileCmd}"`,
                {
                    cwd: RENDERER_DIR,
                    maxBuffer: 1024 * 1024
                }
            );
            if (stdout) console.info(stdout.trim());
            if (stderr) console.info(stderr.trim());
            console.info(`Build successful: ${outPath}`);
        } catch (error_: unknown) {
            const error = error_ as {
                stdout?: string;
                stderr?: string;
            };
            console.error(`\nCompilation failed for ${arch}.`);
            if (error.stdout) console.error(error.stdout);
            if (error.stderr) console.error(error.stderr);
            process.exit(1);
        }

        console.groupEnd();
        console.info("---\n");
    }
} else {
    // Use mingw-w64 compiler
    const compilers = {
        x86: "i686-w64-mingw32-g++",
        x64: "x86_64-w64-mingw32-g++"
    } as const;

    for (const { name, outName } of archs) {
        const archDir = path.join(BIN_DIR, name);
        const outPath = path.join(archDir, outName);

        console.group(`--- Building ${name} ---`);
        try {
            console.info(`Compiling renderer.cpp (${name})...`);
            const { stdout, stderr } = await execFileAsync(
                compilers[name],
                [
                    "-std=c++17",
                    "-O3",
                    "-flto",
                    "-ffast-math",
                    "-DNDEBUG",
                    "-static",
                    "-static-libgcc",
                    "-static-libstdc++",
                    "-s",
                    "-Wl,--gc-sections",
                    `-I${archDir}`,
                    sourceFile,
                    `-L${archDir}`,
                    "-lbass",
                    "-lbassmidi",
                    "-lbass_vst",
                    "-o",
                    outPath
                ],
                { cwd: RENDERER_DIR, encoding: "utf-8", maxBuffer: 1024 * 1024 }
            );
            if (stdout) console.info(stdout.trim());
            if (stderr) console.info(stderr.trim());
            console.info(`Build successful: ${outPath}`);
        } catch (error_: unknown) {
            const error = error_ as {
                stdout?: string;
                stderr?: string;
            };
            console.error(`\nCompilation failed for ${name}.`);
            if (error.stdout) console.error(error.stdout);
            if (error.stderr) console.error(error.stderr);
            process.exit(1);
        }
        console.groupEnd();
        console.info("---\n");
    }
}

console.group("Done. Built the following files:");
console.info(`x86: ${path.join(BIN_DIR, "x86", "renderer_x86.exe")}`);
console.info(`x64: ${path.join(BIN_DIR, "x64", "renderer_x64.exe")}`);
console.groupEnd();
