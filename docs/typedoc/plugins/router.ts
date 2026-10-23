import path from "node:path";
import {
    Application,
    KindDirRouter,
    PageEvent,
    PageKind,
    ProjectReflection,
    type Reflection,
    Renderer
} from "typedoc";

// Keep the original file path when making documents
class DocumentPathRouter extends KindDirRouter {
    private documentPaths = new Map<Reflection, string>();

    public override buildPages(project: ProjectReflection) {
        this.documentPaths.clear();
        for (const reflection of Object.values(project.reflections)) {
            if (!reflection.isDocument()) continue;
            const file = project.files.getReflectionPath(reflection);
            if (!file) continue;
            // Builds run from the repo root
            const rel = path
                .relative(process.cwd(), file)
                .split(path.sep)
                .join("/");
            if (!rel.startsWith("docs/")) continue;

            const withoutRoot = rel
                .slice("docs/".length)
                .replace(/\.[^.]+$/, "");
            if (!withoutRoot || withoutRoot === "index") continue;

            const relPath = withoutRoot.endsWith("/index")
                ? withoutRoot.slice(0, -"/index".length)
                : withoutRoot;
            this.documentPaths.set(reflection, relPath);
        }
        return super.buildPages(project);
    }

    protected override getIdealBaseName(reflection: Reflection) {
        if (reflection.isDocument()) {
            return (
                this.documentPaths.get(reflection) ??
                super.getIdealBaseName(reflection)
            );
        }
        return super.getIdealBaseName(reflection);
    }
}

// noinspection JSUnusedGlobalSymbols
export function load(application: Application) {
    application.renderer.defineRouter("document-paths", DocumentPathRouter);
    application.renderer.on(Renderer.EVENT_END_PAGE, (event: PageEvent) => {
        if (!event.contents || event.pageKind !== PageKind.Document) return;
        event.contents = event.contents.replace(
            "</head>",
            '<meta name="page-kind" content="document" />\n</head>'
        );
    });
}
