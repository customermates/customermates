import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  FORM_PAGES,
  FORM_SCOPES,
  formDiscardSuffix,
  NAV_KEYS,
  SCOPES_WITHOUT_FILTER,
  SCOPES_WITHOUT_SEARCH,
  TOOLBAR_SCOPES_WITH_ADD,
  TOOLBAR_SCOPES_WITHOUT_ADD,
} from "@/ee/agent-chat/ui-anchors";
import { AGENT_UI_TARGETS } from "@/ee/agent-chat/ui-targets";
import { recordUiTargets } from "@/ee/agent-chat/record-ui-targets";

import { REPO_ROOT, walkFiles } from "./walk";

const ENFORCED = true;

const LITERAL_ID_PATTERN =
  /\b(?:id|inputId)=["']([a-z][a-z0-9]*(?:-[a-z0-9]+)+)["']|\b(?:composerId|fallbackFocusId|usageId|anchorId):\s*["']([a-z][a-z0-9]*(?:-[a-z0-9]+)+)["']/g;
const TOP_BAR_ANCHOR_PATTERN = /<TopBar(?:Primary|Menu)Button\b(?:=>|[^>])*?\sanchorId=["']([a-z0-9-]+)["']/g;
const ANCHOR_SCOPE_PATTERN = /anchorScope=["']([a-z0-9-]+)["']/g;
const SEGMENT_ID_PREFIX_PATTERN = /<SegmentedControl\b(?:=>|[^>])*?\sidPrefix=["']([a-z0-9-]+)["']/g;
const SEGMENT_VALUE_PATTERN = /\{ value: "([a-z0-9-]+)", label:/g;
const FOOTER_ANCHOR_SCOPE_PATTERN = /<FormFooterActions\b(?:=>|[^>])*?\sanchorScope=["']([a-z0-9-]+)["']/g;

function sourceFiles(): string[] {
  return [
    ...walkFiles(join(REPO_ROOT, "app"), (path) => path.endsWith(".tsx")),
    ...walkFiles(join(REPO_ROOT, "components"), (path) => path.endsWith(".tsx")),
  ];
}

function codeIds(): Set<string> {
  const ids = new Set<string>();
  for (const file of sourceFiles()) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(LITERAL_ID_PATTERN)) ids.add(match[1] ?? match[2]);
    for (const match of text.matchAll(TOP_BAR_ANCHOR_PATTERN)) ids.add(match[1]);
    for (const prefix of text.matchAll(SEGMENT_ID_PREFIX_PATTERN))
      for (const segment of text.matchAll(SEGMENT_VALUE_PATTERN)) ids.add(`${prefix[1]}-tab-${segment[1]}`);
    for (const match of text.matchAll(FOOTER_ANCHOR_SCOPE_PATTERN))
      if (!FORM_SCOPES.includes(match[1]))
        for (const suffix of ["-save", "-cancel", "-reset"]) ids.add(`${match[1]}${suffix}`);
    for (const match of text.matchAll(ANCHOR_SCOPE_PATTERN)) {
      const scope = match[1];
      if (TOOLBAR_SCOPES_WITH_ADD.includes(scope) || TOOLBAR_SCOPES_WITHOUT_ADD.includes(scope)) {
        if (!SCOPES_WITHOUT_SEARCH.has(scope)) ids.add(`${scope}-search`);
        if (!SCOPES_WITHOUT_FILTER.has(scope)) ids.add(`${scope}-filter`);
        ids.add(`${scope}-display-options`);
        ids.add(`${scope}-layout-table`);
        ids.add(`${scope}-layout-board`);
        if (TOOLBAR_SCOPES_WITH_ADD.includes(scope)) ids.add(`${scope}-add`);
      }
      const formPage = FORM_PAGES.find((page) => page.scope === scope);
      if (formPage) {
        ids.add(`${scope}-save`);
        ids.add(`${scope}${formDiscardSuffix(formPage)}`);
      }
    }
  }
  for (const suffix of toolbarSuffixes("records", true)) ids.add(`records${suffix}`);
  ids.add("records-transfer");
  for (const key of NAV_KEYS) ids.add(`nav-${key}`);
  return ids;
}

function toolbarSuffixes(scope: string, hasAdd: boolean): string[] {
  return [
    ...(hasAdd ? ["-add"] : []),
    ...(SCOPES_WITHOUT_SEARCH.has(scope) ? [] : ["-search"]),
    ...(SCOPES_WITHOUT_FILTER.has(scope) ? [] : ["-filter"]),
    "-display-options",
    "-layout-table",
    "-layout-board",
  ];
}

describe("interface anchor id fidelity", () => {
  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("declares every nav key and scope it expands", () => {
    const sidebar = readFileSync(join(REPO_ROOT, "app", "components", "app-sidebar.tsx"), "utf8");
    const workspaceSections = readFileSync(
      join(REPO_ROOT, "app", "components", "navigation", "workspace-sections.ts"),
      "utf8",
    );
    for (const key of NAV_KEYS) {
      const sectionMatch = /^(profile|company)-(.+)$/.exec(key);
      const declared = sectionMatch
        ? workspaceSections.includes(`slug: "${sectionMatch[2]}"`)
        : sidebar.includes(`"${key}"`);
      expect(declared, `nav key ${key} missing from app-sidebar.tsx / workspace-sections.ts`).toBe(true);
    }

    const allSource = sourceFiles()
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    for (const scope of [...TOOLBAR_SCOPES_WITH_ADD, ...TOOLBAR_SCOPES_WITHOUT_ADD, ...FORM_SCOPES])
      expect(allSource, `anchorScope "${scope}" not found in source`).toContain(`anchorScope="${scope}"`);

    for (const control of ["add", "search", "filter", "display-options", "transfer"])
      expect(allSource, `no component renders a "${control}" anchor id`).toContain(`-${control}\``);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("offers the agent only targets that exist in code", () => {
    const topBar = readFileSync(join(REPO_ROOT, "components/shared/top-bar-action-buttons.tsx"), "utf8");
    for (const name of ["TopBarPrimaryButton", "TopBarMenuButton"]) {
      const implementation = topBar.slice(topBar.indexOf(`export function ${name}`));
      expect(implementation).toContain("id={anchorId}");
    }
    const inCode = codeIds();
    const unknown = AGENT_UI_TARGETS.map((target) => target.id)
      .filter((id) => !inCode.has(id))
      .sort();
    expect(unknown, "AGENT_UI_TARGETS references ids that no component renders").toEqual([]);
    const typeId = "00000000-0000-4000-8000-000000000001";
    const dynamicTargets = recordUiTargets({
      companyId: "00000000-0000-4000-8000-000000000002",
      schemaRevision: 1,
      canManageSchema: true,
      types: [
        {
          id: typeId,
          label: "Project",
          pluralLabel: "Projects",
          icon: "Folder",
          canCreate: true,
          hasAuthorizationTasks: false,
        },
      ],
    });
    expect(dynamicTargets.map((target) => target.id)).toContain(`nav-records:${typeId}`);
    expect(dynamicTargets.map((target) => target.id)).toContain(`records:${typeId}:add`);
    expect(dynamicTargets.every((target) => target.route === `/records/${typeId}`)).toBe(true);
  });
});
