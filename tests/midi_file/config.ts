import path from "node:path";

const midiFileDir = import.meta.dirname;
const rootDir = path.resolve(midiFileDir, "..", "..");
const renderedDir = path.join(midiFileDir, "output", "wav");
const rendererDir = path.join(midiFileDir, "renderer", "bin");

export const renderTestsConfig = {
    paths: {
        rootDir,
        midiDir: path.join(midiFileDir, "output", "midi"),
        renderedDir,
        checksums: path.join(renderedDir, "checksums.json"),
        rendererDir,
        vstDir: path.join(rootDir, "tests", "files", "vst"),
        soundFont: path.join(
            rootDir,
            "tests",
            "files",
            "sound_bank",
            "midi_render.sf2"
        )
    },
    renderTargets: {
        scva: {
            arch: "x64" as const,
            vstName: "SOUND Canvas VA.dll"
        },
        syxg50: {
            arch: "x86" as const,
            vstName: "syxg50.dll"
        }
    }
} as const;
