import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createGitLastModifiedResolver } from "../git-last-modified";

const execFileAsync = promisify(execFile);
const ORIGINAL_DATE = "2026-01-01T10:00:00.000Z";
const BOUNDARY_DATE = "2026-01-02T10:00:00.000Z";
const MODIFIED_DATE = "2026-01-03T10:00:00.000Z";
const LATEST_DATE = "2026-01-04T10:00:00.000Z";

let directory: string;
let repository: string;

async function git(cwd: string, args: string[], env: Partial<NodeJS.ProcessEnv> = {}) {
  const { stdout } = await execFileAsync("git", args, { cwd, env: { ...process.env, ...env } });

  return stdout.trim();
}

async function commit(file: string, contents: string, date: string) {
  await writeFile(path.join(repository, file), contents);
  await git(repository, ["add", "--", file]);
  await git(repository, ["-c", "commit.gpgsign=false", "commit", "-m", file], {
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
  });
}

async function cloneShallow() {
  const clone = path.join(directory, "shallow");

  await git(directory, ["clone", "--depth=3", pathToFileURL(repository).href, clone]);

  return clone;
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "content-last-modified-"));
  repository = path.join(directory, "repository");
  await mkdir(repository);
  await git(repository, ["init", "--initial-branch=main"]);
  await git(repository, ["config", "user.name", "Content date test"]);
  await git(repository, ["config", "user.email", "content-date@example.test"]);
  await mkdir(path.join(repository, "content"));
  await writeFile(path.join(repository, "content", "modified.mdx"), "Original content");
  await git(repository, ["add", "content/modified.mdx"]);
  await commit("content/old article.mdx", "Original article", ORIGINAL_DATE);
  await commit("unrelated.txt", "Boundary change", BOUNDARY_DATE);
  await commit("content/modified.mdx", "Updated content", MODIFIED_DATE);
  await commit("unrelated.txt", "Latest unrelated change", LATEST_DATE);
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("Git content modification dates", () => {
  it("keeps the actual content date across unrelated commits in full history", async () => {
    const resolve = createGitLastModifiedResolver(repository);

    expect((await resolve(path.join(repository, "content/old article.mdx")))?.toISOString()).toBe(ORIGINAL_DATE);
    expect((await resolve("content/modified.mdx"))?.toISOString()).toBe(MODIFIED_DATE);

    await commit("unrelated.txt", "Another deployment", "2026-01-05T10:00:00.000Z");

    expect((await createGitLastModifiedResolver(repository)("content/old article.mdx"))?.toISOString()).toBe(
      ORIGINAL_DATE,
    );
  });

  it("rejects the shallow boundary that Git presents as an old file's modification", async () => {
    const clone = await cloneShallow();
    const reportedDate = await git(clone, ["log", "-1", "--format=%aI", "--", "content/old article.mdx"]);

    expect(new Date(reportedDate).toISOString()).toBe(BOUNDARY_DATE);
    expect(await createGitLastModifiedResolver(clone)("content/old article.mdx")).toBeNull();
  });

  it("retains a real content modification inside the shallow history window", async () => {
    const clone = await cloneShallow();

    expect((await createGitLastModifiedResolver(clone)("content/modified.mdx"))?.toISOString()).toBe(MODIFIED_DATE);
  });

  it("recovers the original date after history is deepened without changing HEAD", async () => {
    const clone = await cloneShallow();
    const head = await git(clone, ["rev-parse", "HEAD"]);

    expect(await createGitLastModifiedResolver(clone)("content/old article.mdx")).toBeNull();
    await git(clone, ["fetch", "--unshallow"]);

    expect(await git(clone, ["rev-parse", "HEAD"])).toBe(head);
    expect((await createGitLastModifiedResolver(clone)("content/old article.mdx"))?.toISOString()).toBe(ORIGINAL_DATE);
  });

  it("finds shallow metadata through a linked worktree and a nested working directory", async () => {
    const clone = await cloneShallow();
    const worktree = path.join(directory, "linked-worktree");

    await git(clone, ["worktree", "add", "--detach", worktree]);
    const resolve = createGitLastModifiedResolver(path.join(worktree, "content"));

    expect(await resolve("old article.mdx")).toBeNull();
    expect((await resolve("modified.mdx"))?.toISOString()).toBe(MODIFIED_DATE);
  });

  it("resolves repository and file paths through a directory symlink", async () => {
    const linked = path.join(directory, "linked-repository");

    await symlink(repository, linked, "dir");

    expect(
      (await createGitLastModifiedResolver(linked)(path.join(linked, "content/old article.mdx")))?.toISOString(),
    ).toBe(ORIGINAL_DATE);
  });

  it("omits dates for untracked and missing files instead of using file or build time", async () => {
    await writeFile(path.join(repository, "content", "generated.mdx"), "Generated documentation");
    const resolve = createGitLastModifiedResolver(repository);

    expect(await resolve("content/generated.mdx")).toBeNull();
    expect(await resolve("content/missing.mdx")).toBeNull();
  });

  it("does not reuse a deletion date when an untracked or staged file recreates that path", async () => {
    const file = "content/old article.mdx";
    const deletionDate = "2026-01-05T10:00:00.000Z";

    await git(repository, ["rm", "--", file]);
    await git(repository, ["-c", "commit.gpgsign=false", "commit", "-m", "Remove article"], {
      GIT_AUTHOR_DATE: deletionDate,
      GIT_COMMITTER_DATE: deletionDate,
    });
    await writeFile(path.join(repository, file), "New generated content");

    expect(new Date(await git(repository, ["log", "-1", "--format=%aI", "--", file])).toISOString()).toBe(deletionDate);
    expect(await createGitLastModifiedResolver(repository)(file)).toBeNull();

    await git(repository, ["add", "--", file]);

    expect(await createGitLastModifiedResolver(repository)(file)).toBeNull();
  });

  it("omits dates when Git history is unavailable", async () => {
    const exported = path.join(directory, "exported");

    await mkdir(exported);
    await writeFile(path.join(exported, "article.mdx"), "Exported content");

    expect(await createGitLastModifiedResolver(exported)("article.mdx")).toBeNull();
    expect(await createGitLastModifiedResolver(path.join(directory, "missing"))("article.mdx")).toBeNull();
  });

  it("treats special characters in content paths literally", async () => {
    await commit("content/[draft].mdx", "Literal path", "2026-01-05T10:00:00.000Z");
    await commit("content/d.mdx", "Similar path", "2026-01-06T10:00:00.000Z");

    expect((await createGitLastModifiedResolver(repository)("content/[draft].mdx"))?.toISOString()).toBe(
      "2026-01-05T10:00:00.000Z",
    );
  });
});
