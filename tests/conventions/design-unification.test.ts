import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  PRODUCT_SOURCES,
  type Finding,
  type SourceFile,
  attributesOf,
  finding,
  outsideAllowlist,
  patternFindings,
  staleAllowlistEntries,
  tagNameOf,
  visit,
} from "./design-system-scan";

type Allowlist = Readonly<Record<string, string>>;

function enforce(findings: Finding[], allowlist: Allowlist) {
  expect(outsideAllowlist(findings, allowlist)).toEqual([]);
  expect(staleAllowlistEntries(findings, allowlist)).toEqual([]);
}

function sourceFromText(file: string, text: string): SourceFile {
  return {
    file,
    text,
    ast: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
  };
}

const LIST_ICON_FACTORY = "recordTypeIcon";
const LIST_ICON_COMPONENTS = new Set(["RecordTypeGlyph", "RecordChipIcon"]);
const ACCENT_TILE = /\b(?:bg|text|ring|border)-primary\b/;

function listIconVariables(source: SourceFile) {
  const names = new Set<string>();
  visit(source.ast, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText(source.ast) === LIST_ICON_FACTORY
    )
      names.add(node.name.text);
  });
  return names;
}

function classNameOf(node: ts.Node, source: SourceFile) {
  if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) return "";
  const attribute = attributesOf(node).properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.getText(source.ast) === "className",
  );
  return attribute?.getText(source.ast) ?? "";
}

function enclosingElement(node: ts.Node) {
  for (let parent = node.parent; parent; parent = parent.parent)
    if (ts.isJsxElement(parent) && parent.openingElement !== node) return parent;
  return undefined;
}

function accentedListIconFindings(sources: SourceFile[]) {
  const findings: Finding[] = [];

  for (const source of sources) {
    const iconNames = new Set([...listIconVariables(source), ...LIST_ICON_COMPONENTS]);
    visit(source.ast, (node) => {
      const tag = tagNameOf(node);
      if (!tag || !iconNames.has(tag)) return;
      const element = ts.isJsxElement(node) ? node.openingElement : node;
      const parent = enclosingElement(element);
      const classes = `${classNameOf(node, source)} ${parent ? classNameOf(parent, source) : ""}`;
      if (ACCENT_TILE.test(classes))
        findings.push(finding(source, node.getStart(source.ast), node.getText(source.ast)));
    });
  }

  return findings;
}

const LIST_ICON_ALLOWLIST: Allowlist = {};

describe("rule 28: list icons in the plain sidebar style", () => {
  it("never puts a list icon on a primary-colored tile or tints it with the primary color", () => {
    enforce(accentedListIconFindings(PRODUCT_SOURCES), LIST_ICON_ALLOWLIST);
  });

  it("recognizes a tinted list icon tile", () => {
    const source = sourceFromText(
      "tile.tsx",
      'const Icon = recordTypeIcon(icon);\nconst a = <span className="bg-primary/10"><Icon /></span>;\nconst b = <span className="text-muted-foreground"><Icon /></span>;',
    );
    expect(accentedListIconFindings([source]).map(({ line }) => line)).toEqual([2]);
  });
});

const BLUR = /\b(?:backdrop-)?blur(?:-[\w[\].]+)?\b/;
const MOTION = /\b(?:animate-|transition\b|transition-)/;

function animatedBlurFindings(sources: SourceFile[]) {
  const findings: Finding[] = [];

  for (const source of sources)
    visit(source.ast, (node) => {
      if (!ts.isStringLiteralLike(node)) return;
      const classes = node.text.split(/\s+/).map((name) => name.replace(/^[\w-]+(?:\[[^\]]*\])?:/g, ""));
      const blurred = classes.some((name) => BLUR.test(name) && !name.endsWith("-none"));
      if (blurred && MOTION.test(node.text)) findings.push(finding(source, node.getStart(source.ast), node.text));
    });

  return findings;
}

const ANIMATED_BLUR_ALLOWLIST: Allowlist = {};

