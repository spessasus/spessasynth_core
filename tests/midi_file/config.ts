import fs from "node:fs/promises";
import path from "node:path";

export type RenderTargetConfig =
    | {
          /**
           * Windows VST2 plugin (x64)
           */
          type: "vst x64";
          /**
           * Path to the VST file.
           */
          path: string;
          /**
           * Whether this render target supports safe multithreaded rendering.
           * Set to false if unsure.
           */
          multithreaded?: boolean;
      }
    | {
          /**
           * Windows VST2 plugin (x86)
           */
          type: "vst x86";
          /**
           * Path to the VST file.
           */
          path: string;
          /**
           * Whether this render target supports safe multithreaded rendering.
           * Set to false if unsure.
           */
          multithreaded?: boolean;
      }
    | {
          /**
           * A native executable
           */
          type: "executable";

          /**
           * Path to the executable. Absolute, or relative to this file's directory.
           */
          path: string;

          /**
           * The parameters to pass. The value `input` will be replaced with the MIDI file path and `output` with the target wav path.
           * Example: `["--input", "input", "--output", "output"]` will produce `--input <midi path> --output <wav path>`
           */
          cli: string[];

          /**
           * Whether this render target supports safe multithreaded rendering.
           * Recommended to keep false unless the executable supports concurrent invocations.
           */
          multithreaded?: boolean;
      };

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
     * Map of render target identifiers to their respective native target configuration.
     */
    renderTargets?: Record<string, RenderTargetConfig>;
}

const configDir = import.meta.dirname;
const configPath = path.join(configDir, "config.json");
const exampleConfigPath = path.join(configDir, "config.example.json");

async function fileExists(filePath: string) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

export async function loadConfig(): Promise<RenderTestsConfig> {
    if (!(await fileExists(configPath))) {
        console.warn(
            `Configuration not found at: ${path.basename(configPath)}. Copying the example config.`
        );
        await fs.copyFile(exampleConfigPath, configPath);
    }

    const configJson = await fs.readFile(configPath, { encoding: "utf-8" });
    let config: RenderTestsConfig;
    try {
        // Remove schema
        const raw = JSON.parse(configJson) as RenderTestsConfig & {
            $schema?: string;
        };
        delete raw.$schema;
        config = raw;
    } catch (error) {
        throw new Error(`Failed to parse ${configPath}: ${String(error)}`, {
            cause: error
        });
    }

    // Resolve all paths to absolute
    return {
        ...config,
        paths: {
            rootDir: path.resolve(configDir, config.paths.rootDir),
            midiDir: path.resolve(configDir, config.paths.midiDir),
            renderedDir: path.resolve(configDir, config.paths.renderedDir),
            checksumsDir: path.resolve(configDir, config.paths.checksumsDir),
            rendererDir: path.resolve(configDir, config.paths.rendererDir),
            soundFont: path.resolve(configDir, config.paths.soundFont)
        },
        renderTargets: Object.fromEntries(
            Object.entries(config.renderTargets ?? {}).map(([key, target]) => [
                key,
                { ...target, path: path.resolve(configDir, target.path) }
            ])
        )
    };
}
