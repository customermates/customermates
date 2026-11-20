import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

const read = (path: string) => readFileSync(join(REPO_ROOT, path), "utf8");

describe("long translated labels keep their meaning in narrow slots", () => {
  it("keeps the sidebar Ask Mate label on one line and lets its shortcut hint step aside instead", () => {
    const source = read("app/components/navigation/nav-header.tsx");
    const anchor = source.indexOf('id="nav-assistant"');
    const button = source.slice(anchor - 200, source.indexOf("</SidebarMenuButton>", anchor));
    expect(button).toContain("flex-wrap");
    expect(button).toMatch(/<span className="[^"]*whitespace-nowrap[^"]*">\{assistantLabel\}<\/span>/);
    expect(button).toMatch(/<ActiveShortcutKeys className="[^"]*ml-auto[^"]*h-8[^"]*" id="askMate" \/>/);
  });

  it("wraps the search footer hints as whole units and never inside a hint label", () => {
    const source = read("app/components/global-search-modal.tsx");
    expect(source).toMatch(/flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t/);
    expect(source).toMatch(/function Hint\([^)]*\) \{\s*return \(\s*<div className="[^"]*whitespace-nowrap[^"]*">/);
  });
});
