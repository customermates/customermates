import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  FORM_SCOPES,
  NAV_KEYS,
  TOOLBAR_SCOPES_WITH_ADD,
  TOOLBAR_SCOPES_WITHOUT_ADD,
} from "@/ee/agent-chat/ui-anchors";
import { AGENT_UI_TARGETS } from "@/ee/agent-chat/ui-targets";

import { REPO_ROOT, walkFiles } from "./walk";

import { CONTENT_LOCALES } from "@/i18n/locale-registry";

const ENFORCED = true;

const DOCS_ID_PATTERN = /`#([a-z][a-z0-9]*(?:-[a-z0-9]+)+)`/g;
const LITERAL_ID_PATTERN = /\b(?:id|inputId)=["']([a-z][a-z0-9]*(?:-[a-z0-9]+)+)["']/g;
const ANCHOR_SCOPE_PATTERN = /anchorScope=["']([a-z0-9-]+)["']/g;
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
];

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
    for (const match of text.matchAll(LITERAL_ID_PATTERN)) ids.add(match[1]);
    for (const match of text.matchAll(ANCHOR_SCOPE_PATTERN)) {
      const scope = match[1];
      if (TOOLBAR_SCOPES_WITH_ADD.includes(scope) || TOOLBAR_SCOPES_WITHOUT_ADD.includes(scope)) {
        ids.add(`${scope}-search`);
        ids.add(`${scope}-filter`);
        ids.add(`${scope}-display-options`);
        if (TOOLBAR_SCOPES_WITH_ADD.includes(scope)) ids.add(`${scope}-add`);
      }
      if (FORM_SCOPES.includes(scope)) {
        ids.add(`${scope}-save`);
        ids.add(`${scope}-reset`);
      }
    }
  }
  for (const key of NAV_KEYS) ids.add(`nav-${key}`);
  return ids;
}

function expectedDocumentedIds(): Set<string> {
  const ids = new Set<string>();
  for (const scope of TOOLBAR_SCOPES_WITH_ADD)
    for (const suffix of ["-add", "-search", "-filter", "-display-options"]) ids.add(`${scope}${suffix}`);
  for (const scope of TOOLBAR_SCOPES_WITHOUT_ADD)
    for (const suffix of ["-search", "-filter", "-display-options"]) ids.add(`${scope}${suffix}`);
  for (const scope of FORM_SCOPES) for (const suffix of ["-save", "-reset"]) ids.add(`${scope}${suffix}`);
  for (const key of NAV_KEYS) ids.add(`nav-${key}`);
  for (const file of sourceFiles()) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(LITERAL_ID_PATTERN)) {
      if (RESERVED_LITERAL_PREFIXES.some((prefix) => match[1].startsWith(prefix))) ids.add(match[1]);
    }
  }
  return ids;
}

describe("app-guide anchor id fidelity", () => {
  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("has app-guide pages in every locale", () => {
    for (const locale of DOCS_LOCALES) expect(appGuideFiles(locale).length).toBeGreaterThan(0);
  });

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
  });
});
