import { readFileSync } from "fs";
import path from "path";

import { describe, it, expect } from "vitest";

import { REPO_ROOT } from "./walk";

/**
 * CUS-61 moved the sidebar Add picker and the shared entity drawer to the left edge.
 * These are source-level tripwires: the repo has no DOM test environment, so rendered
 * placement is covered by the browser acceptance pass instead. What this guards is that
 * nobody silently flips the two moved surfaces back, and that unrelated sheets keep
 * their intentional side.
 */
const ENFORCED = true;

function read(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

describe("drawer side placement", () => {
  it("opens the sidebar Add picker from the left", () => {
    if (!ENFORCED) return;
    const source = read("app/components/app-sidebar.tsx");

    expect(source).toContain('side="left"');
    expect(source).not.toContain('side="right"');
  });

  it("opens the shared entity drawer from the left", () => {
    if (!ENFORCED) return;
    const source = read("components/entity-detail/entity-drawer.tsx");

    expect(source).toContain('side="left"');
    expect(source).not.toContain('side="right"');
  });

  it("keeps the public marketing navbar menu on the right", () => {
    if (!ENFORCED) return;
    const source = read("app/components/public-navbar.tsx");

    expect(source).toContain('side="right"');
  });

  it("keeps both sides available on the shared Sheet primitive", () => {
    if (!ENFORCED) return;
    const source = read("components/ui/sheet.tsx");

    expect(source).toContain('side === "left"');
    expect(source).toContain('side === "right"');
    expect(source).toContain('side = "right"');
  });
});
