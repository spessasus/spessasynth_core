import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Application, RendererEvent } from "typedoc";
import { escapeHTML } from "./shared";

const TITLE = "404 - Not Found";
const BODY = `<h1>${TITLE}</h1>
<p>The page you are looking for does not exist or has been moved.</p>
<p><a href="./index.html">Go back to the homepage</a>.</p>`;

// noinspection JSUnusedGlobalSymbols
export function load(application: Application) {
    application.renderer.on(RendererEvent.BEGIN, () => {
        application.renderer.postRenderAsyncJobs.push(
            async (event: RendererEvent) => {
                const { outputDirectory } = event;

                let html: string;
                try {
                    html = await readFile(
                        path.join(outputDirectory, "index.html"),
                        "utf8"
                    );
                } catch {
                    return;
                }
                html = html.replace(
                    /<title>[\s\S]*?<\/title>/,
                    `<title>${escapeHTML(TITLE)}</title>`
                );
                html = html.replace(
                    "<head>",
                    '<head><meta name="robots" content="noindex" />'
                );

                const contentStart = html.indexOf('<div class="col-content">');
                const sidebarStart = html.indexOf(
                    '<div class="col-sidebar">',
                    contentStart
                );
                if (contentStart !== -1 && sidebarStart > contentStart) {
                    html =
                        html.slice(0, contentStart) +
                        `<div class="col-content">\n<div class="tsd-panel tsd-typography">${BODY}</div></div>\n` +
                        html.slice(sidebarStart);
                }

                html = html.replace(
                    /<details open class="tsd-accordion tsd-page-navigation">[\s\S]*?<\/details>/,
                    ""
                );

                await writeFile(path.join(outputDirectory, "404.html"), html);
            }
        );
    });
}
