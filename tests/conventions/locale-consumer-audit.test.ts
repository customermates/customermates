import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";
import ts from "typescript";

import { REPO_ROOT, walkFiles } from "./walk";

import { REGISTERED_LOCALES } from "@/i18n/locale-registry";

const ENFORCED = true;

const ALLOWED = new Set([
  "i18n/locale-registry.ts",
  "tests/conventions/locale-consumer-audit.test.ts",
  "tests/conventions/locale-registry.test.ts",
  "__tests__/proxy-locales.test.ts",
  "__tests__/proxy.test.ts",
  "tests/helpers/mock-user.ts",
]);

const LOCALE_ALTERNATION = REGISTERED_LOCALES.join("|");
const LOCALE_LIST_LITERAL = new RegExp(
  `\\[\\s*["'](?:${LOCALE_ALTERNATION})["']\\s*(?:,\\s*["'](?:${LOCALE_ALTERNATION})["']\\s*)+\\]`,
);
const LOCALE_UNION_TYPE = new RegExp(
  `["'](?:${LOCALE_ALTERNATION})["']\\s*\\|\\s*["'](?:${LOCALE_ALTERNATION})["']`,
);
const REDECLARED_LOCALE_ALIAS =
  /\(typeof\s+(?:REGISTERED_LOCALES|ROUTING_LOCALES|APP_LOCALES|CONTENT_LOCALES|FORMATTING_LOCALES)\)\[number\]/;

const DOMAIN_EXPECTATIONS: Array<{ file: string; imports: string }> = [
  { file: "app/sitemap.ts", imports: "CONTENT_LOCALES" },
  { file: "core/fumadocs/i18n.ts", imports: "CONTENT_LOCALES" },
  { file: "core/fumadocs/metadata.ts", imports: "CONTENT_LOCALES" },
  { file: "components/shared/language-selector.tsx", imports: "CONTENT_LOCALES" },
  { file: "scripts/generate-raw-docs-manifest.ts", imports: "CONTENT_LOCALES" },
  { file: "app/[locale]/(protected)/profile/components/profile-settings-form.tsx", imports: "DISPLAY_LANGUAGE_VALUES" },
  { file: "app/[locale]/(protected)/profile/components/profile-settings-form.tsx", imports: "FORMATTING_LOCALE_VALUES" },
  { file: "features/user/upsert/update-user-details.interactor.ts", imports: "StoredDisplayLanguageSchema" },
  { file: "features/user/upsert/update-user-details.interactor.ts", imports: "StoredFormattingLocaleSchema" },
  { file: "features/user/get/get-user-details.interactor.ts", imports: "StoredDisplayLanguageSchema" },
  { file: "features/user/get/get-user-details.interactor.ts", imports: "StoredFormattingLocaleSchema" },
  { file: "core/stores/intl.store.ts", imports: "isFormattingLocale" },
];

const ALLOWED_AMBIENT_FORMATTING_SITES = new Map([
  [
    "app/[locale]/(protected)/profile/components/profile-settings-form.tsx :: new Intl.DateTimeFormat :: <missing>",
    "Browser-language detection intentionally asks the browser for its resolved locale.",
  ],
  [
    'ee/scripts/get-user-stats.ts :: toLocaleDateString :: "en"',
    "Operator-only CLI output has a stable English contract.",
  ],
  [
    'ee/scripts/get-user-stats.ts :: toLocaleString :: "en"',
    "Operator-only CLI output has a stable English contract.",
  ],
]);

type VisibleCopyException = { count: number; reason: string };
const reviewedVisibleCopy = (reason: string, sites: readonly string[]) =>
  sites.map((site): [string, VisibleCopyException] => [site, { count: 1, reason }]);

