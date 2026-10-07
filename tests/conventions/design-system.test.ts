import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  PRODUCT_SOURCES,
  type Finding,
  type SourceFile,
  attributesOf,
  finding,
  moduleReferences,
  outsideAllowlist,
  patternFindings,
  resolvedSpecifier,
  staleAllowlistEntries,
  tagNameOf,
  visit,
} from "./design-system-scan";

type Allowlist = Readonly<Record<string, string>>;

function sourcesExcept(owners: ReadonlySet<string>, exemptions: Allowlist = {}) {
  return PRODUCT_SOURCES.filter(({ file }) => !owners.has(file) && !(file in exemptions));
}

function enforce(findings: Finding[], allowlist: Allowlist) {
  expect(outsideAllowlist(findings, allowlist)).toEqual([]);
  expect(staleAllowlistEntries(findings, allowlist)).toEqual([]);
}

function importFindings(sources: SourceFile[], modulePattern: RegExp) {
  return sources.flatMap((source) =>
    moduleReferences(source)
      .filter(({ specifier }) => modulePattern.test(specifier))
      .map(({ position, specifier }) => finding(source, position, `import ${specifier}`)),
  );
}

const TABS_OWNERS = new Set(["components/ui/tabs.tsx"]);

const TABS_ALLOWLIST: Allowlist = {
  "components/entity-detail/entity-detail-panels.tsx": "I2 r3: record page Overview / Notes / Activities segments",
  "components/data-view/header/display-options.tsx": "I2 r3: view layout picker as SegmentedControl",
  "app/[locale]/(protected)/records/[typeId]/components/record-editor-content.tsx": "I2 r3: record drawer segments",
  "app/[locale]/(protected)/configure/components/field-modal.tsx": "I1 r4: field drawer as one form with sections",
  "app/[locale]/(protected)/configure/components/relationship-modal.tsx": "I1 r4: relationship drawer sections",
  "app/[locale]/(protected)/configure/components/configure-list-pane.tsx": "I1 r4: list page sidebar list",
  "app/[locale]/(protected)/company/components/role/role-modal.tsx": "I19: role drawer as one form with sections",
  "app/[locale]/(protected)/company/components/company-invite/company-invite-modal.tsx": "I19: invite dialog",
  "app/[locale]/(protected)/profile/components/connected-account-modal.tsx": "I19: channel account drawer",
  "app/[locale]/(protected)/onboarding/wizard/components/step-invite.tsx": "I25 phase 2: onboarding invite step",
};

describe("rule 57: sections and segments instead of tab bars", () => {
  it("renders the Tabs primitive and the tabbed editor only through the shared segmented control", () => {
    const sources = sourcesExcept(TABS_OWNERS);
    enforce(importFindings(sources, /\/components\/(?:ui\/tabs|editor-tabs\/editor-tabs)$/), TABS_ALLOWLIST);
  });
});

const OVERLAY_PRIMITIVE_OWNER_PREFIXES = ["components/ui/", "components/modal/"];

const OVERLAY_PRIMITIVE_EXEMPTIONS: Allowlist = {
  "app/components/app-sidebar.tsx": "the mobile sidebar is the navigation shell, not a dialog or drawer",
};

const OVERLAY_PRIMITIVE_ALLOWLIST: Allowlist = {
  "app/[locale]/(protected)/records/[typeId]/components/record-editor.tsx": "I2 r3: record drawer on AppModal",
  "components/records/workspace-record-editor.tsx": "I2 r3: record drawer on AppModal",
  "components/records/record-compose-recovery.tsx": "I2 r3: compose recovery on the shared dialog",
  "app/[locale]/(protected)/configure/components/model-change-sheet.tsx": "I1 r4 / I5 r2: confirm dialog",
  "app/[locale]/(protected)/wiki/components/wiki-page-view.tsx": "I25 phase 2: wiki page drawer on AppModal",
};

describe("rules 31 and 35: dialogs and drawers through the shared overlay components", () => {
  it("imports the raw dialog, drawer and sheet primitives only inside the shared overlay components", () => {
    const sources = PRODUCT_SOURCES.filter(
      ({ file }) =>
        !OVERLAY_PRIMITIVE_OWNER_PREFIXES.some((prefix) => file.startsWith(prefix)) &&
        !(file in OVERLAY_PRIMITIVE_EXEMPTIONS),
    );

    enforce(importFindings(sources, /\/components\/ui\/(?:dialog|drawer|sheet)$/), OVERLAY_PRIMITIVE_ALLOWLIST);
  });
});

