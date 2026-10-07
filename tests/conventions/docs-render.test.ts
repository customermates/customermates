import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { evaluate } from "@mdx-js/mdx";
import { createElement, Fragment, type ReactNode } from "react";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";

import { resolveCommercialTokens } from "@/core/commercial/commercial-tokens";
import { resolveDerivedTokens } from "@/core/content/derived-tokens";

import { REPO_ROOT, walkFiles } from "./walk";

/**
 * Renders every product docs page the way the docs site does, minus styling: tokens resolved,
 * MDX evaluated and rendered to markup on the server. Plain prose such as `layout {x, y, w, h}`
 * is an MDX expression, so it only fails when the page renders; this catches it locally instead
 * of in CI's rendered-hubs check. Custom components render their children only.
 */
function Passthrough({ children }: { children?: ReactNode }) {
  return createElement(Fragment, null, children);
}

function componentsFor(source: string) {
  const names = new Set([...source.matchAll(/<([A-Z][A-Za-z0-9]*)/g)].map((match) => match[1]));
  return Object.fromEntries([...names].map((name) => [name, Passthrough]));
}

function pageSource(file: string) {
  const locale = basename(dirname(file));
  return resolveDerivedTokens(resolveCommercialTokens(readFileSync(file, "utf8"), locale)).replace(
    /^---\n[\s\S]*?\n---\n?/,
    "",
  );
}

const pages = walkFiles(join(REPO_ROOT, "content", "docs"), (path) => path.endsWith(".mdx")).map((file) => ({
  key: `${basename(dirname(file))}/${basename(file, ".mdx")}`,
  file,
}));

describe("docs pages render", () => {
  it("reads the docs corpus", () => {
    expect(pages.length).toBeGreaterThan(40);
  });

  it.each(pages.map((page) => [page.key, page.file]))("renders %s without a runtime error", async (_key, file) => {
    const source = pageSource(file);
    const { default: Content } = await evaluate(source, { ...runtime, remarkPlugins: [remarkGfm] });

    expect(renderToStaticMarkup(createElement(Content, { components: componentsFor(source) })).length).toBeGreaterThan(
      0,
    );
  });

  it("fails on plain braces that MDX evaluates as an expression", async () => {
    const { default: Content } = await evaluate("Writes accept a layout {x, y, w, h}.", runtime);

    expect(() => renderToStaticMarkup(createElement(Content))).toThrow(ReferenceError);
  });
});
