import {
    Application,
    Comment,
    CommentTag,
    ContainerReflection,
    Converter,
    DefaultTheme,
    type NavigationElement,
    ProjectReflection,
    RendererEvent
} from "typedoc";

const TOP_LEVEL_CATEGORY = "none";

function topLevel(title: string) {
    return title.toLocaleLowerCase() === TOP_LEVEL_CATEGORY;
}

function liftTopLevelNodes(nodes: NavigationElement[] | undefined) {
    if (!nodes) return nodes;

    const lifted: NavigationElement[] = [];
    const others: NavigationElement[] = [];
    for (const node of nodes) {
        if (node.children && topLevel(node.text)) {
            lifted.push(...(liftTopLevelNodes(node.children) ?? []));
        } else {
            if (node.children) {
                node.children = liftTopLevelNodes(node.children);
            }
            others.push(node);
        }
    }
    return [...lifted, ...others];
}

const API_REFERENCE_TITLE = "API Reference";

const patchedThemes = new WeakSet<DefaultTheme>();

// noinspection JSUnusedGlobalSymbols
export function load(application: Application) {
    application.converter.on(Converter.EVENT_RESOLVE_END, (context) => {
        // Normalize group tags
        const project = context.project;
        for (const reflection of Object.values(project.reflections)) {
            if (!reflection.isDeclaration()) continue;

            // Associated comments
            const comments: Comment[] = [];
            if (reflection.comment) comments.push(reflection.comment);
            for (const signature of reflection.getNonIndexSignatures()) {
                if (signature.comment) comments.push(signature.comment);
            }
            const typeDeclaration =
                reflection.type?.type === "reflection"
                    ? reflection.type.declaration
                    : undefined;
            if (typeDeclaration?.comment)
                comments.push(typeDeclaration.comment);
            if (typeDeclaration) {
                for (const signature of typeDeclaration.getNonIndexSignatures()) {
                    if (signature.comment) comments.push(signature.comment);
                }
            }
            if (comments.length === 0) continue;

            const categories = new Set<string>();
            for (const comment of comments) {
                for (const tag of comment.blockTags) {
                    if (tag.tag === "@category") {
                        const value = Comment.combineDisplayParts(
                            tag.content
                        ).trim();
                        if (value) categories.add(value);
                    }
                }
            }

            let foundGroup = false;
            let hasTopLevelGroup = false;
            for (const comment of comments) {
                const kept = comment.blockTags.filter(
                    (tag) => tag.tag !== "@group"
                );
                for (const tag of comment.blockTags) {
                    if (tag.tag !== "@group") continue;

                    foundGroup = true;
                    const value = Comment.combineDisplayParts(
                        tag.content
                    ).trim();
                    // Split group value
                    const separator = value.indexOf(".");
                    let group: string;
                    let category: string | undefined;
                    if (separator === -1) {
                        group = value.trim();
                    } else {
                        group = value.slice(0, separator).trim();
                        category =
                            value.slice(separator + 1).trim() || undefined;
                    }
                    if (!group) continue;

                    kept.push(
                        new CommentTag("@group", [
                            { kind: "text", text: group }
                        ])
                    );
                    if (category) categories.add(category);
                    else hasTopLevelGroup = true;
                }
                comment.blockTags = kept;
            }

            if (!foundGroup) continue;

            if (hasTopLevelGroup && categories.size === 0) {
                categories.add(TOP_LEVEL_CATEGORY);
            }

            const home = reflection.comment ?? comments[0];
            const homeCategories = new Set(
                home.blockTags
                    .filter((tag) => tag.tag === "@category")
                    .map((tag) =>
                        Comment.combineDisplayParts(tag.content).trim()
                    )
            );
            for (const category of categories) {
                if (!homeCategories.has(category)) {
                    home.blockTags.push(
                        new CommentTag("@category", [
                            { kind: "text", text: category }
                        ])
                    );
                    homeCategories.add(category);
                }
            }
        }
    });
    application.converter.on(
        Converter.EVENT_RESOLVE_END,
        (context) => {
            // Promote top level groups
            const containers: ContainerReflection[] = [context.project];
            for (const reflection of Object.values(
                context.project.reflections
            )) {
                if (
                    reflection instanceof ContainerReflection &&
                    reflection !== context.project
                ) {
                    containers.push(reflection);
                }
            }

            for (const container of containers) {
                for (const group of container.groups ?? []) {
                    if (!group.categories?.length) {
                        continue;
                    }

                    if (
                        group.categories.length === 1 &&
                        topLevel(group.categories[0].title)
                    ) {
                        group.categories = undefined;
                        continue;
                    }

                    group.categories.sort((a, b) => {
                        const aTop = topLevel(a.title) ? 0 : 1;
                        const bTop = topLevel(b.title) ? 0 : 1;
                        // Keep CategoryPlugin order otherwise
                        return aTop - bTop;
                    });
                }
            }
        },
        -300
    );

    application.renderer.on(RendererEvent.BEGIN, () => {
        // Patch navigation to lift top level
        const theme = application.renderer.theme;
        if (!(theme instanceof DefaultTheme) || patchedThemes.has(theme)) {
            return;
        }
        patchedThemes.add(theme);
        const original = theme.buildNavigation.bind(theme);
        theme.buildNavigation = (project: ProjectReflection) => {
            const lifted = liftTopLevelNodes(original(project)) ?? [];
            // Group top level navigation
            const api: NavigationElement[] = [];
            let articles: NavigationElement[] = [];
            for (const node of lifted) {
                if (node.text === "Documents") {
                    articles = node.children ?? [];
                } else {
                    api.push(node);
                }
            }
            const grouped: NavigationElement[] = [...articles];
            if (api.length > 0)
                grouped.push({ text: API_REFERENCE_TITLE, children: api });

            return grouped;
        };
    });
}
