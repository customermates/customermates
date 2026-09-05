import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

import {
  GROUPABLE_DATE_FIELDS,
  GROUPING_ENUM,
  GROUPING_JOIN,
  OPERATOR_GROUPABLE_MODELS,
  type GroupableModel,
} from "@/core/base/grouping/groupable-field";
import { FILTER_FIELD_TERMINOLOGY } from "@/features/entity-terminology/entity-terminology.constants";
import { ROUTING_LOCALES } from "@/i18n/locale-registry";

const DECLARATION_METHOD = "getGroupableFields";
const RELATION_FACTORY = "relationGroupables";
const ENUM_FACTORY = "enumGroupables";
const DATE_FACTORY = "dateGroupables";
const FACTORIES = new Set([RELATION_FACTORY, ENUM_FACTORY, DATE_FACTORY, "customSelectGroupables"]);
const DATE_FIELDS = ["createdAt", "updatedAt"];

type WiredEnum = { values: readonly string[]; valueLabelKey: (value: string) => string };

type Claim = { name: string; value: string };

type Declaration = {
  file: string;
  model: string;
  claims: Record<string, Claim[]>;
  literalKinds: string[];
  filterableFields: string[];
  unknownCalls: string[];
};

function claimNames(claims: Claim[] | undefined): string[] {
  return (claims ?? []).map(({ name }) => name).sort();
}

function sourceFiles(): string[] {
  return walkFiles(REPO_ROOT, (path) => /prisma-[a-z-]+\.repository\.ts$/.test(path)).filter(
    (path) => !path.includes("__tests__"),
  );
}

function parse(path: string): ts.SourceFile {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
}

function findMethod(source: ts.SourceFile, name: string): ts.MethodDeclaration | undefined {
  let found: ts.MethodDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) found = node;
    ts.forEachChild(node, visit);
  };
  visit(source);

  return found;
}

function propertyAccessNames(node: ts.Node, object: string): string[] {
  const names: string[] = [];
  const visit = (child: ts.Node) => {
    if (ts.isPropertyAccessExpression(child) && ts.isIdentifier(child.expression) && child.expression.text === object)
      names.push(child.name.text);
    ts.forEachChild(child, visit);
  };
  visit(node);

  return names;
}

function readDeclaration(path: string): Declaration | undefined {
  const source = parse(path);
  const method = findMethod(source, DECLARATION_METHOD);
  if (!method?.body) return undefined;

  const declaration: Declaration = {
    file: relative(REPO_ROOT, path),
    model: "",
    claims: {},
    literalKinds: [],
    filterableFields: propertyAccessNames(findMethod(source, "getFilterableFields") ?? source, "FilterFieldKey"),
    unknownCalls: [],
  };

  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node))
      for (const property of node.properties)
        if (ts.isPropertyAssignment(property) && property.name.getText() === "kind")
          declaration.literalKinds.push(property.initializer.getText());

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const called = node.expression.text;
      if (called.endsWith("Groupable") || called.endsWith("Groupables")) {
        if (!FACTORIES.has(called)) declaration.unknownCalls.push(called);
        const [first, second] = node.arguments;
        if (first && ts.isStringLiteral(first)) declaration.model = first.text;
        if (second && ts.isObjectLiteralExpression(second))
          declaration.claims[called] = second.properties.flatMap((property) =>
            ts.isPropertyAssignment(property)
              ? [{ name: property.name.getText(), value: property.initializer.getText() }]
              : [],
          );
        else if (called !== "customSelectGroupables") declaration.claims[called] = [];
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(method.body);

  return declaration;
}

function localeCatalog(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(REPO_ROOT, "i18n", "locales", `${locale}.json`), "utf8")) as Record<
    string,
    unknown
  >;
}

