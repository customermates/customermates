import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import ts from "typescript";

const SKIPPED_DIRECTORIES = new Set(["node_modules", ".next", "generated", ".git", ".runs", "coverage"]);

const GENERATED_DIRECTORIES = [join("app", ".well-known", "workflow")];

export const REPO_SCAN_TIMEOUT_MS = 60_000;

const listedFiles = new Map<string, string[]>();
const fileTexts = new Map<string, string>();
const parsedSources = new Map<string, ts.SourceFile>();

function listFiles(root: string): string[] {
  const cached = listedFiles.get(root);
  if (cached) return cached;

  const found: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        const repoPath = relative(root, path);
        if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
        if (GENERATED_DIRECTORIES.some((generated) => repoPath === generated || repoPath.startsWith(generated + sep)))
          continue;
        visit(path);
        continue;
      }
      found.push(path);
    }
  };
  visit(root);
  listedFiles.set(root, found);
  return found;
}

export function walkFiles(root: string, matches: (path: string) => boolean): string[] {
  return listFiles(root).filter(matches);
}

export function readSourceText(path: string): string {
  const cached = fileTexts.get(path);
  if (cached !== undefined) return cached;

  const text = readFileSync(path, "utf8");
  fileTexts.set(path, text);
  return text;
}

export function parseSource(fileName: string, text: string, kind?: ts.ScriptKind): ts.SourceFile {
  const scriptKind = kind ?? (fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const key = `${scriptKind}:${fileName}`;
  const cached = parsedSources.get(key);
  if (cached?.text === text) return cached;

  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKind);
  parsedSources.set(key, source);
  return source;
}

export const REPO_ROOT = join(__dirname, "..", "..");
