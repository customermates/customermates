# Content modification dates

The last-modified plugin in `source.config.ts` uses `createGitLastModifiedResolver` to export only dates supported by the available Git history. The same export feeds sitemap `lastmod` and blog Article `dateModified`.

In a shallow clone, Git treats the oldest available commit as a root. A file unchanged within that history window can therefore appear to have changed at the shallow boundary. The resolver omits that date because the file's actual modification is unknown. Changes visible after the boundary retain their author dates. Linked worktrees use Git's resolved shallow metadata path.

Missing Git history, files absent from the current committed tree, and failed lookups also omit the generated date. Recreating a deleted path cannot inherit the deletion date, even when the new file is staged. The resolver never substitutes a build timestamp or file modification time and never fetches history. It reads repository boundaries and committed paths once per resolver instance; create a new instance after changing the available history.

When no trustworthy generated date exists, the sitemap uses a valid declared blog publication date, or omits `lastmod` for undated pages. Blog Article metadata keeps its declared publication-date fallback. Builds that require more Git-derived dates must provide sufficient history before loading content.

Dates track changes to the MDX file itself. Changes to shared components or substituted commercial tokens are not included in the file's Git history.

`__tests__/git-last-modified.test.ts` creates disposable repositories to exercise full history, shallow history, deepening at the same revision, linked worktrees, literal paths, and absent history. `../seo/__tests__/sitemap.test.ts` verifies the publication-date fallback and omission for undated pages.