function resolvesInEveryBundle(key: string): boolean {
  return [...ROUTING_LOCALES].every((locale) => {
    let cursor: unknown = localeCatalog(locale);
    for (const segment of key.split(".")) {
      if (typeof cursor !== "object" || cursor === null) return false;
      cursor = (cursor as Record<string, unknown>)[segment];
    }

    return typeof cursor === "string";
  });
}

const declarations = sourceFiles().flatMap((path) => {
  const declaration = readDeclaration(path);

  return declaration ? [declaration] : [];
});

describe("groupable field declarations", () => {
  it("declares grouping on exactly the wired models: the five entity surfaces and the three operator lists", () => {
    expect(declarations.map(({ model }) => model).sort()).toEqual(Object.keys(GROUPING_JOIN).sort());
  });

  it("declares the operator models only from operator repositories, through the enum and date factories", () => {
    const operatorModels = new Set<string>(OPERATOR_GROUPABLE_MODELS);
    const operatorDeclarations = declarations.filter(({ model }) => operatorModels.has(model));

    expect(operatorDeclarations.map(({ model }) => model).sort()).toEqual([...OPERATOR_GROUPABLE_MODELS].sort());
    for (const { file, model, claims } of operatorDeclarations) {
      expect([file, file.startsWith("ee/operator/")]).toEqual([file, true]);
      expect([file, Object.keys(claims).sort()]).toEqual([file, [DATE_FACTORY, ENUM_FACTORY].sort()]);
      expect([file, Object.keys(GROUPING_JOIN[model as GroupableModel])]).toEqual([file, []]);
    }
  });

  it("builds every spec through a factory, never through an object literal carrying a kind", () => {
    for (const { file, literalKinds, unknownCalls } of declarations) {
      expect([file, literalKinds]).toEqual([file, []]);
      expect([file, unknownCalls]).toEqual([file, []]);
    }
  });

  it("claims every wired relation, every wired enum and both date columns for its model", () => {
    for (const { file, model, claims } of declarations) {
      const wiredRelations = Object.keys(GROUPING_JOIN[model as GroupableModel]).sort();
      const wiredEnums = Object.keys(GROUPING_ENUM[model as GroupableModel]).sort();

      expect([file, claimNames(claims[RELATION_FACTORY])]).toEqual([file, wiredRelations]);
      expect([file, claimNames(claims[ENUM_FACTORY])]).toEqual([file, wiredEnums]);
      expect([file, claimNames(claims[DATE_FACTORY])]).toEqual([file, DATE_FIELDS]);
    }
  });

  it("keeps every relation it can group by filterable on the same repository", () => {
    for (const { file, claims, filterableFields } of declarations)
      for (const field of claimNames(claims[RELATION_FACTORY]))
        expect([file, field, filterableFields.includes(field)]).toEqual([file, field, true]);
  });

  it("labels every relation and date groupable through terminology or a leaf that exists in all bundles", () => {
    const fields = [
      ...new Set([...Object.values(GROUPING_JOIN).flatMap((wiring) => Object.keys(wiring)), ...GROUPABLE_DATE_FIELDS]),
    ];

    for (const field of fields)
      expect([field, Boolean(FILTER_FIELD_TERMINOLOGY[field]) || resolvesInEveryBundle(`Common.filters.fields.${field}`)]).toEqual(
        [field, true],
      );
  });

  it("resolves every wired enum label and every claimed enum value label in all bundles", () => {
    for (const [model, enums] of Object.entries(GROUPING_ENUM))
      for (const [field, wiring] of Object.entries(enums))
        expect([model, field, resolvesInEveryBundle(wiring.labelKey)]).toEqual([model, field, true]);

    for (const { file, model, claims } of declarations)
      for (const { name, value: claimed } of claims[ENUM_FACTORY] ?? []) {
        if (claimed === "false") continue;

        const enums = GROUPING_ENUM[model as GroupableModel] as Record<string, WiredEnum>;

        for (const value of enums[name].values)
          expect([file, value, resolvesInEveryBundle(enums[name].valueLabelKey(value))]).toEqual([file, value, true]);
      }
  });
});
