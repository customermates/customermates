import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

describe("shared tabs", () => {
  it("retires the raw tabs primitive and its underline variant in favour of the shared segmented control", () => {
    expect(existsSync(join(REPO_ROOT, "components/ui/tabs.tsx"))).toBe(false);
  });

  it("keeps widget configuration in one form beside its live preview", () => {
    const widgetModal = read("app/[locale]/(protected)/dashboard/components/widget-modal.tsx");
    const editorLayout = read("app/[locale]/(protected)/dashboard/components/widget-editor-layout.tsx");

    expect(editorLayout).toContain('data-widget-editor="split"');
    expect(widgetModal).toContain('section="all"');
    expect(widgetModal).not.toContain("<Tabs");
  });
});