describe("rule 12: overlays never animate a blur", () => {
  it("never combines a blur or backdrop blur with an animation or transition on one element", () => {
    enforce(animatedBlurFindings(PRODUCT_SOURCES), ANIMATED_BLUR_ALLOWLIST);
  });

  it("recognizes an animated blur and ignores a static one", () => {
    const source = sourceFromText(
      "overlay.tsx",
      'const a = "fixed inset-0 backdrop-blur-[2px] data-[state=open]:animate-in";\nconst b = "sticky backdrop-blur-md";\nconst c = "backdrop-blur-none animate-in";',
    );
    expect(animatedBlurFindings([source]).map(({ line }) => line)).toEqual([1]);
  });
});

const LOCAL_FILTER_UI = /\bRecordWidget(?:Field|Related)Filters\b|["'`]RecordWidgets\.(?:add|remove)Filter["'`]/;

const LOCAL_FILTER_UI_ALLOWLIST: Allowlist = {
  "app/[locale]/(protected)/dashboard/components/record-widget-filters.tsx":
    "I3r3b: widget filter rows move to the shared Filters palette",
  "app/[locale]/(protected)/dashboard/components/record-widget-editor.tsx":
    "I3r3b: widget editor filters through the shared Filters palette",
  "app/[locale]/(protected)/dashboard/components/record-activity-widget-editor.tsx":
    "I3r3b: activity widget filters through the shared Filters palette",
  "components/records/record-trigger-fields.tsx": "I3r3b: routine trigger filters through the shared Filters palette",
};

describe("rule 32: one filter design everywhere", () => {
  it("builds view, widget, routine and activity filters only with the shared Filters palette", () => {
    enforce(patternFindings(PRODUCT_SOURCES, LOCAL_FILTER_UI), LOCAL_FILTER_UI_ALLOWLIST);
  });
});

const FOCUS_TARGET_OWNER = "components/focus/focus-target.ts";
const HAND_BUILT_FOCUS_LINK = /[?&]focus=/;

function handBuiltFocusLinkFindings(sources: SourceFile[]) {
  const findings: Finding[] = [];

  for (const source of sources) {
    if (source.file === FOCUS_TARGET_OWNER) continue;
    visit(source.ast, (node) => {
      if (!ts.isStringLiteralLike(node) && !ts.isTemplateLiteralToken(node) && !ts.isTemplateHead(node)) return;
      if (HAND_BUILT_FOCUS_LINK.test(node.text))
        findings.push(finding(source, node.getStart(source.ast), node.getText(source.ast)));
    });
  }

  return findings;
}

const FOCUS_LINK_ALLOWLIST: Allowlist = {
  "features/docs/app-links.ts": "I21: build docs app links with focusHref",
};

describe("rule 36: one open-and-highlight mechanism", () => {
  it("builds and reads ?focus= links only through focus-target.ts", () => {
    enforce(handBuiltFocusLinkFindings(PRODUCT_SOURCES), FOCUS_LINK_ALLOWLIST);
  });

  it("recognizes a hand-built focus link in a string and a template", () => {
    const source = sourceFromText(
      "link.ts",
      'const a = "/configure?focus=field:1";\nconst b = `${path}?focus=${focus}`;',
    );
    expect(handBuiltFocusLinkFindings([source]).map(({ line }) => line)).toEqual([1, 2]);
  });
});

const ROW_MENU_PLUMBING = "components/data-view/";
const ROW_MENU_COMPONENT = "RecordRowActions";
const ROW_MENU_OWNER = "app/[locale]/(protected)/records/[typeId]/components/record-row-actions.tsx";
const ROW_MENU_ITEMS = ["RecordModel.openDetails", "Common.actions.delete"];

function ownRowMenuFindings(sources: SourceFile[]) {
  const findings: Finding[] = [];

  for (const source of sources) {
    if (source.file.startsWith(ROW_MENU_PLUMBING) || source.text.includes(`<${ROW_MENU_COMPONENT}`)) continue;
    visit(source.ast, (node) => {
      if (ts.isJsxAttribute(node) && ["rowActions", "cardActions"].includes(node.name.getText(source.ast)))
        findings.push(finding(source, node.getStart(source.ast), node.getText(source.ast)));
    });
  }

  return findings;
}

function rowMenuItemLabels(source: SourceFile) {
  const labels: string[] = [];
  visit(source.ast, (node) => {
    if (tagNameOf(node) !== "DropdownMenuItem") return;
    const key = /\bt\(\s*"([^"]+)"/.exec(node.getText(source.ast));
    if (key) labels.push(key[1]);
  });
  return labels;
}

