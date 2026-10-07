import type MarkdownIt from "markdown-it";

interface FootnoteEnvironment {
    definitions?: Record<
        string,
        {
            content: string;
            number: number;
        }
    >;
    references?: Set<string>;
    renderingNested?: boolean;
    renderingFootnotes?: boolean;
    footnoteSectionRendered?: boolean;
}

function getEnvironment(environment: unknown): FootnoteEnvironment {
    if (typeof environment === "object" && environment !== null)
        return environment;

    return {};
}

export function footnotePlugin(parser: MarkdownIt) {
    parser.block.ruler.before(
        "reference",
        "footnote_definition",
        (state, startLine, _endLine, silent) => {
            const lineStart = state.bMarks[startLine] + state.tShift[startLine];
            const lineEnd = state.eMarks[startLine];
            const match = /^\[\^([^\]]+)]:\s*(.*)$/.exec(
                state.src.slice(lineStart, lineEnd)
            );

            if (!match) return false;

            if (silent) return true;

            const environment = getEnvironment(state.env);
            const definitions = (environment.definitions ??= {});
            const number = Object.keys(definitions).length + 1;
            definitions[match[1]] = {
                content: match[2],
                number
            };
            state.line = startLine + 1;
            return true;
        }
    );

    parser.inline.ruler.before(
        "emphasis",
        "footnote_reference",
        (state, silent) => {
            const match = /^\[\^([^\]]+)]/.exec(
                state.src.slice(state.pos, state.posMax)
            );

            if (!match) return false;

            const environment = getEnvironment(state.env);
            const definition = environment.definitions?.[match[1]];
            if (!definition) return false;

            if (!silent) {
                const token = state.push("footnote_reference", "sup", 0);
                token.meta = {
                    id: match[1],
                    number: definition.number
                };
                (environment.references ??= new Set()).add(match[1]);
            }

            state.pos += match[0].length;
            return true;
        }
    );

    parser.core.ruler.push("footnote_section", (state) => {
        const environment = getEnvironment(state.env);
        if (
            environment.renderingNested ||
            environment.renderingFootnotes ||
            environment.footnoteSectionRendered ||
            !environment.references?.size
        ) {
            return;
        }

        const token = new state.Token("footnote_section", "", 0);
        token.block = true;
        state.tokens.push(token);
    });

    parser.renderer.rules.footnote_reference = (tokens, index) => {
        const token = tokens[index];
        const meta = token.meta as { id: string; number: number };
        const id = meta.id;
        const number = meta.number;
        return `<sup id="fnref-${id}"><a href="#fn-${id}">${number}</a></sup>`;
    };

    parser.renderer.rules.footnote_section = (
        _tokens,
        _index,
        _options,
        environment
    ) => {
        const footnoteEnvironment = getEnvironment(environment);
        const definitions = footnoteEnvironment.definitions;
        const references = footnoteEnvironment.references;
        if (!definitions || !references) return "";

        footnoteEnvironment.footnoteSectionRendered = true;
        const content = [...references]
            .map((id) => {
                const definition = definitions[id];
                footnoteEnvironment.renderingFootnotes = true;
                let renderedDefinition: string;
                try {
                    renderedDefinition = parser.render(
                        definition.content,
                        footnoteEnvironment
                    );
                } finally {
                    footnoteEnvironment.renderingFootnotes = false;
                }
                return `<li id="fn-${id}">${renderedDefinition} <a href="#fnref-${id}">↩</a></li>`;
            })
            .join("");
        return `<section class="footnotes"><hr><ol>${content}</ol></section>\n`;
    };
}
