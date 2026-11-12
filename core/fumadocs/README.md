# Content modification dates

The last-modified plugin in `source.config.ts` uses `createGitLastModifiedResolver` to export only dates supported by the available Git history. That export feeds the sitemap `lastmod` of every page except blog posts, which carry their declared publication date both in the sitemap and as the Article `dateModified`, whatever their Git history says. A post therefore has no separate revision date: only changing its declared date moves it. The schema rejects a malformed or quoted impossible date, which fails the MDX build; YAML rolls an unquoted impossible date such as `2026-02-30` into a valid one before the schema sees it, so `tests/conventions/blog-publication-dates.test.ts` checks the raw frontmatter in `yarn test`. The `/blog` hub carries the newer of its own date and its newest post's date in that locale.

In a shallow clone, Git treats the oldest available commit as a root. A file unchanged within that history window can therefore appear to have changed at the shallow boundary. The resolver omits that date because the file's actual modification is unknown. Changes visible after the boundary retain their author dates. Linked worktrees use Git's resolved shallow metadata path.

Missing Git history, files absent from the current committed tree, and failed lookups also omit the generated date. Recreating a deleted path cannot inherit the deletion date, even when the new file is staged. The resolver never substitutes a build timestamp or file modification time and never fetches history. It reads repository boundaries and committed paths once per resolver instance; create a new instance after changing the available history.

When a page has no trustworthy generated date, the sitemap omits its `lastmod`, and a blog post without a valid publication date gets none either. Builds that require more Git-derived dates must provide sufficient history before loading content. On Vercel, whose clone holds only the last 10 commits, `scripts/vercel-build.sh` fetches the checked-out commit's commit and tree history, without file contents, from the repository URL before building; the resolver reads nothing else, so it still makes no network request. When that fetch fails, the build continues with the dates the shallow clone can prove.

Dates track changes to the MDX file itself. Changes to shared components or substituted commercial tokens are not included in the file's Git history.

`__tests__/git-last-modified.test.ts` creates disposable repositories to exercise full history, shallow history, deepening at the same revision, linked worktrees, literal paths, and absent history. `../seo/__tests__/sitemap.test.ts` verifies that blog posts keep their publication date, that other pages take the generated date, and that an undated page omits `lastmod`.

# Content sources and server function size

`source.config.ts` registers `collection-modules.ts`, which writes two modules per collection next to the stock `.source/server.ts` (which nothing imports any more):

- `.source/heads/<collection>.ts` holds only the frontmatter of every file (the loader's `only=frontmatter` query, so schema validation and the commercial tokens still apply) and the Git last-modified date. `source.ts` builds the `*Source` loaders from these heads. Metadata, the sitemap, the footer, related links, hubs, `generateStaticParams` and the auth pages read them, so they bundle a few MB of frontmatter and no compiled MDX.
- `.source/bodies/<collection>.ts` is the stock fumadocs module with the compiled MDX of that one collection. Only `body-sources/<collection>.ts` imports it, and only the page that renders that collection's body imports the body source (`tests/conventions/content-source-size.test.ts` lists them).

Before this split every function that imported `source.ts` (all auth pages through `generateMetadataFromMeta`, the footer, the sitemap) traced one 159 MB chunk with the compiled MDX of all 21 collections in all eight locales, which put `[locale]/auth/forgot-password` above Vercel's 250 MB limit. A page that needs a body must import its `body-sources` module; a page that only needs titles, descriptions, slugs or dates must keep using `source.ts`.

Heads keep dates as the loader writes them (`Date` values arrive as ISO strings); every consumer already passes them through `new Date(...)`. `getText`, `getMDAST` and the compiled `structuredData` exist only on body sources.