const ACTION_TAGS = new Set([
  "Button",
  "IconButton",
  "DropdownMenuItem",
  "ContextMenuItem",
  "CommandItem",
  "AlertDialogAction",
  "RowAction",
]);

const DELETE_LABEL = /\bt\(\s*["'`][\w.]*\.(?:\w*D|d)elete\w*["'`]/;
const TRASH_ICON = /<Trash\w*\b|\bicon[:=]\s*\{?\s*Trash\w*\b/;
const DESTRUCTIVE_VARIANT = /[dD]estructive/;

function isDeleteAction(text: string) {
  return TRASH_ICON.test(text) || DELETE_LABEL.test(text);
}

function isActionElement(node: ts.Node): node is ts.JsxElement | ts.JsxSelfClosingElement {
  const tag = tagNameOf(node);
  return tag !== undefined && ACTION_TAGS.has(tag);
}

function containsNestedDeleteAction(source: SourceFile, node: ts.Node) {
  let nested = false;
  node.forEachChild((child) =>
    visit(child, (descendant) => {
      if (isActionElement(descendant) && isDeleteAction(descendant.getText(source.ast))) nested = true;
    }),
  );
  return nested;
}

function objectProperty(node: ts.ObjectLiteralExpression, name: string) {
  return node.properties.find(
    (property) =>
      (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) &&
      property.name.getText() === name,
  );
}

function isAlwaysDestructive(expression: ts.Expression | undefined): boolean {
  if (!expression) return false;
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression))
    return isAlwaysDestructive(expression.expression);
  if (ts.isConditionalExpression(expression))
    return isAlwaysDestructive(expression.whenTrue) && isAlwaysDestructive(expression.whenFalse);
  return ts.isStringLiteralLike(expression) && DESTRUCTIVE_VARIANT.test(expression.text);
}

function variantExpression(node: ts.Node) {
  if (isActionElement(node)) {
    const attribute = attributesOf(node).properties.find(
      (property) => ts.isJsxAttribute(property) && property.name.getText() === "variant",
    );
    if (!attribute || !ts.isJsxAttribute(attribute) || !attribute.initializer) return undefined;
    return ts.isJsxExpression(attribute.initializer) ? attribute.initializer.expression : attribute.initializer;
  }
  if (!ts.isObjectLiteralExpression(node)) return undefined;
  const variant = objectProperty(node, "variant");
  return variant && ts.isPropertyAssignment(variant) ? variant.initializer : undefined;
}

function hasDestructiveVariant(node: ts.Node) {
  return isAlwaysDestructive(variantExpression(node));
}

function isActionDescriptor(node: ts.Node): node is ts.ObjectLiteralExpression {
  return (
    ts.isObjectLiteralExpression(node) &&
    objectProperty(node, "icon") !== undefined &&
    (objectProperty(node, "onClick") !== undefined || objectProperty(node, "onSelect") !== undefined)
  );
}

function destructiveActionFindings(sources: SourceFile[]) {
  const findings: Finding[] = [];

  for (const source of sources)
    visit(source.ast, (node) => {
      if (!isActionElement(node) && !isActionDescriptor(node)) return;
      const text = node.getText(source.ast);
      if (!isDeleteAction(text) || hasDestructiveVariant(node) || containsNestedDeleteAction(source, node)) return;
      findings.push(finding(source, node.getStart(source.ast), text));
    });

  return findings;
}

const DESTRUCTIVE_ALLOWLIST: Allowlist = {
  "app/[locale]/(protected)/configure/components/field-modal.tsx": "I1 r4: option and input trash buttons",
  "app/[locale]/(protected)/records/[typeId]/components/record-embedded-records.tsx": "I2 r3: sub-list row delete",
  "app/[locale]/(protected)/records/[typeId]/components/record-mass-actions.tsx": "I2 r3: mass delete button",
  "app/[locale]/(protected)/records/[typeId]/components/record-row-actions.tsx": "I2 r3: row delete action",
  "app/[locale]/(protected)/inbox/components/message-item.tsx": "I25 phase 2: email draft discard is neutral grey",
};

const DESTRUCTIVE_EXEMPTIONS: Allowlist = {
  "components/modal/delete-confirmation-modal.tsx": "the shared confirm dialog; each caller sets its confirm variant",
};

describe("rule 54: delete actions use the destructive variant", () => {
  it("marks every delete button, menu item and header action as destructive", () => {
    enforce(destructiveActionFindings(sourcesExcept(new Set(), DESTRUCTIVE_EXEMPTIONS)), DESTRUCTIVE_ALLOWLIST);
  });
});

const TOP_BAR_HOOKS = new Set(["useSetTopBarActions", "useSetTopBarActionsOverride"]);
const RAW_TOP_BAR_CONTROL = /<(?:Button|button|IconButton)\b/;
const PAGE_COMPONENT_SPECIFIER = /^@\/app\/\[locale\]\//;

function declaredInitializer(scope: ts.Node, name: string): ts.Expression | undefined {
  const statements = ts.isSourceFile(scope) || ts.isBlock(scope) ? scope.statements : [];
  for (const statement of statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations)
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) return declaration.initializer;
  }
  return undefined;
}

