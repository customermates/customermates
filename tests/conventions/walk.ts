import { readdirSync } from "node:fs";
import { join } from "node:path";

const SKIPPED_DIRECTORIES = new Set(["node_modules", ".next", "generated", ".git", "coverage"]);

export function walkFiles(root: string, matches: (path: string) => boolean): string[] {
  const found: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) visit(join(dir, entry.name));
        continue;
      }
      const path = join(dir, entry.name);
      if (matches(path)) found.push(path);
    }
  };
  visit(root);
  return found;
}

export const REPO_ROOT = join(__dirname, "..", "..");