const ALLOWED_VISIBLE_COPY_SITES = new Map<string, VisibleCopyException>([
  ...reviewedVisibleCopy("Proper names and product brands are locale-invariant.", [
    'app/[locale]/(protected)/company/components/subscription/subscribe-manage-button.tsx :: jsx-alt :: "Lemon Squeezy"',
    'app/[locale]/(static)/blog/[slug]/page.tsx :: jsx-alt :: "Benjamin Wagner"',
    'app/[locale]/(static)/blog/blog-post-card.tsx :: jsx-alt :: "Benjamin Wagner"',
    'app/[locale]/(static)/docs/components/docs-sidebar.tsx :: jsx-text :: "Customermates"',
    'app/components/footer-content.tsx :: jsx-text :: "GitHub"',
    'app/components/footer-content.tsx :: jsx-text :: "LinkedIn"',
    'app/components/footer-content.tsx :: jsx-text :: "X (Twitter)"',
    'app/components/footer-content.tsx :: jsx-text :: "Viesearch - The Human-curated Search Engine"',
    'components/emails/base/email-layout.tsx :: jsx-alt :: "Customermates"',
    'components/emails/base/email-layout.tsx :: jsx-text :: "Customermates ·"',
    'components/marketing/comparison-table.tsx :: jsx-alt :: "Customermates"',
    'components/marketing/cta-section.tsx :: jsx-alt :: "Customermates"',
  ]),
  ...reviewedVisibleCopy("Terminal, keyboard, and backlink tokens have invariant external meaning.", [
    'app/[locale]/(static)/components/homepage-clip-terminal.tsx :: jsx-text :: "~/agent"',
    'app/[locale]/(static)/components/homepage-clip-terminal.tsx :: jsx-text :: "tool"',
    'app/components/footer-content.tsx :: jsx-text :: "https://www.promotebusinessdirectory.com/"',
    'app/components/footer-content.tsx :: jsx-text :: "http://www.usawebsitesdirectory.com/computers_and_internet/"',
    'app/components/footer-content.tsx :: jsx-text :: "https://www.bestsitesindex.com/submit.php"',
    'app/components/navigation/nav-header.tsx :: jsx-text :: "&#8984;K"',
  ]),
  ...reviewedVisibleCopy("The company identity and address are legal contact data, not localized prose.", [
    'components/emails/base/email-layout.tsx :: jsx-text :: "Benjamin Wagner · An den Kasernen 25 · 68167 Mannheim,"',
    'components/emails/base/email-layout.tsx :: jsx-text :: "mail@customermates.com"',
  ]),
  ...reviewedVisibleCopy("These English-only templates notify internal operators, not localized recipients.", [
    'components/emails/contact-inquiry.tsx :: jsx-label :: "From"',
    'components/emails/contact-inquiry.tsx :: jsx-label :: "Company"',
    'components/emails/contact-inquiry.tsx :: jsx-label :: "Message"',
    'components/emails/feedback.tsx :: jsx-label :: "From"',
    'components/emails/feedback.tsx :: jsx-label :: "Type"',
    'components/emails/feedback.tsx :: jsx-label :: "Feedback"',
    'components/emails/new-user-notification.tsx :: jsx-label :: "User"',
    'components/emails/new-user-notification.tsx :: jsx-label :: "Provider"',
    'components/emails/support-escalation.tsx :: jsx-title :: "Support request"',
    'components/emails/support-escalation.tsx :: jsx-label :: "From"',
    'components/emails/support-escalation.tsx :: jsx-label :: "Company"',
    'components/emails/support-escalation.tsx :: jsx-label :: "Conversation"',
    'components/emails/support-escalation.tsx :: jsx-label :: "Recent messages"',
  ]),
  ...reviewedVisibleCopy("The parser enables this only when Intl selects the ASCII AM/PM time grammar.", [
    'components/forms/time-input.tsx :: jsx-placeholder :: "12:00:00 AM"',
  ]),
]);

const VISIBLE_JSX_ATTRIBUTES = new Set([
  "alt",
  "aria-label",
  "description",
  "emptyContent",
  "label",
  "loadingMessage",
  "placeholder",
  "title",
]);
const VISIBLE_PROPERTY_NAMES = new Set([
  "alt",
  "aria-label",
  "ariaLabel",
  "description",
  "emptyContent",
  "label",
  "loadingMessage",
  "placeholder",
  "title",
]);

