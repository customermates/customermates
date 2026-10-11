import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, REPO_SCAN_TIMEOUT_MS, readSourceText, walkFiles } from "./walk";

const SHARED_COMPONENT = "components/ui/item-actions.tsx";

const ELLIPSIS_ICON_IMPORT =
  /import\s*\{[^}]*\b(?:Ellipsis|EllipsisVertical|MoreHorizontal|MoreVertical)\b[^}]*\}\s*from\s*"lucide-react"/;

const WIDTH_BASED_HIDING = /\b(?:sm|md|lg|xl|2xl):opacity-0\b/;

const POINTER_VISIBILITY = /\b(?:any-)?pointer-(?:fine|coarse):/;

const sources = ["app", "components"]
  .flatMap((folder) => walkFiles(join(REPO_ROOT, folder), (path) => path.endsWith(".tsx")))
  .map((path) => ({ file: relative(REPO_ROOT, path), text: readSourceText(path) }));

function offendingLines(pattern: RegExp, files: typeof sources) {
  return files.flatMap(({ file, text }) =>
    text.split("\n").flatMap((line, index) => (pattern.test(line) ? [`${file}:${index + 1}`] : [])),
  );
}

const itemMenuFiles = sources.filter(({ file, text }) => file !== SHARED_COMPONENT && ELLIPSIS_ICON_IMPORT.test(text));

describe("item action menus (H9: one pattern decided by input capability)", () => {
  it(
    "never hides a menu trigger by screen width",
    () => {
      expect(offendingLines(/\bmd:opacity-0\b/, sources)).toEqual([]);
      expect(offendingLines(/\bmd:pointer-fine:/, sources)).toEqual([]);
      expect(offendingLines(WIDTH_BASED_HIDING, itemMenuFiles)).toEqual([]);
    },
    REPO_SCAN_TIMEOUT_MS,
  );

  it("keeps per-surface pointer visibility rules out of files that draw an ellipsis", () => {
    expect(offendingLines(POINTER_VISIBILITY, itemMenuFiles)).toEqual([]);
  });

  it("opens every ellipsis item menu through the shared ItemActions component", () => {
    const offenders = itemMenuFiles.filter(({ text }) => /\bDropdownMenuTrigger\b/.test(text)).map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it("decides trigger visibility once, by hover, focus and pointer capability", () => {
    const shared = readSourceText(join(REPO_ROOT, SHARED_COMPONENT));

    expect(shared).toContain("pointer-fine:group-hover/item-actions:opacity-100");
    expect(shared).toContain("pointer-fine:group-focus-within/item-actions:opacity-100");
    expect(shared).toContain("focus-visible:opacity-100");
    expect(shared).toContain("pointer-coarse:not-focus-visible:not-data-[state=open]:sr-only");
    expect(shared).toContain("ContextMenuTrigger");
    expect(shared).toMatch(/event\.key === "ContextMenu"/);
    expect(shared).toMatch(/event\.shiftKey && event\.key === "F10"/);
  });

  it("leaves no hover-only switch on the sidebar primitives", () => {
    const sidebar = readSourceText(join(REPO_ROOT, "components/ui/sidebar.tsx"));

    expect(sidebar).not.toContain("showOnHover");
  });
});
