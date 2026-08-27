import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SKIPPED_DIRECTORIES = new Set(["node_modules", ".next", "generated", ".git", "coverage"]);

const GENERATED_DIRECTORIES = [join("app", ".well-known", "workflow")];

export function walkFiles(root: string, matches: (path: string) => boolean): string[] {
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
      if (matches(path)) found.push(path);
    }
  };
  visit(root);
  return found;
}

export const REPO_ROOT = join(__dirname, "..", "..");
