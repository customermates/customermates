import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
}

describe("shared tabs", () => {
  it("keeps the compatibility default and exposes the input-style segmented variant", () => {
    const source = read("components/ui/tabs.tsx");
    const list = between(source, "const tabsListVariants", "function TabsList");
    const trigger = between(source, "function TabsTrigger", "function TabsContent");

    const variantBlock = between(list, "variant: {", "\n      },");
    const declaredVariants = [...variantBlock.matchAll(/^\s*(\w+):\s*"/gm)].map(([, name]) => name);
    expect([...declaredVariants].sort()).toEqual(["default", "line", "segmented"]);

    expect(trigger).toContain("data-[state=active]:text-primary");
    expect(trigger).toContain("group-data-[variant=segmented]/tabs-list:data-[state=active]:bg-primary/5");
    expect(trigger).toContain("dark:group-data-[variant=segmented]/tabs-list:data-[state=active]:bg-primary/5");
  });

  it("gives the widget editor the segmented variant", () => {
    const widgetModal = read("app/[locale]/(protected)/dashboard/components/widget-modal.tsx");

    expect(widgetModal).toContain('variant="segmented"');
  });
});