const ROW_MENU_ALLOWLIST: Allowlist = {};

const TABLE_TAG = "DataViewContent";

function tablesWithoutRowMenuFindings(sources: SourceFile[]) {
  const findings: Finding[] = [];

  for (const source of sources) {
    if (source.file.startsWith(ROW_MENU_PLUMBING)) continue;
    visit(source.ast, (node) => {
      if (tagNameOf(node) !== TABLE_TAG || !(ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))) return;
      const hasRowMenu = attributesOf(node).properties.some(
        (property) => ts.isJsxAttribute(property) && property.name.getText(source.ast) === "rowActions",
      );
      if (!hasRowMenu) findings.push(finding(source, node.getStart(source.ast), node.getText(source.ast)));
    });
  }

  return findings;
}

const TABLE_ROW_MENU_EXEMPTIONS: Allowlist = {
  "app/[locale]/(protected)/settings/(workspace)/components/webhook/webhook-deliveries-page-view.tsx":
    "webhook deliveries are a read-only log: no delete, so a row menu would only repeat the row click",
  "app/[locale]/(protected)/operator/components/audit/operator-audit-page-view.tsx":
    "the operator audit is a read-only log: no delete, so a row menu would only repeat the row click",
  "app/[locale]/(protected)/operator/components/users/operator-users-page-view.tsx":
    "internal back-office surface with its own guarded flows, not customer UI",
  "app/[locale]/(protected)/operator/components/workspaces/operator-workspaces-page-view.tsx":
    "internal back-office surface with its own guarded flows, not customer UI",
};

const TABLE_ROW_MENU_ALLOWLIST: Allowlist = {
  "app/[locale]/(protected)/settings/(workspace)/components/user/members-page-view.tsx":
    "I20: rule 59 row menu on members",
  "app/[locale]/(protected)/settings/(workspace)/components/role/roles-page-view.tsx": "I20: rule 59 row menu on roles",
  "app/[locale]/(protected)/settings/(workspace)/components/webhook/webhooks-page-view.tsx":
    "I20: rule 59 row menu on webhooks",
  "app/[locale]/(protected)/routines/components/routines-page-view.tsx": "I20: rule 59 row menu on routines",
};

describe("I2 round 3 and rule 59: row click opens, every table has the row menu with Open details and Delete", () => {
  it("builds every table row and card menu with the shared row actions", () => {
    enforce(ownRowMenuFindings(PRODUCT_SOURCES), ROW_MENU_ALLOWLIST);
  });

  it("gives every table the shared row menu (rule 59)", () => {
    const findings = tablesWithoutRowMenuFindings(PRODUCT_SOURCES);
    expect(staleAllowlistEntries(findings, TABLE_ROW_MENU_EXEMPTIONS)).toEqual([]);
    const current = findings.filter(({ file }) => !(file in TABLE_ROW_MENU_EXEMPTIONS));
    enforce(current, TABLE_ROW_MENU_ALLOWLIST);
  });

  it("offers only Open details and Delete in the shared row menu", () => {
    const owner = PRODUCT_SOURCES.find(({ file }) => file === ROW_MENU_OWNER);
    expect(owner).toBeDefined();
    expect(rowMenuItemLabels(owner!)).toEqual(ROW_MENU_ITEMS);
  });

  it("recognizes a table with its own row menu", () => {
    const source = sourceFromText(
      "table.tsx",
      "const a = <DataViewContent rowActions={(row) => <Menu row={row} />} />;",
    );
    expect(ownRowMenuFindings([source]).map(({ line }) => line)).toEqual([1]);
  });

  it("recognizes a table without a row menu", () => {
    const source = sourceFromText(
      "settings.tsx",
      "const a = <DataViewContent columns={columns} />;\nconst b = <DataViewContent rowActions={menu} />;",
    );
    expect(tablesWithoutRowMenuFindings([source]).map(({ line }) => line)).toEqual([1]);
  });
});
