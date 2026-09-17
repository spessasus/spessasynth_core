(() => {
    let lastSectionQuery = null;
    let sectionIdCounter = 0;

    function searchBase() {
        let base = document.documentElement.dataset.base || "./";
        if (!base.endsWith("/")) {
            base += "/";
        }
        return base;
    }

    function escapeHTML(text) {
        return text
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    }

    function highlightSearchWords(escapedText, words) {
        let out = escapedText;
        for (const word of words) {
            if (!word) {
                continue;
            }
            const safe = word.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
            out = out.replaceAll(
                new RegExp(`(${safe})`, "gi"),
                "<mark>$1</mark>"
            );
        }
        return out;
    }

    function buildSearchSnippet(text, words) {
        const lower = text.toLowerCase();
        let first = -1;
        for (const word of words) {
            if (!word) {
                continue;
            }
            const at = lower.indexOf(word.toLowerCase());
            if (at !== -1 && (first === -1 || at < first)) {
                first = at;
            }
        }
        if (first === -1) {
            const head = text.slice(0, 140);
            return highlightSearchWords(escapeHTML(head), words);
        }
        const start = Math.max(0, first - 60);
        const end = Math.min(text.length, first + 140);
        const raw =
            (start > 0 ? "…" : "") +
            text.slice(start, end) +
            (end < text.length ? "…" : "");
        return highlightSearchWords(escapeHTML(raw), words);
    }

    function updateAll() {
        // Update navigation
        {
            for (const link of document.querySelectorAll(
                ".tsd-navigation a, .tsd-navigation span"
            )) {
                const label = link.querySelector("span") ?? link;
                const text = label.textContent.trim();

                if (
                    text === "Index" &&
                    link instanceof HTMLAnchorElement &&
                    link.href.endsWith("/modules.html")
                ) {
                    link.closest("li")?.remove();
                }
            }
        }

        // Move theme toggle
        {
            const toggle = document.querySelector(".tsd-theme-toggle");
            const toolbar = document.querySelector(".tsd-toolbar-contents");
            const searchTrigger = document.getElementById("tsd-search-trigger");
            if (toggle && toolbar) {
                if (
                    toggle.parentElement !== toolbar ||
                    toggle.nextElementSibling !== searchTrigger
                ) {
                    toolbar.insertBefore(toggle, searchTrigger);
                }
            }
        }

        // Replace selector with icons
        {
            const select = document.getElementById("tsd-theme");
            const existingButton = document.getElementById("tsd-theme-button");
            if (select instanceof HTMLSelectElement && !existingButton) {
                // Icons are Lucide (https://lucide.dev)
                // ISC license
                const icons = {
                    os: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v2"/><path d="M14.837 16.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715"/><path d="M16 12a4 4 0 0 0-4-4"/><path d="m19 5-1.256 1.256"/><path d="M20 12h2"/></svg>',
                    light: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
                    dark: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/></svg>'
                };
                const labels = {
                    os: "System",
                    light: "Light",
                    dark: "Dark"
                };
                const order = ["os", "light", "dark"];
                const button = document.createElement("button");
                button.id = "tsd-theme-button";
                button.className = "tsd-widget";
                button.type = "button";
                const updateIcon = () => {
                    const value = select.value;
                    button.innerHTML = icons[value] ?? icons.os;
                    const label = `Theme: ${labels[value] ?? value} (click to change)`;
                    button.setAttribute("aria-label", label);
                    button.title = label;
                };
                button.addEventListener("click", () => {
                    select.value =
                        order[(order.indexOf(select.value) + 1) % order.length];
                    select.dispatchEvent(
                        new Event("change", { bubbles: true })
                    );
                    updateIcon();
                });
                select.addEventListener("change", updateIcon);
                select.insertAdjacentElement("afterend", button);
                updateIcon();
            }
        }

        // Hide settings on md files
        {
            /**
             * @type {HTMLElement}
             */
            const settings = document.querySelector(".tsd-navigation.settings");
            if (settings) {
                settings.style.display = document.querySelector(
                    'meta[name="page-kind"][content="document"]'
                )
                    ? "none"
                    : "";
            }
        }

        // Enhance search results
        {
            // Load search sections
            if (
                !("searchSections" in window) &&
                !document.getElementById("tsd-search-sections")
            ) {
                const script = document.createElement("script");
                script.id = "tsd-search-sections";
                script.async = true;
                script.src = `${searchBase()}assets/search-sections.js`;
                script.onload = () => updateAll();
                document.head.appendChild(script);
            }

            const results = document.getElementById("tsd-search-results");
            /**
             * @type {HTMLInputElement}
             */
            const input = document.getElementById("tsd-search-input");
            /**
             * @type {{sections: SearchSection[], previews: Record<string, string>}}
             */
            const data = window.searchSections;
            if (!results || !input || !data) {
                return;
            }
            const words = input.value.trim().split(/\s+/).filter(Boolean);
            for (const item of results.querySelectorAll(
                ":scope > li:not([data-enhanced])"
            )) {
                item.setAttribute("data-enhanced", "true");
                const anchor = item.querySelector(":scope > a");
                const text = item.querySelector(":scope > a > span.text");
                if (!anchor || !text) continue;

                // Find search preview
                const previews = data.previews || {};
                let preview;
                let path;
                try {
                    path = new URL(anchor.href, window.location.href).pathname;
                } catch {
                    continue;
                }
                for (const key of Object.keys(previews)) {
                    if (path.endsWith(`/${key}`)) {
                        preview = previews[key];
                    }
                }

                if (!preview) continue;

                const snippet = document.createElement("span");
                snippet.className = "preview";
                snippet.innerHTML = buildSearchSnippet(preview, words);
                text.append(snippet);
            }
            const query = words.join(" ");
            if (
                query === lastSectionQuery &&
                results.querySelector(":scope > li[data-section]")
            ) {
                return;
            }
            lastSectionQuery = query;
            results
                .querySelectorAll(":scope > li[data-section]")
                .forEach((node) => node.remove());
            if (!words.length) {
                return;
            }
            const scored = [];
            for (const section of data.sections || []) {
                // Score search section
                let score = 0;
                const header = (section.header || "").toLowerCase();
                const text = section.text.toLowerCase();
                for (const word of words) {
                    if (!word) continue;
                    if (header.includes(word)) score += 10;
                    if (text.includes(word)) score += 1;
                }
                if (score > 0) scored.push([score, section]);
            }
            scored.sort((a, b) => b[0] - a[0]);
            const base = searchBase();
            const label = window.translations?.["kind_8388608"] ?? "Document";
            for (const entry of scored.slice(0, 6)) {
                const section = entry[1];
                const name = section.header
                    ? `${section.title}: ${section.header}`
                    : section.title;
                const item = document.createElement("li");
                item.setAttribute("role", "option");
                item.id = `tsd-search:sections-${sectionIdCounter++}`;
                item.setAttribute("aria-selected", "false");
                item.setAttribute("data-section", "true");
                const anchor = document.createElement("a");
                anchor.tabIndex = -1;
                anchor.href =
                    base +
                    section.url +
                    (section.anchor ? `#${section.anchor}` : "");
                anchor.innerHTML =
                    `<svg width="20" height="20" class="tsd-kind-icon" aria-label="${label}"><use href="#icon-8388608"></use></svg>` +
                    `<span class="text">${highlightSearchWords(escapeHTML(name), words)}` +
                    `<span class="preview">${buildSearchSnippet(section.text, words)}</span></span>`;
                item.append(anchor);
                results.append(item);
            }
        }
    }

    const observer = new MutationObserver(updateAll);
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
    // Fix search dialog not closing when on the same page
    {
        const results = document.getElementById("tsd-search-results");
        const dialog = document.getElementById("tsd-search");
        if (!(results && dialog instanceof HTMLDialogElement)) return;

        const pagePath = (pathname) =>
            pathname.replace(/\/index\.html$/, "").replace(/\/+$/, "") || "/";
        results.addEventListener("click", (event) => {
            if (!(event.target instanceof Element)) return;

            const anchor = event.target.closest("a");
            if (!anchor || !dialog.open) return;

            let target;
            try {
                target = new URL(anchor.href);
            } catch {
                return;
            }
            if (
                target.origin !== window.location.origin ||
                pagePath(target.pathname) !== pagePath(window.location.pathname)
            ) {
                return;
            }
            document.getElementById("tsd-overlay")?.classList?.add("closing");
            dialog.classList.add("closing");
        });
    }
    updateAll();
})();
