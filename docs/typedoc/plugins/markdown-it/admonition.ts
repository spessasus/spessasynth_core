import type MarkdownIt from "markdown-it";

const ADMONITION_HEADER =
    /^>\s*\*\*(tip|note|important|warning|danger)\*\*\s*$/i;
const EMPTY_QUOTE_OR_BLANK = /^(>\s*)?\s*$/;

export function admonitionPlugin(parser: MarkdownIt) {
    parser.block.ruler.before(
        "fence",
        "admonition",
        (state, startLine, endLine, silent) => {
            const lineStart = state.bMarks[startLine] + state.tShift[startLine];
            const lineEnd = state.eMarks[startLine];
            const match = ADMONITION_HEADER.exec(
                state.src.slice(lineStart, lineEnd)
            );

            if (!match) return false;

            if (silent) return true;

            let nextLine = startLine + 1;
            let contentEnd = nextLine;
            while (nextLine < endLine) {
                const nextStart =
                    state.bMarks[nextLine] + state.tShift[nextLine];
                const nextEnd = state.eMarks[nextLine];
                const line = state.src.slice(nextStart, nextEnd);

                // A new admonition always starts a new block
                if (ADMONITION_HEADER.test(line)) break;

                if (line.startsWith(">")) {
                    nextLine++;
                    if (!EMPTY_QUOTE_OR_BLANK.test(line)) contentEnd = nextLine;
                    continue;
                }

                if (line.trim().length === 0) {
                    nextLine++;
                    continue;
                }

                break;
            }

            const token = state.push("admonition", "aside", 0);
            token.block = true;
            token.map = [startLine, contentEnd];
            token.info = match[1].toLowerCase();
            token.meta = {
                content: state
                    .getLines(startLine + 1, contentEnd, 0, true)
                    .split("\n")
                    .map((line) => line.replace(/^>\s?/, ""))
                    .join("\n")
            };
            // Skip separator lines so they don't render as empty blockquotes
            state.line = nextLine;
            return true;
        }
    );

    parser.renderer.rules.admonition = (tokens, index, _options, env) => {
        const token = tokens[index];
        const label = token.info.charAt(0).toUpperCase() + token.info.slice(1);
        const meta = token.meta as {
            content: string;
        };
        // Render nested environment
        const content = parser.render(
            meta.content,
            typeof env === "object" && env !== null
                ? {
                      ...(env as Record<string, unknown>),
                      renderingNested: true
                  }
                : { renderingNested: true }
        );
        return `<aside class="tsd-admonition tsd-admonition-${token.info}"><strong>${label}</strong>${content}</aside>\n`;
    };
}
