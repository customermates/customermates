import { existsSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  PRODUCT_SOURCES,
  type Finding,
  type SourceFile,
  finding,
  outsideAllowlist,
  staleAllowlistEntries,
  visit,
} from "./design-system-scan";
import { REPO_ROOT, walkFiles } from "./walk";

type Allowlist = Readonly<Record<string, string>>;

function enforce(findings: Finding[], allowlist: Allowlist) {
  expect(outsideAllowlist(findings, allowlist)).toEqual([]);
  expect(staleAllowlistEntries(findings, allowlist)).toEqual([]);
}

function sourceFromText(file: string, text: string): SourceFile {
  return { file, text, ast: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX) };
}

function literalFindings(sources: SourceFile[], pattern: RegExp) {
  const findings: Finding[] = [];

  for (const source of sources)
    visit(source.ast, (node) => {
      if (!ts.isStringLiteralLike(node) && !ts.isTemplateHead(node)) return;
      if (pattern.test(node.text)) findings.push(finding(source, node.getStart(source.ast), node.getText(source.ast)));
    });

  return findings;
}

function englishMessages(): Record<string, Record<string, unknown>> {
  return JSON.parse(readFileSync(join(REPO_ROOT, "i18n", "locales", "en.json"), "utf8")) as Record<
    string,
    Record<string, unknown>
  >;
}

const PROTECTED_ROUTES = join("app", "[locale]", "(protected)");
const RETIRED_ROUTE_DIRECTORIES = ["company", "profile"];
const RETIRED_ROUTE = /^\/(?:company|profile)(?:[/?#]|$)/;
const RETIRED_DOCS_LINK = /\]\(\/(?:company|profile)(?:[/?#)])/;

const RETIRED_ROUTE_ALLOWLIST: Allowlist = {};

describe("rule 43: Settings is one area, the old company and profile routes are gone", () => {
  it("has no company or profile route directories", () => {
    const present = RETIRED_ROUTE_DIRECTORIES.filter((directory) =>
      existsSync(join(REPO_ROOT, PROTECTED_ROUTES, directory)),
    );
    expect(present).toEqual([]);
  });

  it("links no product surface to a /company or /profile route", () => {
    enforce(literalFindings(PRODUCT_SOURCES, RETIRED_ROUTE), RETIRED_ROUTE_ALLOWLIST);
  });

  it("links no docs page to a /company or /profile route", () => {
    const pages = walkFiles(join(REPO_ROOT, "content", "docs"), (path) => path.endsWith(".mdx"))
      .filter((path) => RETIRED_DOCS_LINK.test(readFileSync(path, "utf8")))
      .map((path) => relative(REPO_ROOT, path));
    expect(pages).toEqual([]);
  });

  it("recognizes a route literal and leaves module paths alone", () => {
    const source = sourceFromText(
      "links.tsx",
      'const a = "/company/members";\nconst b = `/profile?tab=${tab}`;\nimport c from "@/features/company/x";',
    );
    expect(literalFindings([source], RETIRED_ROUTE).map(({ line }) => line)).toEqual([1, 2]);
  });
});

const SETTINGS_NAVIGATION = {
  account: "Account",
  activity: "Activity",
  apiKeys: "API keys",
  billing: "Billing",
  channels: "Channels",
  deliveries: "Deliveries",
  members: "Members",
  profile: "Profile & preferences",
  roles: "Roles",
  webhooks: "Webhooks",
  workspace: "Workspace",
};

const NAVIGATION_NAMESPACES = ["NavigationBar", "SettingsNav", "WorkspaceMenu"];
const RETIRED_BILLING_SEGMENTS = new Set(["plan", "plans", "subscription"]);

function protectedPageSegments() {
  return walkFiles(join(REPO_ROOT, PROTECTED_ROUTES), (path) => path.endsWith(`${sep}page.tsx`)).flatMap((path) =>
    relative(join(REPO_ROOT, PROTECTED_ROUTES), path)
      .split(sep)
      .slice(0, -1)
      .map((segment) => ({ segment, page: relative(REPO_ROOT, path) })),
  );
}

describe("rules 43 and 51: the Settings area names and Billing", () => {
  it("names the Settings area entries exactly as decided", () => {
    expect(englishMessages().SettingsNav).toEqual(SETTINGS_NAVIGATION);
  });

  it("calls the plan area Billing in every navigation label", () => {
    const messages = englishMessages();
    const planLabels = NAVIGATION_NAMESPACES.flatMap((namespace) =>
      Object.entries(messages[namespace] ?? {})
        .filter(([, value]) => typeof value === "string" && /\bPlan\b/.test(value))
        .map(([key]) => `${namespace}.${key}`),
    );
    expect(planLabels).toEqual([]);
  });

  it("serves the billing page under billing, never under a plan or subscription route", () => {
    const retired = protectedPageSegments()
      .filter(({ segment }) => RETIRED_BILLING_SEGMENTS.has(segment))
      .map(({ page }) => page);
    expect(retired).toEqual([]);
  });
});

const CONTACT_HREF_OWNER = "core/utils/contact-href.ts";
const CONTACT_SCHEME = /^(?:mailto|tel):/i;

function handBuiltContactLinkFindings(sources: SourceFile[]) {
  const findings: Finding[] = [];

  for (const source of sources)
    visit(source.ast, (node) => {
      if (!ts.isStringLiteralLike(node) && !ts.isTemplateHead(node)) return;
      if (!CONTACT_SCHEME.test(node.text)) return;
      const bareScheme = ts.isStringLiteralLike(node) && node.text.replace(CONTACT_SCHEME, "") === "";
      if (!bareScheme) findings.push(finding(source, node.getStart(source.ast), node.getText(source.ast)));
    });

  return findings;
}
const CONTACT_VALUE_SURFACES = [
  "app/[locale]/(protected)/records/[typeId]/components/record-value.tsx",
  "app/[locale]/(protected)/records/[typeId]/components/record-channels.tsx",
];

const CONTACT_LINK_EXEMPTIONS: Allowlist = {
  "app/components/agent-chat/credit-blocked-notice.tsx": "fixed support address, not a contact value",
  "app/[locale]/(protected)/subscription-expired/components/subscription-expired-view.tsx":
    "fixed support address, not a contact value",
};

const CONTACT_LINK_ALLOWLIST: Allowlist = {};

describe("rule 53: email, phone and web address values open or copy through one renderer", () => {
  it("builds mailto and tel links for contact values only through contactHref", () => {
    const findings = handBuiltContactLinkFindings(PRODUCT_SOURCES.filter(({ file }) => file !== CONTACT_HREF_OWNER));
    expect(staleAllowlistEntries(findings, CONTACT_LINK_EXEMPTIONS)).toEqual([]);
    enforce(
      findings.filter(({ file }) => !(file in CONTACT_LINK_EXEMPTIONS)),
      CONTACT_LINK_ALLOWLIST,
    );
  });

  it("renders record fields and Channels identifiers with the shared ContactValue", () => {
    const missing = CONTACT_VALUE_SURFACES.filter(
      (file) => !readFileSync(join(REPO_ROOT, file), "utf8").includes("<ContactValue"),
    );
    expect(missing).toEqual([]);
  });

  it("recognizes a hand-built contact link and ignores a bare scheme", () => {
    const source = sourceFromText(
      "contact.tsx",
      'const a = `mailto:${email}`;\nconst b = "tel:+4930123";\nconst c = ["mailto:", "tel:"];',
    );
    expect(handBuiltContactLinkFindings([source]).map(({ line }) => line)).toEqual([1, 2]);
  });
});
