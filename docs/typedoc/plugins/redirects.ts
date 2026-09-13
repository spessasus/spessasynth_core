import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Application, type DocumentReflection, RendererEvent } from "typedoc";
import { escapeHTML } from "./shared";

const REDIRECTS = [
    "extra/about-multi-port",
    "extra/converting-between-formats",
    "extra/developer-docs",
    "extra/dls-conversion-problem",
    "extra/generator-types",
    "extra/kinds-of-parameters",
    "extra/midi-implementation",
    "extra/modulator-information",
    "getting-started"
];

// noinspection JSUnusedGlobalSymbols
export function load(application: Application) {
    application.renderer.on(RendererEvent.BEGIN, () => {
        application.renderer.preRenderAsyncJobs.push(
            async (event: RendererEvent) => {
                // Write redirects
                const { outputDirectory, project } = event;
                const router = application.renderer.router;
                if (!router) return;

                for (const oldPath of REDIRECTS) {
                    const clean = oldPath.trim().replace(/\/+$/, "");
                    if (
                        !clean ||
                        path.posix.isAbsolute(clean) ||
                        clean.split("/").includes("..")
                    )
                        continue;

                    // Resolve source file
                    let sourceFile: string | undefined;
                    for (const candidate of [
                        path.resolve("docs", clean + ".md"),
                        path.resolve("docs", clean, "index.md")
                    ]) {
                        const stats = await stat(candidate).catch(
                            () => undefined
                        );
                        if (stats?.isFile()) {
                            sourceFile = candidate;
                            break;
                        }
                    }
                    if (!sourceFile) continue;

                    // Find document
                    const normalized = sourceFile.split(path.sep).join("/");
                    let document: DocumentReflection | undefined;
                    for (const reflection of Object.values(
                        project.reflections
                    )) {
                        if (!reflection.isDocument()) continue;
                        if (
                            project.files.getReflectionPath(reflection) ===
                            normalized
                        ) {
                            document = reflection;
                            break;
                        }
                    }
                    if (!document) continue;

                    let fullTarget: string;
                    try {
                        fullTarget = router.getFullUrl(document);
                    } catch {
                        continue;
                    }
                    const directoryTarget = fullTarget.endsWith("index.html")
                        ? fullTarget.slice(0, -"index.html".length)
                        : fullTarget;
                    const fromDirectory = clean + "/";
                    if (directoryTarget === fromDirectory) continue;

                    let href = path.posix.relative(
                        fromDirectory,
                        directoryTarget
                    );
                    if (href === "") {
                        href = "./";
                    } else if (!href.endsWith("/")) {
                        href += "/";
                    }

                    // Write redirect
                    const safeTitle = escapeHTML(document.name);
                    const safeTarget = escapeHTML(href);
                    const safeScriptTarget = JSON.stringify(href).replaceAll(
                        "<",
                        String.raw`\u003c`
                    );
                    const file = path.join(
                        outputDirectory,
                        clean,
                        "index.html"
                    );
                    await mkdir(path.dirname(file), { recursive: true });
                    await writeFile(
                        file,
                        `<!doctype html>
<html lang='en'>
<head>
<meta charset='utf-8' />
<meta name='viewport' content='width=device-width, initial-scale=1' />
<title>Redirecting to ${safeTitle}</title>
<link rel='canonical' href='${safeTarget}' />
<meta http-equiv='refresh' content='0; url=${safeTarget}' />
<style>*{background: #000; color: #ccc;}</style>
</head>
<body>
<p>This page has moved. Redirecting to <a href='${safeTarget}'>${safeTitle}</a>.</p>
<script>
(function () {
    let target = ${safeScriptTarget};
    const hash = window.location.hash;
    if (hash) {
        let name = hash.slice(1);
        try {
            name = decodeURIComponent(name);
        } catch {
        }
        target += "#" + encodeURIComponent(name);
    }
    window.location.replace(target);
})();
</script>
</body>
</html>
`
                    );
                    application.logger.verbose(
                        `Legacy redirect: "${fromDirectory}" -> "${href}".`
                    );
                }
            }
        );
    });
}
