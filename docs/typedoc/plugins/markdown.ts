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
            }
        );
    });
}