const INTL_CONSTRUCTORS = new Set(["Collator", "DateTimeFormat", "NumberFormat", "RelativeTimeFormat"]);
const TO_LOCALE_METHODS = new Set(["toLocaleDateString", "toLocaleString", "toLocaleTimeString"]);

function isAmbientOrLiteralLocale(node: ts.Expression | undefined): boolean {
  if (!node) return true;
  if (ts.isIdentifier(node) && node.text === "undefined") return true;
  if (!ts.isStringLiteralLike(node)) return false;
  return node.text === "default" || /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/iu.test(node.text);
}

function formattingSitesInSource(source: string, repoPath: string): string[] {
  const sites: string[] = [];
  const sourceFile = ts.createSourceFile(repoPath, source, ts.ScriptTarget.Latest, true);
  const argumentLabel = (node: ts.Expression | undefined) => (node ? node.getText(sourceFile) : "<missing>");

  const visit = (node: ts.Node): void => {
    if (
      ts.isNewExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "Intl" &&
      INTL_CONSTRUCTORS.has(node.expression.name.text) &&
      isAmbientOrLiteralLocale(node.arguments?.[0])
    ) {
      sites.push(
        `${repoPath} :: new Intl.${node.expression.name.text} :: ${argumentLabel(node.arguments?.[0])}`,
      );
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (TO_LOCALE_METHODS.has(method) && isAmbientOrLiteralLocale(node.arguments[0]))
        sites.push(`${repoPath} :: ${method} :: ${argumentLabel(node.arguments[0])}`);
      if (method === "localeCompare" && !node.arguments[1])
        sites.push(`${repoPath} :: localeCompare :: <missing locale>`);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return sites;
}

function ambientFormattingSites(): string[] {
  const found: string[] = [];
  for (const path of scannedFiles()) {
    const repoPath = relative(REPO_ROOT, path);
    if (!isProductionSource(repoPath)) continue;
    found.push(...formattingSitesInSource(readFileSync(path, "utf8"), repoPath));
  }
  return found;
}

function scannedFiles(): string[] {
  return walkFiles(REPO_ROOT, (path) => path.endsWith(".ts") || path.endsWith(".tsx"));
}

function violations(pattern: RegExp): string[] {
  const found: string[] = [];

  for (const path of scannedFiles()) {
    const repoPath = relative(REPO_ROOT, path);
    if (ALLOWED.has(repoPath)) continue;

    const source = readFileSync(path, "utf8");
    source.split("\n").forEach((line, index) => {
      if (pattern.test(line)) found.push(`${repoPath}:${index + 1}: ${line.trim()}`);
    });
  }

  return found;
}

function isProductionSource(repoPath: string): boolean {
  return (
    !/(^|\/)(?:tests|__tests__)(?:\/|$)/.test(repoPath) &&
    !repoPath.startsWith("app/[locale]/(protected)/test/") &&
    // The style guide is an internal, noindex engineering reference. Its copy names tokens
    // and CSS roles, so it is deliberately English-only and never shown to a customer.
    !repoPath.startsWith("app/[locale]/(static)/styleguide/")
  );
}

function normalizedVisibleCopy(value: string): string | undefined {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (/^&[a-z]+;$/iu.test(normalized)) return undefined;
  return /\p{L}/u.test(normalized) ? normalized : undefined;
}

function propertyName(node: ts.PropertyName | ts.BindingName): string | undefined {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return undefined;
}

function isStaticallyAriaHidden(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  for (let current = node.parent; current; current = current.parent) {
    if (!ts.isJsxElement(current)) continue;
    const attribute = current.openingElement.attributes.properties.find(
      (property): property is ts.JsxAttribute =>
        ts.isJsxAttribute(property) && property.name.getText(sourceFile) === "aria-hidden",
    );
    if (!attribute) continue;
    if (!attribute.initializer) return true;
    if (ts.isStringLiteral(attribute.initializer) && attribute.initializer.text === "true") return true;
    if (ts.isJsxExpression(attribute.initializer)) {
      const expression = attribute.initializer.expression;
      if (expression?.kind === ts.SyntaxKind.TrueKeyword) return true;
      if (expression && ts.isStringLiteralLike(expression) && expression.text === "true") return true;
    }
  }
  return false;
}

function visibleCopySitesInSource(source: string, repoPath: string): string[] {
  const sites: string[] = [];
  const sourceFile = ts.createSourceFile(repoPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const record = (kind: string, value: string): void => {
    const normalized = normalizedVisibleCopy(value);
    if (normalized) sites.push(`${repoPath} :: ${kind} :: ${JSON.stringify(normalized)}`);
  };
  const recordLiteral = (kind: string, node: ts.Node | undefined): void => {
    if (node && ts.isStringLiteralLike(node)) record(kind, node.text);
  };
  const recordLiteralBranches = (kind: string, node: ts.Expression | undefined): void => {
    if (!node) return;
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node)
    ) {
      recordLiteralBranches(kind, node.expression);
      return;
    }
    if (ts.isConditionalExpression(node)) {
      recordLiteralBranches(kind, node.whenTrue);
      recordLiteralBranches(kind, node.whenFalse);
      return;
    }
    if (
      ts.isBinaryExpression(node) &&
      [
        ts.SyntaxKind.AmpersandAmpersandToken,
        ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.QuestionQuestionToken,
      ].includes(node.operatorToken.kind)
    ) {
      recordLiteralBranches(kind, node.left);
      recordLiteralBranches(kind, node.right);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      record(kind, node.head.text);
      for (const span of node.templateSpans) record(kind, span.literal.text);
      return;
    }
    recordLiteral(kind, node);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node) && !isStaticallyAriaHidden(node, sourceFile)) record("jsx-text", node.text);

    if (ts.isJsxAttribute(node) && VISIBLE_JSX_ATTRIBUTES.has(node.name.getText(sourceFile))) {
      if (node.initializer && ts.isStringLiteral(node.initializer)) record(`jsx-${node.name.getText(sourceFile)}`, node.initializer.text);
      if (node.initializer && ts.isJsxExpression(node.initializer))
        recordLiteralBranches(`jsx-${node.name.getText(sourceFile)}`, node.initializer.expression);
    }

    if (ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      if (node.expression && ts.isConditionalExpression(node.expression)) {
        recordLiteralBranches("jsx-conditional", node.expression.whenTrue);
        recordLiteralBranches("jsx-conditional", node.expression.whenFalse);
      } else if (
        node.expression &&
        ts.isBinaryExpression(node.expression) &&
        [
          ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
        ].includes(node.expression.operatorToken.kind)
      ) {
        recordLiteralBranches("jsx-logical", node.expression);
      }
    }

    if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name);
      if (name && VISIBLE_PROPERTY_NAMES.has(name)) recordLiteral(`property-${name}`, node.initializer);
    }

    if (ts.isBindingElement(node) && node.initializer) {
      const name = propertyName(node.propertyName ?? node.name);
      if (name && VISIBLE_PROPERTY_NAMES.has(name)) recordLiteral(`default-${name}`, node.initializer);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return sites;
}

