# Content modification dates

The last-modified plugin in `source.config.ts` uses `createGitLastModifiedResolver` to export only dates supported by the available Git history. That export feeds the sitemap `lastmod` of every page except blog posts, which carry their declared publication date both in the sitemap and as the Article `dateModified`, whatever their Git history says.

In a shallow clone, Git treats the oldest available commit as a root. A file unchanged within that history window can therefore appear to have changed at the shallow boundary. The resolver omits that date because the file's actual modification is unknown. Changes visible after the boundary retain their author dates. Linked worktrees use Git's resolved shallow metadata path.

Missing Git history, files absent from the current committed tree, and failed lookups also omit the generated date. Recreating a deleted path cannot inherit the deletion date, even when the new file is staged. The resolver never substitutes a build timestamp or file modification time and never fetches history. It reads repository boundaries and committed paths once per resolver instance; create a new instance after changing the available history.

When a page has no trustworthy generated date, the sitemap omits its `lastmod`, and a blog post without a valid publication date gets none either. Builds that require more Git-derived dates must provide sufficient history before loading content. On Vercel, whose clone holds only the last 10 commits, `scripts/vercel-build.sh` fetches the checked-out commit's commit and tree history, without file contents, from the repository URL before building; the resolver reads nothing else, so it still makes no network request. When that fetch fails, the build continues with the dates the shallow clone can prove.

Dates track changes to the MDX file itself. Changes to shared components or substituted commercial tokens are not included in the file's Git history.

`__tests__/git-last-modified.test.ts` creates disposable repositories to exercise full history, shallow history, deepening at the same revision, linked worktrees, literal paths, and absent history. `../seo/__tests__/sitemap.test.ts` verifies that blog posts keep their publication date, that other pages take the generated date, and that an undated page omits `lastmod`.
