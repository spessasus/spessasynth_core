import type MarkdownIt from "markdown-it";

export function admonitionPlugin(parser: MarkdownIt) {
    parser.block.ruler.before(
        "fence",
        "admonition",
        (state, startLine, endLine, silent) => {
            const lineStart = state.bMarks[startLine] + state.tShift[startLine];
            const lineEnd = state.eMarks[startLine];
            const match =
                /^>\s*\*\*(tip|note|important|warning|danger)\*\*\s*$/i.exec(
                    state.src.slice(lineStart, lineEnd)
                );

            if (!match) return false;

            if (silent) return true;

            let nextLine = startLine + 1;
            while (nextLine < endLine) {
                const nextStart =
                    state.bMarks[nextLine] + state.tShift[nextLine];
                const nextEnd = state.eMarks[nextLine];
                const line = state.src.slice(nextStart, nextEnd);

                if (line.length > 0 && !line.startsWith(">")) break;

                nextLine++;
            }

            const token = state.push("admonition", "aside", 0);
            token.block = true;
            token.map = [startLine, nextLine];
            token.info = match[1].toLowerCase();
            token.meta = {
                content: state
                    .getLines(startLine + 1, nextLine, 0, true)
                    .split("\n")
                    .map((line) => line.replace(/^>\s?/, ""))
                    .join("\n")
            };
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
