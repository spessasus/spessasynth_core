import { readFileSync } from "node:fs";
import path from "node:path";
import type MarkdownIt from "markdown-it";

const snippetPattern = /^--8<--\s+"([^"]+)"\s*$/;

export function snippetsPlugin(parser: MarkdownIt) {
    parser.core.ruler.push("snippets", (state) => {
        for (const token of state.tokens) {
            if (token.type !== "fence") continue;

            const match = snippetPattern.exec(token.content.trim());
            if (!match) continue;

            // Resolve snippet path
            const requestedPath = match[1];
            const examplesDirectory = path.resolve(process.cwd(), "examples");
            const snippetPath = path.resolve(examplesDirectory, requestedPath);
            const pathFromExamples = path.relative(
                examplesDirectory,
                snippetPath
            );
            if (
                path.isAbsolute(pathFromExamples) ||
                pathFromExamples === ".." ||
                pathFromExamples.startsWith(`..${path.sep}`)
            ) {
                throw new Error(`Invalid snippet path: ${requestedPath}`);
            }
            token.content = readFileSync(snippetPath, "utf8");
        }
    });
}
