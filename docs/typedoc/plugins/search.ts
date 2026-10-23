import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Application, IndexEvent, RendererEvent } from "typedoc";

interface SearchSection {
    url: string;
    title: string;
    header: string | null;
    anchor: string | null;
    text: string;
}

const MAX_SECTION_TEXT = 1500;
const MAX_PREVIEW_TEXT = 400;

function unescapeHTML(html: string) {
    return html
        .replaceAll(/<[^>]*>/g, " ")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&quot;", '"')
        .replaceAll("&#39;", "'")
        .replaceAll("&amp;", "&")
        .replaceAll(/\s+/g, " ");
}

function truncated(text: string, length: number) {
    const clean = text.trim();
    return clean.length > length ? clean.slice(0, length) : clean;
}

// noinspection JSUnusedGlobalSymbols
export function load(application: Application) {
    application.renderer.on(IndexEvent.PREPARE_INDEX, (event: IndexEvent) => {
        const indexes: number[] = [];
        for (const [index, reflection] of event.searchResults.entries()) {
            if (reflection.isDocument()) indexes.push(index);
        }
        for (let at = indexes.length - 1; at >= 0; at--) {
            event.removeResult(indexes[at]);
        }
    });

    application.renderer.on(RendererEvent.BEGIN, () => {
        application.renderer.postRenderAsyncJobs.push(
            async (event: RendererEvent) => {
                const { outputDirectory, project } = event;

                const router = application.renderer.router;
                if (!router) return;

                const sections: SearchSection[] = [];
                const previews: Record<string, string> = {};
                for (const reflection of Object.values(project.reflections)) {
                    let url: string;
                    try {
                        url = router.getFullUrl(reflection);
                    } catch {
                        continue;
                    }
                    if (reflection.isDocument()) {
                        const file = url.endsWith("/")
                            ? path.join(outputDirectory, url, "index.html")
                            : path.join(outputDirectory, url);
                        let html: string;
                        try {
                            html = await readFile(file, "utf8");
                        } catch {
                            console.warn(`Cannot read ${file}`);
                            continue;
                        }

                        // Extract sections
                        const contentStart = html.indexOf("col-content");
                        const contentEnd = html.indexOf(
                            "col-sidebar",
                            contentStart
                        );
                        const body =
                            contentStart === -1
                                ? html
                                : html.slice(
                                      contentStart,
                                      contentEnd === -1 ? undefined : contentEnd
                                  );
                        const headings = [
                            ...body.matchAll(
                                /<h([2-6])\b[^>]*\bid="([^"]*)"[^>]*>([\s\S]*?)<\/h\1>/g
                            )
                        ];
                        const intro = truncated(
                            unescapeHTML(
                                body.slice(0, headings[0]?.index ?? body.length)
                            ),
                            MAX_SECTION_TEXT
                        );
                        if (intro)
                            sections.push({
                                url,
                                title: reflection.name,
                                header: null,
                                anchor: null,
                                text: intro
                            });

                        for (const [at, match] of headings.entries()) {
                            const next = headings[at + 1];
                            const text = truncated(
                                unescapeHTML(
                                    body.slice(
                                        (match.index ?? 0) + match[0].length,
                                        next?.index
                                    )
                                ),
                                MAX_SECTION_TEXT
                            );
                            if (!text) continue;

                            sections.push({
                                url,
                                title: reflection.name,
                                header: unescapeHTML(match[3]).trim() || null,
                                anchor: match[2],
                                text
                            });
                        }
                    } else if (
                        reflection.isDeclaration() &&
                        !reflection.flags.isExternal &&
                        reflection.comment
                    ) {
                        const text = truncated(
                            reflection.comment.summary
                                .map((part) => part.text)
                                .join(" "),
                            MAX_PREVIEW_TEXT
                        );
                        if (text) previews[url] = text;
                    }
                }
                const assets = path.join(outputDirectory, "assets");
                await mkdir(assets, { recursive: true });
                await writeFile(
                    path.join(assets, "search-sections.js"),
                    `window.searchSections = ${JSON.stringify({ sections, previews })};`
                );
            }
        );
    });
}