function resolvedTopBarNode(argument: ts.Expression): ts.Expression | undefined {
  if (!ts.isIdentifier(argument)) return argument;
  for (let scope: ts.Node | undefined = argument.parent; scope; scope = scope.parent) {
    const initializer = declaredInitializer(scope, argument.text);
    if (initializer) return initializer;
  }
  return undefined;
}

function sourceOfFile(file: string) {
  return PRODUCT_SOURCES.find((candidate) => candidate.file === file);
}

function pageComponentSource(source: SourceFile, tag: string): string | undefined {
  for (const statement of source.ast.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === tag) return statement.getText(source.ast);
    if (ts.isVariableStatement(statement) && statement.declarationList.declarations.some((d) => d.name.getText(source.ast) === tag))
      return statement.getText(source.ast);
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings) || !bindings.elements.some((element) => element.name.text === tag))
      continue;
    const specifier = resolvedSpecifier(source, statement.moduleSpecifier.text);
    if (!PAGE_COMPONENT_SPECIFIER.test(specifier)) return undefined;
    const base = specifier.slice(2);
    return (sourceOfFile(`${base}.tsx`) ?? sourceOfFile(`${base}.ts`))?.text;
  }
  return undefined;
}

function rendersRawTopBarControl(source: SourceFile, node: ts.Expression) {
  if (RAW_TOP_BAR_CONTROL.test(node.getText(source.ast))) return true;
  let found = false;
  visit(node, (child) => {
    const tag = tagNameOf(child);
    if (!tag || !/^[A-Z]/.test(tag) || found) return;
    const component = pageComponentSource(source, tag);
    if (component && RAW_TOP_BAR_CONTROL.test(component)) found = true;
  });
  return found;
}

function topBarFindings(sources: SourceFile[]) {
  const findings: Finding[] = [];

  for (const source of sources)
    visit(source.ast, (node) => {
      if (!ts.isCallExpression(node) || !TOP_BAR_HOOKS.has(node.expression.getText(source.ast))) return;
      const [argument] = node.arguments;
      if (!argument) return;
      const resolved = resolvedTopBarNode(argument);
      if (!resolved || rendersRawTopBarControl(source, resolved))
        findings.push(finding(source, node.getStart(source.ast), node.getText(source.ast)));
    });

  return findings;
}

const TOP_BAR_ALLOWLIST: Allowlist = {
  "app/[locale]/(protected)/records/[typeId]/components/records-page-view.tsx": "I2 r3: Configure button through the shared top-bar action buttons",
  "app/[locale]/(protected)/dashboard/components/dashboard-page-view.tsx": "I3 r3: Add widget through the shared top-bar action buttons",
  "app/[locale]/(protected)/company/components/subscription/subscription-view.tsx": "I19: billing page actions",
  "app/[locale]/(protected)/profile/components/api-keys-page-view.tsx": "I19: API keys Add through the shared top-bar action buttons",
  "app/[locale]/(protected)/inbox/components/inbox-list.tsx": "I25 phase 2: refresh and connect through I2's top-bar action buttons",
  "app/[locale]/(protected)/inbox/components/thread-topbar.tsx": "I25 phase 2: resync through I2's top-bar action buttons",
  "app/[locale]/(protected)/records/[typeId]/components/record-editor-actions.tsx": "I2 r3: record page top-bar actions",
  "app/[locale]/(protected)/configure/components/configure-page-view.tsx": "I1 r4: ConfigureTopBarActions buttons",
  "app/[locale]/(protected)/profile/components/profile-settings-form.tsx": "I19: VerifyEmailAction button",
  "app/[locale]/(protected)/profile/components/connected-accounts-page-view.tsx": "I19: ConnectAction button",
  "app/[locale]/(protected)/wiki/components/wiki-page-view.tsx": "I25 phase 2: wiki page actions",
};

