import { Application } from "typedoc";
import type MarkdownIt from "markdown-it";

import { admonitionPlugin } from "./markdown-it/admonition";
import { footnotePlugin } from "./markdown-it/footnotes";
import { snippetsPlugin } from "./markdown-it/snippets";

// noinspection JSUnusedGlobalSymbols
export function load(application: Application) {
    application.on(Application.EVENT_BOOTSTRAP_END, () => {
        application.options.setValue(
            "markdownItLoader",
            (parser: MarkdownIt) => {
                parser.use(admonitionPlugin);
                parser.use(footnotePlugin);
                parser.use(snippetsPlugin);
                // Wrap tables so wide ones can scroll
                parser.renderer.rules.table_open = (
                    tokens,
                    index,
                    options,
                    _env,
                    self
                ) =>
                    `<div class="tsd-table-wrapper">${self.renderToken(tokens, index, options)}`;
                parser.renderer.rules.table_close = (
                    tokens,
                    index,
                    options,
                    _env,
                    self
                ) => `${self.renderToken(tokens, index, options)}</div>`;
            }
        );
    });
}
