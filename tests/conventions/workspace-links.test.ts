import { relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, REPO_SCAN_TIMEOUT_MS, readSourceText, walkFiles } from "./walk";

import { WORKSPACE_APP_ROOTS, WORKSPACE_LANDING_PATH } from "@/core/navigation/workspace-paths";

const SCANNED_ROOTS = ["app", "components", "features", "ee", "core", "workflows"];

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const DEEP_ROOT_SOURCE = WORKSPACE_APP_ROOTS.map((root) =>
  root === WORKSPACE_LANDING_PATH ? `${escape(root.slice(1))}/` : `${escape(root.slice(1))}(?=[/?#"'\`]|$)`,
).join("|");

const BASE_EXPRESSION = String.raw`\$\{[^}\n]*(?:BASE_URL|baseUrl|BaseUrl|origin|Origin)[^}\n]*\}`;

const UNSLUGGED_LINK_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  {
    name: "base URL joined to an app path",
    pattern: new RegExp(`${BASE_EXPRESSION}/(?:\\$\\{[^}\\n]*\\}/)?(?:${DEEP_ROOT_SOURCE})`),
  },
  {
    name: "base URL joined to an app href helper",
    pattern: new RegExp(
      `${BASE_EXPRESSION}\\$\\{\\s*(?:buildLocalePath\\([^,\\n]+,\\s*)?(?:settingsHref|wikiPagePath|focusHref|SETTINGS_ENTRY_HREF|WEBHOOK_DELIVERIES_HREF|["'\`]/(?:${DEEP_ROOT_SOURCE}))`,
    ),
  },
  {
    name: "locale joined to an app path",
    pattern: new RegExp(`\`/\\$\\{[^}\\n]*[lL]ocale[^}\\n]*\\}/(?:${DEEP_ROOT_SOURCE})`),
  },
  {
    name: "absolute URL built from an app path",
    pattern: new RegExp(`new URL\\(\\s*["'\`]/(?:\\$\\{[^}\\n]*\\}/)?(?:${DEEP_ROOT_SOURCE})`),
  },
  {
    name: "browser location set to an app path",
    pattern: new RegExp(
      `location(?:\\.href\\s*=|\\.assign\\(|\\.replace\\()\\s*["'\`]/(?:\\$\\{[^}\\n]*\\}/)?(?:${DEEP_ROOT_SOURCE})`,
    ),
  },
];

const WORKSPACE_HELPER_CALL =
  /(?:withWorkspaceHref|workspacePath|workspaceLocalePath|absoluteWorkspaceUrl|workspaceReturnUrl)\([^;]*$/u;

function wrappedByWorkspaceHelper(text: string, index: number): boolean {
  return WORKSPACE_HELPER_CALL.test(text.slice(Math.max(0, index - 200), index));
}

function isScannedSource(path: string): boolean {
  const repoPath = relative(REPO_ROOT, path);
  if (!/\.(?:ts|tsx)$/u.test(repoPath) || repoPath.endsWith(".d.ts")) return false;
  if (repoPath.split(sep).includes("__tests__") || /\.test\.tsx?$/u.test(repoPath)) return false;
  return SCANNED_ROOTS.some((root) => repoPath === root || repoPath.startsWith(`${root}${sep}`));
}

function unsluggedLinksIn(text: string): Array<{ index: number; name: string; text: string }> {
  const found: Array<{ index: number; name: string; text: string }> = [];
  for (const { name, pattern } of UNSLUGGED_LINK_PATTERNS) {
    for (const match of text.matchAll(new RegExp(pattern.source, "g"))) {
      if (wrappedByWorkspaceHelper(text, match.index)) continue;
      found.push({ index: match.index, name, text: match[0] });
    }
  }
  return found;
}

function unsluggedLinks(): string[] {
  return walkFiles(REPO_ROOT, isScannedSource).flatMap((path) => {
    const file = relative(REPO_ROOT, path).split(sep).join("/");
    const text = readSourceText(path);
    return unsluggedLinksIn(text).map(
      (link) => `${file}:${text.slice(0, link.index).split("\n").length} ${link.name}: ${link.text}`,
    );
  });
}

describe("workspace-qualified app links", () => {
  it(
    "builds absolute and server-side app links through the workspace path helpers",
    () => {
      expect(unsluggedLinks()).toEqual([]);
    },
    REPO_SCAN_TIMEOUT_MS,
  );

  it("detects each unslugged link shape it guards against", () => {
    const samples = [
      "const url = `${env.BASE_URL}/records/${typeId}/${recordId}`;",
      'const href = `${baseUrl}${settingsHref("channels")}`;',
      "const path = `/${locale}/records/${typeId}`;",
      'const link = new URL("/wiki?page=1", origin);',
      'window.location.href = "/settings/billing";',
      'const back = `${baseUrl}${buildLocalePath(locale, settingsHref("billing"))}`;',
      "const entry = `${env.BASE_URL}/dashboard/widgets`;",
    ];
    for (const sample of samples) expect(unsluggedLinksIn(sample), sample).not.toEqual([]);
    for (const sample of [
      "const entry = `${env.BASE_URL}/dashboard`;",
      "const contact = `${env.BASE_URL}/contact`;",
      "const docs = `${baseUrl}/docs/records`;",
      'const canonical = `${env.BASE_URL}${buildLocalePath(locale, "/pricing")}`;',
      "const path = withWorkspaceHref(`/${locale}/records/${id}`, slug);",
      'const url = absoluteWorkspaceUrl(env.BASE_URL, null, slug, "/records");',
    ])
      expect(unsluggedLinksIn(sample), sample).toEqual([]);
  });
});