describe("rules 5, 6 and 58: top-bar actions and view chips through their shared components", () => {
  it("builds every top-bar action node from DataViewToolbar or the shared top-bar action buttons", () => {
    enforce(topBarFindings(PRODUCT_SOURCES), TOP_BAR_ALLOWLIST);
  });

  it("renders saved-view chips only through the shared views rail", () => {
    const sources = PRODUCT_SOURCES.filter(({ file }) => !file.startsWith("components/data-view/views/"));
    const findings = [
      ...importFindings(sources, /\/components\/data-view\/views\/view-chip$/),
      ...patternFindings(sources, /\bVIEW_(?:TAB|TAB_ACTIVE|SURFACE)_CLASS\b|\bdata-view-chip\b/),
    ];

    enforce(findings, {});
  });
});

const VALUE_FORMAT =
  /\bIntl\.(?:DateTimeFormat(?!\(\)\.resolvedOptions)|NumberFormat|RelativeTimeFormat)\b|\.toLocale(?:Date|Time)?String\(|\buseFormatter\(\)|\bformat\.(?:dateTime|number|relativeTime)\(/;

const VALUE_RENDERER_OWNERS = new Set(["app/[locale]/(protected)/records/[typeId]/components/record-value.tsx"]);

const VALUE_RENDERER_ALLOWLIST: Allowlist = {
  "components/data-view/group-summaries.tsx": "I2 r3: group totals through the shared formatters",
  "app/[locale]/(protected)/legal-update/components/legal-update-view.tsx": "I25 phase 2: effective date",
  "app/[locale]/(protected)/operator/overview/page.tsx": "I25 phase 2: operator metrics",
};

function isRenderingSource({ file }: SourceFile) {
  if (file.startsWith("components/ui/")) return false;
  return file.startsWith("app/") || file.startsWith("components/") || file.endsWith(".tsx");
}

describe("rule 47: one value renderer per data type", () => {
  it("formats dates, numbers and money only inside the shared value renderers", () => {
    const sources = sourcesExcept(VALUE_RENDERER_OWNERS).filter(isRenderingSource);

    enforce(patternFindings(sources, VALUE_FORMAT), VALUE_RENDERER_ALLOWLIST);
  });
});

const PALETTE_COLOR =
  /\b(?:text|bg|border|ring|fill|stroke|from|to|via|outline|decoration|shadow|divide|accent|caret|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\d{2,3})?(?:\/\d+)?\b/;
const LITERAL_COLOR = /(?<=^|[[(:,\s=])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|\b(?:rgba?|hsla?|oklch)\(/;

const COLOR_OWNERS = new Set([
  "components/ui/button.tsx",
  "components/ui/dialog.tsx",
  "components/ui/alert-dialog.tsx",
  "components/ui/drawer.tsx",
  "components/ui/sheet.tsx",
  "components/shared/loading-overlay.tsx",
]);

const COLOR_EXEMPTIONS: Allowlist = {
  "features/messaging/email-frame.tsx": "styles the sandboxed email document, which cannot read app tokens",
  "ee/messaging/email-settings.ts": "outgoing email HTML, rendered by mail clients without app tokens",
  "ee/messaging/email-styles.ts": "outgoing email HTML, rendered by mail clients without app tokens",
  "features/messaging/message-body.tsx": "renders email bodies on white paper, as mail clients do",
  "components/ai-connection/ai-client-logo.tsx": "third-party brand mark in its own brand color",
  "app/layout.tsx": "browser theme-color metadata, which cannot reference CSS tokens",
};

function stringLiteralFindings(sources: SourceFile[], pattern: RegExp) {
  const findings: Finding[] = [];

  for (const source of sources)
    visit(source.ast, (node) => {
      if (!(ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node) || ts.isJsxText(node))) return;
      const text = ts.isJsxText(node) ? node.getText(source.ast) : node.text;
      const match = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, "")).exec(text);
      if (match) findings.push(finding(source, node.getStart(source.ast), match[0]));
    });

  return findings;
}

const COLOR_ALLOWLIST: Allowlist = {
  "app/[locale]/(protected)/configure/components/model-change-sheet.tsx": "I1 r4 / I5 r2: scrim token",
  "components/data-view/data-kanban-view.tsx": "I2 r3: drag shadow token",
  "app/[locale]/(protected)/inbox/components/attachment-classify.ts": "I25 phase 2: file type colors from tokens",
  "app/components/agent-chat/agent-chat.tsx": "I25 phase 2: Mate panel shadow token",
  "app/components/agent-chat/agent-tour-overlay.tsx": "I25 phase 2: tour scrim token",
};

describe("rule 58: colors only through design tokens", () => {
  it("uses no Tailwind palette colors or literal color values outside the token owners", () => {
    const sources = sourcesExcept(COLOR_OWNERS, COLOR_EXEMPTIONS);
    const findings = [...stringLiteralFindings(sources, PALETTE_COLOR), ...stringLiteralFindings(sources, LITERAL_COLOR)];

    enforce(findings, COLOR_ALLOWLIST);
  });
});

const ICON_LIBRARY = "lucide-react";
const FOREIGN_ICON_LIBRARY = /^(?:@tabler\/icons|react-icons|@heroicons|@radix-ui\/react-icons|@phosphor-icons|react-feather)/;

const INLINE_SVG_EXEMPTIONS: Allowlist = {
  "components/ai-connection/ai-client-logo.tsx": "third-party brand mark, not part of the icon set",
  "app/components/agent-chat/usage-ring.tsx": "data graphic (usage progress ring), not an icon",
  "app/[locale]/(protected)/onboarding/wizard/components/onboarding-artwork.tsx": "illustration, not an icon",
  "app/[locale]/(protected)/dashboard/components/widget-display-type-picker.tsx": "chart preview illustration",
};

const INLINE_SVG_ALLOWLIST: Allowlist = {};

describe("rule 58: icons from the shared icon set", () => {
  it(`imports icons only from ${ICON_LIBRARY}`, () => {
    enforce(importFindings(PRODUCT_SOURCES, FOREIGN_ICON_LIBRARY), {});
  });

  it("draws no inline svg icons on product surfaces", () => {
    enforce(patternFindings(sourcesExcept(new Set(), INLINE_SVG_EXEMPTIONS), /<svg\b/), INLINE_SVG_ALLOWLIST);
  });
});

const KEY_CAP_OWNERS = new Set(["components/keyboard/shortcut-keys.tsx"]);
const RAW_KEY_HINT = /<kbd\b|&#8984;|⌘|\\u2318/;

const KEY_CAP_ALLOWLIST: Allowlist = {
  "app/components/navigation/nav-header.tsx": "I22: sidebar quick action key hints",
  "app/components/global-search-modal.tsx": "I22: Cmd+K palette key hints",
  "app/components/app-sidebar.tsx": "I22: Ask Mate key hint from the shortcut registry",
};

describe("rule 52: key hints only through the shared key caps", () => {
  it("renders keyboard hints only inside the shared key cap component", () => {
    enforce(patternFindings(sourcesExcept(KEY_CAP_OWNERS), RAW_KEY_HINT), KEY_CAP_ALLOWLIST);
  });
});

const NATIVE_TITLE_HOSTS = new Set(["Button", "DropdownMenuItem", "CommandItem", "SelectItem", "DropdownMenuSubTrigger"]);
const TITLE_EXEMPT_TAGS = new Set(["iframe", "title", "svg"]);

function nativeTitleFindings(sources: SourceFile[]) {
  const findings: Finding[] = [];

  for (const source of sources)
    visit(source.ast, (node) => {
      if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return;
      const tag = node.tagName.getText(source.ast);
      const intrinsic = /^[a-z]/.test(tag) && !tag.includes(".");
      if (TITLE_EXEMPT_TAGS.has(tag) || (!intrinsic && !NATIVE_TITLE_HOSTS.has(tag))) return;
      const title = node.attributes.properties.find(
        (property) => ts.isJsxAttribute(property) && property.name.getText(source.ast) === "title",
      );
      if (title) findings.push(finding(source, title.getStart(source.ast), `<${tag} ${title.getText(source.ast)}`));
    });

  return findings;
}

const NATIVE_TITLE_EXEMPTIONS: Allowlist = {
  "components/shared/locale-menu.tsx": "public website and docs language menu, outside the product UI",
};

const NATIVE_TITLE_ALLOWLIST: Allowlist = {
  "app/[locale]/(protected)/inbox/components/email-message-header.tsx": "I25 phase 2: sent time tooltip",
  "app/[locale]/(protected)/inbox/components/thread-folder-menu.tsx": "I25 phase 2: folder name tooltip",
  "components/data-view/filter-modal/inputs/filter-input-select.tsx": "I25 phase 2: group label tooltip",
  "components/data-view/filter-palette/palette-value-select.tsx": "I25 phase 2: group label tooltip",
  "components/layout/resizable-panels.tsx": "I25 phase 2: resize hint tooltip",
};

describe("rule 4: tooltips through the app Tooltip, never title attributes", () => {
  it("sets no native title attribute on product elements", () => {
    enforce(nativeTitleFindings(sourcesExcept(new Set(), NATIVE_TITLE_EXEMPTIONS)), NATIVE_TITLE_ALLOWLIST);
  });
});
