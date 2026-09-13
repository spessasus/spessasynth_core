import { Application, PageEvent, Renderer } from "typedoc";
import { escapeHTML } from "./shared";

const HOME_URL = "index.html";

// noinspection JSUnusedGlobalSymbols
export function load(application: Application) {
    application.renderer.on(Renderer.EVENT_END_PAGE, (event: PageEvent) => {
        if (event.url !== HOME_URL || !event.contents) {
            return;
        }
        // Retitle home page
        const withoutHeader = event.contents.replace(
            /<div class="tsd-page-title">[\s\S]*?<h1>[\s\S]*?<\/h1>\s*<\/div>/,
            ""
        );
        if (withoutHeader === event.contents) return;

        const heading = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(withoutHeader);
        if (!heading) return;

        const title = heading[1]
            .replaceAll(/<[^>]*>/g, "")
            .replaceAll("&lt;", "<")
            .replaceAll("&gt;", ">")
            .replaceAll("&quot;", '"')
            .replaceAll("&#39;", "'")
            .replaceAll("&amp;", "&")
            .trim();
        if (!title) return;

        event.contents = withoutHeader.replace(
            /<title>[\s\S]*?<\/title>/,
            `<title>${escapeHTML(title)}</title>`
        );
    });
}
