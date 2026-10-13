import { readFileSync } from "node:fs";
import { join, matchesGlob, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, REPO_SCAN_TIMEOUT_MS, walkFiles } from "./walk";

import { domTestFiles, nodeTestInclude } from "@/vitest.config";

const TEST_FILE = /\.test\.(?:[cm]?[jt]s|[jt]sx)$/;

// Vitest also resolves an include entry that is a literal path, even when it holds glob characters such as [locale].
const matchesPattern = (file: string, pattern: string) => file === pattern || matchesGlob(file, pattern);

function packageScripts(): string[] {
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  return Object.values(manifest.scripts);
}

function testFiles(): string[] {
  return walkFiles(REPO_ROOT, (path) => TEST_FILE.test(path)).map((path) =>
    relative(REPO_ROOT, path).split(sep).join("/"),
  );
}

describe("test runner coverage", () => {
  it(
    "collects every *.test file in a vitest project or a package script",
    () => {
      const scripts = packageScripts();
      const uncovered = testFiles().filter((file) => {
        const dom = domTestFiles.some((pattern) => matchesPattern(file, pattern));
        const node = nodeTestInclude.some((pattern) => matchesPattern(file, pattern));
        return !dom && !node && !scripts.some((script) => script.includes(file));
      });

      expect(uncovered).toEqual([]);
    },
    REPO_SCAN_TIMEOUT_MS,
  );

  it(
    "lists only existing files as dom tests",
    () => {
      const files = testFiles();
      const stale = domTestFiles.filter((pattern) => !files.some((file) => matchesPattern(file, pattern)));

      expect(stale).toEqual([]);
    },
    REPO_SCAN_TIMEOUT_MS,
  );
});
