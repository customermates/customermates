import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { isPathInside } from "../path-boundary";

describe("review output path boundary", () => {
  const repository = resolve("/tmp/customermates-review-boundary");

  it.each([
    ["root", "public"],
    ["direct child", join("public", "review.html")],
    ["dot-prefixed child", join("public", "..review", "sheet.html")],
    ["app direct child", join("app", "review.html")],
    ["app dot-prefixed child", join("app", "..review", "sheet.html")],
  ])("detects %s as inside a forbidden root", (_name, target) => {
    const forbiddenRoot = target.startsWith("app") ? join(repository, "app") : join(repository, "public");
    expect(isPathInside(forbiddenRoot, join(repository, target))).toBe(true);
  });

  it.each([
    ["true sibling", join(repository, "review", "sheet.html")],
    ["root parent", repository],
    ["temporary directory", join("/tmp", "customermates-visual-review", "sheet.html")],
  ])("allows %s outside public", (_name, target) => {
    expect(isPathInside(join(repository, "public"), target)).toBe(false);
  });
});
