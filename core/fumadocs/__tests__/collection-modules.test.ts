import type { Core, ServerContext } from "fumadocs-mdx";

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { collectionModules, renderHeadModule } from "../collection-modules";

describe("renderHeadModule", () => {
  it("writes one frontmatter-only import and one entry per file", () => {
    const content = renderHeadModule("auth", [
      {
        fullPath: "content/auth/en/signin.mdx",
        importPath: "../../content/auth/en/signin.mdx",
        lastModified: new Date("2026-11-11T20:26:47.000Z"),
        path: "en/signin.mdx",
      },
      {
        fullPath: "content/auth/en/signup.mdx",
        importPath: "../../content/auth/en/signup.mdx",
        lastModified: null,
        path: "en/signup.mdx",
      },
    ]);

    expect(content).toBe(
      [
        "// @ts-nocheck",
        'import { frontmatter as head0 } from "../../content/auth/en/signin.mdx?collection=auth&only=frontmatter";',
        'import { frontmatter as head1 } from "../../content/auth/en/signup.mdx?collection=auth&only=frontmatter";',
        "",
        "export const auth = [",
        '  { path: "en/signin.mdx", fullPath: "content/auth/en/signin.mdx", frontmatter: head0, lastModified: "2026-11-11T20:26:47.000Z" },',
        '  { path: "en/signup.mdx", fullPath: "content/auth/en/signup.mdx", frontmatter: head1 },',
        "];",
        "",
      ].join("\n"),
    );
  });

  it("writes an empty list for a collection without files", () => {
    expect(renderHeadModule("auth", [])).toBe(["// @ts-nocheck", "", "export const auth = [", "];", ""].join("\n"));
  });
});

describe("collectionModules", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "collection-modules-"));
    mkdirSync(join(directory, "en"), { recursive: true });
    writeFileSync(join(directory, "en", "b.mdx"), "---\ntitle: B\n---\n");
    writeFileSync(join(directory, "en", "a.mdx"), "---\ntitle: A\n---\n");
    writeFileSync(join(directory, "en", "notes.txt"), "not content");
  });

  afterEach(() => rmSync(directory, { force: true, recursive: true }));

  function fakeCore() {
    const collection = {
      dir: directory,
      hasFile: (file: string) => file.endsWith(".mdx") && file.startsWith(directory),
      name: "notes",
      patterns: ["**/*.mdx"],
      type: "doc" as const,
    };
    const emit = vi.fn(() => Promise.resolve({ entries: [], workspaces: {} }));
    const core = {
      emit,
      getCollections: () => [collection],
      getOptions: () => ({ configPath: "core/fumadocs/source.config.ts", environment: "next", outDir: ".source" }),
      getPluginContext() {
        return { core: this };
      },
      getPlugins: () => [],
    };

    return { collection, core: core as unknown as Core, emit };
  }

  it("emits a head module with the files of the collection in path order and their dates", async () => {
    const { core } = fakeCore();
    const lastModified = vi.fn((path: string) => Promise.resolve(path.endsWith("a.mdx") ? new Date(0) : null));
    const plugin = collectionModules({ lastModified });
    const entries = await plugin.emit?.call({ core });
    const head = entries?.find((entry) => entry.path === "heads/notes.ts");

    expect(head?.content).toContain('path: "en/a.mdx"');
    expect(head?.content.indexOf("en/a.mdx")).toBeLessThan(head?.content.indexOf("en/b.mdx") ?? 0);
    expect(head?.content).toContain('lastModified: "1970-01-01T00:00:00.000Z"');
    expect(head?.content).not.toContain("notes.txt");
    expect(head?.content).toMatch(/\.\.\/\.\.\/.*en\/a\.mdx\?collection=notes&only=frontmatter/u);
  });

  it("keeps a failed date lookup from failing the emit", async () => {
    const { core } = fakeCore();
    const plugin = collectionModules({ lastModified: () => Promise.reject(new Error("no git")) });
    const entries = await plugin.emit?.call({ core });

    expect(entries?.find((entry) => entry.path === "heads/notes.ts")?.content).not.toContain("lastModified:");
  });

  it("regenerates only its own modules when a content file is added or removed", async () => {
    const { core, emit } = fakeCore();
    const handlers: Array<(event: string, file: string) => Promise<void>> = [];
    const server = { watcher: { on: (_name: string, handler: (typeof handlers)[number]) => handlers.push(handler) } };
    const plugin = collectionModules({ lastModified: () => Promise.resolve(null) });

    plugin.configureServer?.call({ core }, server as unknown as ServerContext);
    const [handler] = handlers;

    await handler("change", join(directory, "en", "a.mdx"));
    await handler("add", join(tmpdir(), "elsewhere", "a.mdx"));
    await handler("add", join(directory, "en", "notes.txt"));
    expect(emit).not.toHaveBeenCalled();

    await handler("add", join(directory, "en", "c.mdx"));
    await handler("unlink", join(directory, "en", "a.mdx"));
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[0]).toEqual([expect.objectContaining({ filterPlugin: expect.any(Function), write: true })]);
  });
});
