import { cp, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Application, RendererEvent } from "typedoc";

const STYLES_DIRECTORY = path.resolve("docs", "typedoc", "styles");

// noinspection JSUnusedGlobalSymbols
export function load(application: Application) {
    void (async () => {
        // Watch styles
        let entries: string[];
        try {
            entries = await readdir(STYLES_DIRECTORY);
        } catch {
            // No styles
            return;
        }
        for (const file of entries) {
            application.watchFile(path.join(STYLES_DIRECTORY, file));
        }
    })();
    application.renderer.on(RendererEvent.BEGIN, () => {
        application.renderer.preRenderAsyncJobs.push(
            async (event: RendererEvent) => {
                // Copy styles
                try {
                    await stat(STYLES_DIRECTORY);
                } catch {
                    // No styles
                    return;
                }
                await cp(
                    STYLES_DIRECTORY,
                    path.join(event.outputDirectory, "assets", "styles"),
                    {
                        recursive: true
                    }
                );
            }
        );
    });
}
