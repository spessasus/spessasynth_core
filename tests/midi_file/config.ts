import path from "node:path";

const midiFileDir = import.meta.dirname;
const rootDir = path.resolve(midiFileDir, "..", "..");
const renderedDir = path.join(midiFileDir, "output", "wav");
const rendererDir = path.join(midiFileDir, "renderer", "bin");

/**
 * Target architecture for the VST native host renderer binary.
 */
export type RenderTargetArch = "x86" | "x64";

export interface RenderTargetConfig {
    /**
     * Target architecture the plugin uses.
     */
    arch: RenderTargetArch;
    /**
     * Path to the VST file.
     */
    vstPath: string;
    /**
     * Whether this render target supports safe multithreaded rendering.
     * Set to false if unsure.
     */
    multithreaded: boolean;
}

export interface RenderTestsPaths {
    /**
     * Repository root directory.
     */
    rootDir: string;
    /**
     * Directory where generated MIDI test files are stored.
     */
    midiDir: string;
    /**
     * Directory where rendered WAV and log outputs are saved.
     */
    renderedDir: string;
    /**
     * Directory where per-target checksum JSON files are stored to skip already rendered files.
     */
    checksumsDir: string;
    /**
     * Directory containing native renderer binaries.
     */
    rendererDir: string;
    /**
     * Path to the SoundFont file used by SpessaSynth.
     */
    soundFont: string;
}

export interface RenderTestsConfig {
    /**
     * Amplitude threshold below which leading audio samples are considered silence and trimmed.
     */
    trimThreshold: number;
    /**
     * Filesystem paths used during MIDI generation and rendering.
     */
    paths: RenderTestsPaths;
    /**
     * Options and parameters for SpessaSynth rendering.
     */
    spessasynth: {
        /**
         * Sample rate in Hz.
         */
        sampleRate: number;
        /**
         * Extra audio tail length in seconds to render after the MIDI duration ends.
         */
        tailSeconds: number;
        /**
         * Audio buffer size in frames per process tick.
         */
        bufferSize: number;
        /**
         * Output file name for SpessaSynth execution logs.
         */
        logFileName: string;
        /**
         * Output file name for the rendered SpessaSynth WAV audio.
         */
        outputFileName: string;
    };
    /**
     * Map of render target identifiers to their respective VST configuration.
     */
    renderTargets: Record<string, RenderTargetConfig>;
}

/**
 * Configuration options and render targets for MIDI test rendering.
 */
export const renderTestsConfig: RenderTestsConfig = {
    trimThreshold: 0.0005,
    paths: {
        rootDir,
        midiDir: path.join(midiFileDir, "output", "midi"),
        renderedDir,
        checksumsDir: path.join(midiFileDir, "output", "checksums"),
        rendererDir,
        soundFont: path.join(
            rootDir,
            "tests",
            "files",
            "sound_bank",
            "midi_render.sf2"
        )
    },
    spessasynth: {
        sampleRate: 48_000,
        tailSeconds: 2,
        bufferSize: 128,
        logFileName: "spessa.log",
        outputFileName: "spessa.wav"
    },
    renderTargets: {
        scva: {
            arch: "x64",
            vstPath: path.join(
                rootDir,
                "tests",
                "files",
                "vst",
                "SOUND Canvas VA.dll"
            ),
            multithreaded: false
        },
        syxg50: {
            arch: "x86",
            vstPath: path.join(rootDir, "tests", "files", "vst", "syxg50.dll"),
            multithreaded: true
        }
    }
};
