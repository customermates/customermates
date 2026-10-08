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
  "app/components/agent-chat/ui-control.store.ts": "final sweep: recognize focus links through focus-target.ts",
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
