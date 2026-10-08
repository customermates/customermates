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

import { CONTENT_LOCALES } from "@/i18n/locale-registry";

const ENFORCED = true;

const DOCS_ID_PATTERN = /`#([a-z][a-z0-9]*(?:-[a-z0-9]+)+)`/g;
const LITERAL_ID_PATTERN =
  /\b(?:id|inputId)=["']([a-z][a-z0-9]*(?:-[a-z0-9]+)+)["']|\b(?:composerId|fallbackFocusId|usageId|anchorId):\s*["']([a-z][a-z0-9]*(?:-[a-z0-9]+)+)["']/g;
const ANCHOR_SCOPE_PATTERN = /anchorScope=["']([a-z0-9-]+)["']/g;
const SEGMENT_ID_PREFIX_PATTERN = /<SegmentedControl\b(?:=>|[^>])*?\sidPrefix=["']([a-z0-9-]+)["']/g;
const SEGMENT_VALUE_PATTERN = /\{ value: "([a-z0-9-]+)", label:/g;
const FOOTER_ANCHOR_SCOPE_PATTERN = /<FormFooterActions\b(?:=>|[^>])*?\sanchorScope=["']([a-z0-9-]+)["']/g;
const DOCS_LOCALES = CONTENT_LOCALES;

const RESERVED_LITERAL_PREFIXES = [
  "nav-",
  "entity-",
  "drawer-",
  "confirm-",
  "dashboard-",
  "profile-",
  "api-key-",
  "onboarding-",
  "global-",
  "mass-",
  "inbox-",
  "records-",
];
const UNDOCUMENTED_DIALOG_IDS = /^(?:mass-|confirm-)/;

function appGuideFiles(locale: string): string[] {
  return walkFiles(join(REPO_ROOT, "content", "docs", locale), (path) => /app-[a-z-]+\.mdx$/.test(path));
}

function documentedIds(locale: string): Set<string> {
  const ids = new Set<string>();
  for (const file of appGuideFiles(locale)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(DOCS_ID_PATTERN)) ids.add(match[1]);
  }
  return ids;
}

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

function expectedDocumentedIds(): Set<string> {
  const ids = new Set<string>();
  for (const scope of TOOLBAR_SCOPES_WITH_ADD)
    for (const suffix of toolbarSuffixes(scope, true)) ids.add(`${scope}${suffix}`);
  for (const suffix of toolbarSuffixes("records", true)) ids.add(`records${suffix}`);
  ids.add("records-transfer");
  for (const scope of TOOLBAR_SCOPES_WITHOUT_ADD)
    for (const suffix of toolbarSuffixes(scope, false)) ids.add(`${scope}${suffix}`);
  for (const page of FORM_PAGES)
    for (const suffix of ["-save", formDiscardSuffix(page)]) ids.add(`${page.scope}${suffix}`);
  for (const key of NAV_KEYS) ids.add(`nav-${key}`);
  for (const file of sourceFiles()) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(LITERAL_ID_PATTERN)) {
      const id = match[1] ?? match[2];
      if (RESERVED_LITERAL_PREFIXES.some((prefix) => id.startsWith(prefix)) && !UNDOCUMENTED_DIALOG_IDS.test(id))
        ids.add(id);
    }
  }
  return ids;
}

describe("app-guide anchor id fidelity", () => {
  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("has app-guide pages in every locale", () => {
    for (const locale of DOCS_LOCALES) expect(appGuideFiles(locale).length).toBeGreaterThan(0);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("declares every nav key and scope it expands", () => {
    const sidebar = ["app-sidebar.tsx", "navigation/nav-header.tsx", "navigation/nav-user.tsx"]
      .map((file) => readFileSync(join(REPO_ROOT, "app", "components", file), "utf8"))
      .join("\n");
    const settingsSections = readFileSync(
      join(REPO_ROOT, "app", "components", "navigation", "settings-sections.ts"),
      "utf8",
    );
    for (const key of NAV_KEYS) {
      const sectionMatch = /^settings-(.+)$/.exec(key);
      const declared = sectionMatch
        ? settingsSections.includes(`slug: "${sectionMatch[1]}"`)
        : sidebar.includes(`"${key}"`) || sidebar.includes(`"nav-${key}"`);
      expect(declared, `nav key ${key} missing from the sidebar sources / settings-sections.ts`).toBe(true);
    }

    const allSource = sourceFiles()
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    for (const scope of [
      ...TOOLBAR_SCOPES_WITH_ADD,
      ...TOOLBAR_SCOPES_WITHOUT_ADD,
      ...FORM_SCOPES,
    ])
      expect(allSource, `anchorScope "${scope}" not found in source`).toContain(`anchorScope="${scope}"`);

    for (const control of ["add", "search", "filter", "display-options", "transfer"])
      expect(allSource, `no component renders a "${control}" anchor id`).toContain(`-${control}\``);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("documents only ids that exist in code", () => {
    const inCode = codeIds();
    for (const locale of DOCS_LOCALES) {
      const missing = [...documentedIds(locale)].filter((id) => !inCode.has(id));
      expect(missing, `${locale} docs reference unknown ids`).toEqual([]);
    }
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("documents identical id sets in both locales", () => {
    const [en, de] = DOCS_LOCALES.map((locale) => documentedIds(locale));
    expect([...en].sort()).toEqual([...de].sort());
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("documents every reserved code id in both locales", () => {
    const expected = expectedDocumentedIds();
    for (const locale of DOCS_LOCALES) {
      const documented = documentedIds(locale);
      const undocumented = [...expected].filter((id) => !documented.has(id)).sort();
      expect(undocumented, `${locale} app-guide pages missing ids`).toEqual([]);
    }
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("offers the agent only targets that exist in code", () => {
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
