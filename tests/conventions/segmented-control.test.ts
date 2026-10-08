import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

type Rule = "raw-tabs" | "editor-tabs" | "underline-bar";

const SCANNED_DIRECTORIES = ["app", "components", "features", "ee"];

const RULE_PATTERNS: Record<Rule, RegExp> = {
  "raw-tabs": /from "[^"]*\/ui\/tabs"/,
  "editor-tabs": /from "[^"]*\/editor-tabs\/editor-tabs"|\bexport const EditorTabs\b/,
  "underline-bar": /variant="line"/,
};

const NOT_YET_MIGRATED: Record<string, Rule[]> = {
  "app/[locale]/(protected)/company/components/company-invite/company-invite-modal.tsx": ["raw-tabs"],
  "app/[locale]/(protected)/profile/components/connected-account-modal.tsx": ["raw-tabs"],
  "app/[locale]/(protected)/onboarding/wizard/components/step-invite.tsx": ["raw-tabs", "underline-bar"],
  "components/data-view/header/display-options.tsx": ["raw-tabs"],
  "components/entity-detail/entity-detail-panels.tsx": ["raw-tabs", "underline-bar"],
  "components/editor-tabs/editor-tabs.tsx": ["editor-tabs"],
  "app/[locale]/(protected)/configure/components/configure-list-pane.tsx": ["editor-tabs"],
  "app/[locale]/(protected)/configure/components/relationship-modal.tsx": ["editor-tabs"],
  "app/[locale]/(protected)/company/components/role/role-modal.tsx": ["editor-tabs"],
  "app/[locale]/(protected)/records/[typeId]/components/record-editor-content.tsx": ["editor-tabs"],
};

function findings() {
  return SCANNED_DIRECTORIES.flatMap((directory) =>
    walkFiles(join(REPO_ROOT, directory), (path) => path.endsWith(".tsx") && !path.includes("__tests__")),
  ).flatMap((path) => {
    const file = relative(REPO_ROOT, path);
    if (file.startsWith("components/ui/")) return [];
    const source = readFileSync(path, "utf8");
    return (Object.keys(RULE_PATTERNS) as Rule[])
      .filter((rule) => RULE_PATTERNS[rule].test(source))
      .map((rule) => ({ file, rule }));
  });
}

describe("views switch with the shared SegmentedControl, forms use CollapsibleSection (design rule 57)", () => {
  const current = findings();

  it("builds no tab bar outside the shared SegmentedControl", () => {
    const violations = current
      .filter(({ file, rule }) => !NOT_YET_MIGRATED[file]?.includes(rule))
      .map(({ file, rule }) => `${rule}: ${file}`);
    expect(violations).toEqual([]);
  });

  it("keeps the not-yet-migrated allowlist shrinking", () => {
    const stale = Object.entries(NOT_YET_MIGRATED).flatMap(([file, rules]) =>
      rules
        .filter((rule) => !current.some((f) => f.file === file && f.rule === rule))
        .map((rule) => `${rule}: ${file}`),
    );
    expect(stale).toEqual([]);
  });

  it("keeps the shared SegmentedControl equal-width and container-sized", () => {
    const source = readFileSync(join(REPO_ROOT, "components/ui/segmented-control.tsx"), "utf8");
    expect(source).toContain("auto-cols-fr grid-flow-col");
    expect(source).toContain("w-full");
    expect(source).not.toMatch(/border-b\b/);
  });
});
