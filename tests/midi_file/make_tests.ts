import fs, { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TESTS_DIR = import.meta.dirname;
const OUT_DIR = path.resolve(TESTS_DIR, "generated");

const SKIP_FILES = new Set(["make_tests.ts", "midi_test_maker.ts"]);
const SKIP_DIRS = new Set(["node_modules", "files"]);

async function findTestFiles(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await findTestFiles(full)));
        } else if (
            entry.isFile() &&
            entry.name.endsWith(".ts") &&
            !SKIP_FILES.has(entry.name)
        ) {
            files.push(full);
        }
    }
    return files;
}

console.info("Cleaning the current output");
await fs.rm(OUT_DIR, {
    force: true,
    recursive: true
});

const testFiles = await findTestFiles(TESTS_DIR);
console.info(`Found ${testFiles.length} test files`);

let generated = 0;

for (const file of testFiles) {
    const url = pathToFileURL(file).href;

    try {
        await import(url);
        generated++;
    } catch (error: unknown) {
        console.warn(`Failed to generate test ${url}`, error);
    }
}

console.info();
console.info(`Done: ${generated} test MIDI files files generated.`);