function visibleCopySites(): string[] {
  const sites: string[] = [];
  for (const path of scannedFiles()) {
    const repoPath = relative(REPO_ROOT, path);
    if (!path.endsWith(".tsx") || !isProductionSource(repoPath)) continue;
    sites.push(...visibleCopySitesInSource(readFileSync(path, "utf8"), repoPath));
  }
  return sites;
}

function occurrenceCounts(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function hardCodedLocaleComparisonsInSource(source: string, repoPath: string): string[] {
  const localeValues = new Set<string>(REGISTERED_LOCALES);
  const found: string[] = [];
  const sourceFile = ts.createSourceFile(repoPath, source, ts.ScriptTarget.Latest, true);

  const record = (node: ts.Node): void => {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    found.push(`${repoPath}:${line}: ${node.getText(sourceFile)}`);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.kind;
      const comparesEquality =
        operator === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        operator === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        operator === ts.SyntaxKind.EqualsEqualsToken ||
        operator === ts.SyntaxKind.ExclamationEqualsToken;
      const left = ts.isStringLiteralLike(node.left) ? node.left : null;
      const right = ts.isStringLiteralLike(node.right) ? node.right : null;
      const literal = left ?? right;

      if (comparesEquality && literal && localeValues.has(literal.text)) record(node);
    }

    if (
      ts.isCaseClause(node) &&
      ts.isStringLiteralLike(node.expression) &&
      localeValues.has(node.expression.text)
    ) {
      record(node);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

function hardCodedLocaleComparisons(): string[] {
  const found: string[] = [];

  for (const path of scannedFiles()) {
    const repoPath = relative(REPO_ROOT, path);
    if (ALLOWED.has(repoPath) || !isProductionSource(repoPath)) continue;

    found.push(...hardCodedLocaleComparisonsInSource(readFileSync(path, "utf8"), repoPath));
  }

  return found;
}

function literalCreateZodErrorSitesInSource(source: string, repoPath: string): string[] {
  const found: string[] = [];
  const sourceFile = ts.createSourceFile(repoPath, source, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "createZodError" &&
      node.arguments[0] &&
      (ts.isStringLiteralLike(node.arguments[0]) || ts.isTemplateExpression(node.arguments[0]))
    ) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      found.push(`${repoPath}:${line}: ${node.getText(sourceFile)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function literalCreateZodErrorSites(): string[] {
  return scannedFiles().flatMap((path) => {
    const repoPath = relative(REPO_ROOT, path);
    if (!isProductionSource(repoPath)) return [];
    return literalCreateZodErrorSitesInSource(readFileSync(path, "utf8"), repoPath);
  });
}

describe("locale consumer audit", () => {
  it.skipIf(!ENFORCED)("declares no locale list outside the registry", () => {
    const found = violations(LOCALE_LIST_LITERAL);
    expect(found, `hard-coded locale lists (import from @/i18n/locale-registry instead):\n${found.join("\n")}`).toEqual(
      [],
    );
  });

  it.skipIf(!ENFORCED)("declares no locale union type outside the registry", () => {
    const found = violations(LOCALE_UNION_TYPE);
    expect(
      found,
      `hard-coded locale union types (use AppLocale, ContentLocale or RoutingLocale):\n${found.join("\n")}`,
    ).toEqual([]);
  });

  it.skipIf(!ENFORCED)("re-declares no locale alias from a registry array", () => {
    const found = violations(REDECLARED_LOCALE_ALIAS);
    expect(found, `re-declared locale aliases (import the exported type instead):\n${found.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED)("contains no direct language-code comparison outside the registry", () => {
    const found = hardCodedLocaleComparisons();
    expect(
      found,
      `hard-coded locale comparisons (model the behavior in the locale registry):\n${found.join("\n")}`,
    ).toEqual([]);
  });

  it("detects aliased equality and switch comparisons", () => {
    const found = hardCodedLocaleComparisonsInSource(
      `const current = useLocale();
       const label = current === "de" ? title : fallback;
       switch (current) {
         case "fr": return title;
       }`,
      "fixture.ts",
    );

    expect(found).toHaveLength(2);
    expect(found.join("\n")).toContain('current === "de"');
    expect(found.join("\n")).toContain('case "fr"');
  });

  it.skipIf(!ENFORCED)("uses explicit registry-derived locales for user-visible formatting", () => {
    const observed = ambientFormattingSites();
    const unexpected = observed.filter((site) => !ALLOWED_AMBIENT_FORMATTING_SITES.has(site));
    const stale = [...ALLOWED_AMBIENT_FORMATTING_SITES.keys()].filter((site) => !observed.includes(site));

    expect(
      unexpected,
      `ambient or hard-coded locale formatting sites (use a registry formatting tag):\n${unexpected.join("\n")}`,
    ).toEqual([]);
    expect(stale, `stale ambient-formatting exceptions:\n${stale.join("\n")}`).toEqual([]);
  });

  it("detects ambient Intl, aliased toLocale calls, and localeCompare", () => {
    const found = formattingSitesInSource(
      `new Intl.NumberFormat(undefined).format(1);
       value.toLocaleDateString("en-US");
       record.createdAt.toLocaleString();
       left.localeCompare(right);`,
      "fixture.ts",
    );

    expect(found).toEqual([
      "fixture.ts :: new Intl.NumberFormat :: undefined",
      'fixture.ts :: toLocaleDateString :: "en-US"',
      "fixture.ts :: toLocaleString :: <missing>",
      "fixture.ts :: localeCompare :: <missing locale>",
    ]);
  });

  it.skipIf(!ENFORCED)("contains no unreviewed hard-coded visible copy in production TSX", () => {
    const observed = occurrenceCounts(visibleCopySites());
    const unexpected = [...observed].filter(([site, count]) => ALLOWED_VISIBLE_COPY_SITES.get(site)?.count !== count);
    const stale = [...ALLOWED_VISIBLE_COPY_SITES].filter(([site, exception]) => observed.get(site) !== exception.count);

    expect(
      unexpected,
      `unreviewed visible strings (translate the copy or add a narrow reviewed exception):\n${unexpected
        .map(([site, count]) => `${site} (${count})`)
        .join("\n")}`,
    ).toEqual([]);
    expect(
      stale,
      `stale visible-copy exceptions:\n${stale
        .map(([site, exception]) => `${site} (${exception.count}): ${exception.reason}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("detects visible JSX, text-bearing props, conditional copy, object labels, and prop defaults", () => {
    const found = visibleCopySitesInSource(
      `const Component = ({placeholder = "Select..."}) => (
        <div aria-label="Close" title={"Title"}>
          Loading...
          {ready ? "Ready" : "Waiting"}
          {complete && "Done"}
          {items.map(() => ({label: "Bold", "aria-label": "Action"}))}
        </div>
      );`,
      "fixture.tsx",
    );

    expect(found).toEqual([
      'fixture.tsx :: default-placeholder :: "Select..."',
      'fixture.tsx :: jsx-aria-label :: "Close"',
      'fixture.tsx :: jsx-title :: "Title"',
      'fixture.tsx :: jsx-text :: "Loading..."',
      'fixture.tsx :: jsx-conditional :: "Ready"',
      'fixture.tsx :: jsx-conditional :: "Waiting"',
      'fixture.tsx :: jsx-logical :: "Done"',
      'fixture.tsx :: property-label :: "Bold"',
      'fixture.tsx :: property-aria-label :: "Action"',
    ]);
  });

  it.skipIf(!ENFORCED)("does not mutate Zod's process-global locale in production", () => {
    const found = scannedFiles().flatMap((path) => {
      const repoPath = relative(REPO_ROOT, path);
      if (!isProductionSource(repoPath)) return [];
      const source = readFileSync(path, "utf8");
      return source.includes("z.config(") ? [repoPath] : [];
    });

    expect(found, `request-localized validation must pass a parse context, not call z.config():\n${found.join("\n")}`).toEqual(
      [],
    );
  });

  it.skipIf(!ENFORCED)("does not create customer-facing Zod errors from raw source literals", () => {
    const found = literalCreateZodErrorSites();
    expect(
      found,
      `raw createZodError messages (translate them and retain a CustomErrorCode):\n${found.join("\n")}`,
    ).toEqual([]);
  });

  it("detects string and template literals passed directly to createZodError", () => {
    expect(
      literalCreateZodErrorSitesInSource(
        'createZodError("Thread not found"); createZodError(`Missing ${id}`); createZodError(t("Common.errors.generic"));',
        "fixture.ts",
      ),
    ).toHaveLength(2);
  });

  it.skipIf(!ENFORCED)("binds each locale consumer to its own domain", () => {
    const problems: string[] = [];

    for (const { file, imports } of DOMAIN_EXPECTATIONS) {
      const source = readFileSync(join(REPO_ROOT, file), "utf8");
      if (!source.includes(imports)) problems.push(`${file} should derive its locales from ${imports}`);
    }

    expect(problems, `locale consumers bound to the wrong domain:\n${problems.join("\n")}`).toEqual([]);
  });
});
