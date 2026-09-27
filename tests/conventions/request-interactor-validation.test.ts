import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const INTERACTOR_ROOTS = ["core", "features", "ee"];
const DI_GETTER = /export const (get\w+) = \(\) =>\s*new (\w+)\(/g;
const EXPORTED_CLASS = /export class (\w+)/g;
const GETTER_CALL = /\b(get\w+Interactor)\(/g;
const ROUTE_MODULE_PATTERN = /\/route\.ts$/;

function interactorClassFiles(): Map<string, string> {
  const classes = new Map<string, string>();
  for (const root of INTERACTOR_ROOTS) {
    for (const path of walkFiles(
      join(REPO_ROOT, root),
      (file) => file.endsWith(".interactor.ts") && !file.includes("/__tests__/"),
    )) {
      for (const [, className] of readFileSync(path, "utf8").matchAll(EXPORTED_CLASS)) classes.set(className, path);
    }
  }
  return classes;
}

function enforcingGetters(): Set<string> {
  const classes = interactorClassFiles();
  const getters = new Set<string>();
  for (const [, getter, className] of readFileSync(join(REPO_ROOT, "core", "di.ts"), "utf8").matchAll(DI_GETTER)) {
    const file = classes.get(className);
    if (file && readFileSync(file, "utf8").includes("@Enforce(")) getters.add(getter);
  }
  return getters;
}

function requestEntryPoints(): string[] {
  return [
    ...walkFiles(join(REPO_ROOT, "app", "api"), (path) => ROUTE_MODULE_PATTERN.test(path)),
    ...walkFiles(
      join(REPO_ROOT, "features", "mcp-tools"),
      (path) => path.endsWith(".mcp-tools.ts") && !path.includes("/__tests__/"),
    ),
  ];
}

describe("request interactor validation", () => {
  it("validates caller input with @Validate, so a malformed value is a failure result rather than a thrown ZodError", () => {
    const enforcing = enforcingGetters();
    const violations = requestEntryPoints().flatMap((path) =>
      [...new Set([...readFileSync(path, "utf8").matchAll(GETTER_CALL)].map(([, getter]) => getter))]
        .filter((getter) => enforcing.has(getter))
        .map((getter) => `${relative(REPO_ROOT, path)} calls ${getter}, whose interactor validates with @Enforce`),
    );

    expect(violations).toEqual([]);
  });

  it("resolves @Enforce interactors through the container so the check cannot pass vacuously", () => {
    expect(enforcingGetters().size).toBeGreaterThan(0);
    expect(requestEntryPoints().length).toBeGreaterThan(0);
  });
});
