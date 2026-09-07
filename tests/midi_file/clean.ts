import fs from "node:fs/promises";
import path from "node:path";
import { renderTestsConfig } from "./config";

console.group("Cleaning MIDI test artifacts");
const midiFileDir = import.meta.dirname;
const generatedDir = renderTestsConfig.paths.midiDir;
const renderedDir = renderTestsConfig.paths.renderedDir;
const rendererDir = path.join(midiFileDir, "renderer");

const pathsToRemove = [
    generatedDir,
    renderedDir,
    path.join(rendererDir, "bin"),
    path.join(rendererDir, "renderer.obj"),
    path.join(rendererDir, "renderer.pdb")
];

for (const target of pathsToRemove) {
    await fs.rm(target, { force: true, recursive: true });
    console.info(
        `Removed ${path.relative(path.join(midiFileDir, "..", ".."), target)}`
    );
}

console.groupEnd();
console.info("MIDI file test artifacts cleaned.");
