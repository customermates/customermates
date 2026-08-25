import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";
import { REPO_ROOT, walkFiles } from "./walk";

const ENFORCED = true;

const SPEC_EXEMPT_PATHS = new Set(["/v1/mcp", "/v1/openapi"]);
const HTTP_VERBS = new Set(["get", "post", "put", "patch", "delete"]);
const HTTP_HANDLER_NAMES = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const BODY_VERBS = new Set(["post", "put", "patch"]);
const BODY_READER_METHODS = new Set(["arrayBuffer", "blob", "bytes", "formData", "json", "text"]);
const BODY_REQUIRED_DELETE_PATHS = new Set([
  "/v1/contacts/many",
  "/v1/deals/many",
  "/v1/organizations/many",
  "/v1/services/many",
  "/v1/tasks/many",
]);

type JsonReader = {
  line: number;
  mapped: boolean;
};

type InspectionError = {
  line: number;
  message: string;
};

type RouteOperation = {
  file: string;
  importsMapper: boolean;
  jsonReaders: JsonReader[];
  inspectionErrors: InspectionError[];
};

type SpecOperation = {
  requestBody?: {
    required?: boolean;
    content?: Record<string, unknown>;
  };
};

function toSpecPath(routeFile: string): string {
  return routeFile
    .slice(join(REPO_ROOT, "app", "api").length)
    .replace(/\/route\.ts$/, "")
    .replace(/\[([^\]]+)\]/g, "{$1}");
}

function isExported(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    Boolean(ts.getModifiers(node)?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword))
  );
}

function importsRequestJsonMapper(source: ts.SourceFile): boolean {
  return source.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return false;
    if (statement.moduleSpecifier.text !== "@/core/api/request-json-error") return false;

    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) return false;

    return bindings.elements.some(
      ({ name, propertyName }) =>
        name.text === "mapRequestJsonError" && (propertyName?.text ?? name.text) === "mapRequestJsonError",
    );
  });
}

function bindingContainsName(binding: ts.BindingName, name: string): boolean {
  if (ts.isIdentifier(binding)) return binding.text === name;
  return binding.elements.some(
    (element) => !ts.isOmittedExpression(element) && bindingContainsName(element.name, name),
  );
}

function bindingIdentifiers(binding: ts.BindingName): ts.Identifier[] {
  if (ts.isIdentifier(binding)) return [binding];
  return binding.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : bindingIdentifiers(element.name),
  );
}

function zeroArgumentMethodCall(node: ts.Node):
  | {
      call: ts.CallExpression;
      method: string;
      receiver: ts.Expression;
      canonicalPropertyAccess: boolean;
    }
  | undefined {
  if (!ts.isCallExpression(node) || node.arguments.length !== 0) return undefined;
  if (ts.isPropertyAccessExpression(node.expression)) {
    return {
      call: node,
      method: node.expression.name.text,
      receiver: node.expression.expression,
      canonicalPropertyAccess: node.expression.questionDotToken === undefined,
    };
  }
  if (
    ts.isElementAccessExpression(node.expression) &&
    node.expression.argumentExpression &&
    ts.isStringLiteral(node.expression.argumentExpression)
  ) {
    return {
      call: node,
      method: node.expression.argumentExpression.text,
      receiver: node.expression.expression,
      canonicalPropertyAccess: false,
    };
  }
  return undefined;
}

function hasMappedParserFailure(call: ts.CallExpression): boolean {
  const catchAccess = call.parent;
  if (
    !ts.isPropertyAccessExpression(catchAccess) ||
    catchAccess.expression !== call ||
    catchAccess.name.text !== "catch"
  )
    return false;

  const catchCall = catchAccess.parent;
  if (!ts.isCallExpression(catchCall) || catchCall.expression !== catchAccess || catchCall.arguments.length !== 1)
    return false;

  const mapper = catchCall.arguments[0];
  if (!ts.isIdentifier(mapper) || mapper.text !== "mapRequestJsonError") return false;

  return ts.isAwaitExpression(catchCall.parent) && catchCall.parent.expression === catchCall;
}

function analyzeJsonReaders(
  source: ts.SourceFile,
  body: ts.ConciseBody | undefined,
  parameters: ts.NodeArray<ts.ParameterDeclaration>,
): { readers: JsonReader[]; inspectionErrors: InspectionError[] } {
  if (!body) return { readers: [], inspectionErrors: [] };
  const requestParameter = parameters[0]?.name;
  if (!requestParameter || !ts.isIdentifier(requestParameter)) return { readers: [], inspectionErrors: [] };

  const readers: JsonReader[] = [];
  const inspectionErrors: InspectionError[] = [];
  const visit = (node: ts.Node) => {
    if (node !== body && ts.isFunctionLike(node)) return;
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    if (ts.isVariableDeclaration(node) && bindingContainsName(node.name, requestParameter.text)) {
      inspectionErrors.push({
        line,
        message: `must not shadow the handler request parameter '${requestParameter.text}'`,
      });
    }

    const methodCall = zeroArgumentMethodCall(node);
    if (methodCall && BODY_READER_METHODS.has(methodCall.method)) {
      const isCanonicalRequestJson =
        methodCall.method === "json" &&
        methodCall.canonicalPropertyAccess &&
        ts.isIdentifier(methodCall.receiver) &&
        methodCall.receiver.text === requestParameter.text;
      if (!isCanonicalRequestJson) {
        inspectionErrors.push({
          line,
          message: `must read request JSON only as ${requestParameter.text}.json().catch(mapRequestJsonError)`,
        });
      } else {
        readers.push({
          line,
          mapped: hasMappedParserFailure(methodCall.call),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return { readers, inspectionErrors };
}

function routeOperations(): Map<string, RouteOperation> {
  const operations = new Map<string, RouteOperation>();
  const routeFiles = walkFiles(join(REPO_ROOT, "app", "api", "v1"), (path) => path.endsWith("/route.ts"));

  for (const path of routeFiles) {
    const specPath = toSpecPath(path);
    if (SPEC_EXEMPT_PATHS.has(specPath)) continue;

    const text = readFileSync(path, "utf8");
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const file = path.slice(REPO_ROOT.length + 1);
    const importsMapper = importsRequestJsonMapper(source);
    const setOperation = (name: string, operation: RouteOperation) => {
      if (HTTP_HANDLER_NAMES.has(name)) operations.set(`${name.toLowerCase()} ${specPath}`, operation);
    };
    const register = (
      name: string,
      parameters: ts.NodeArray<ts.ParameterDeclaration>,
      body: ts.ConciseBody | undefined,
    ) => {
      const analysis = analyzeJsonReaders(source, body, parameters);
      setOperation(name, {
        file,
        importsMapper,
        jsonReaders: analysis.readers,
        inspectionErrors: analysis.inspectionErrors,
      });
    };
    const registerUnsupported = (name: string, node: ts.Node) => {
      setOperation(name, {
        file,
        importsMapper,
        jsonReaders: [],
        inspectionErrors: [
          {
            line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
            message: `must export ${name} as a direct function, function expression, or arrow function`,
          },
        ],
      });
    };

    for (const statement of source.statements) {
      if (ts.isFunctionDeclaration(statement) && isExported(statement) && statement.name) {
        if (statement.body) register(statement.name.text, statement.parameters, statement.body);
        else registerUnsupported(statement.name.text, statement);
        continue;
      }
      if (ts.isVariableStatement(statement) && isExported(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name)) {
            for (const identifier of bindingIdentifiers(declaration.name)) {
              registerUnsupported(identifier.text, identifier);
            }
            continue;
          }
          const initializer = declaration.initializer;
          if (initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))) {
            register(declaration.name.text, initializer.parameters, initializer.body);
          } else {
            registerUnsupported(declaration.name.text, declaration);
          }
        }
        continue;
      }
      if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) registerUnsupported(element.name.text, element);
      } else if (
        ts.isExportDeclaration(statement) &&
        statement.exportClause &&
        ts.isNamespaceExport(statement.exportClause)
      ) {
        registerUnsupported(statement.exportClause.name.text, statement.exportClause);
      } else if (ts.isExportDeclaration(statement) && !statement.exportClause) {
        throw new Error(
          `${file}:${source.getLineAndCharacterOfPosition(statement.getStart(source)).line + 1} uses export *`,
        );
      }
    }
  }

  return operations;
}

function specOperations(): Map<string, SpecOperation> {
  const spec = generateOpenApiSpec() as {
    paths?: Record<string, Record<string, SpecOperation>>;
  };
  const operations = new Map<string, SpecOperation>();
  for (const [path, entry] of Object.entries(spec.paths ?? {})) {
    for (const [verb, operation] of Object.entries(entry)) {
      if (HTTP_VERBS.has(verb)) operations.set(`${verb} ${path}`, operation);
    }
  }
  return operations;
}

function hasJsonRequestBody(operation: SpecOperation | undefined): boolean {
  return operation?.requestBody?.content?.["application/json"] !== undefined;
}

describe("v1 REST OpenAPI coverage", () => {
  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("documents every route handler in the OpenAPI spec", () => {
    const documented = specOperations();
    const undocumented = [...routeOperations()]
      .filter(([operation]) => !documented.has(operation))
      .map(([operation, { file }]) => `${operation} (${file}) has no operation in generateOpenApiSpec()`);
    expect(undocumented).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("has a route handler for every spec operation", () => {
    const routes = routeOperations();
    const orphaned = [...specOperations()]
      .filter(([operation]) => !routes.has(operation))
      .map(([operation]) => `${operation} is in generateOpenApiSpec() but has no route handler under app/api/v1`);
    expect(orphaned).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("documents a requestBody for every write-verb operation", () => {
    const spec = generateOpenApiSpec() as {
      paths?: Record<string, Record<string, { requestBody?: unknown }>>;
    };
    const missing: string[] = [];
    for (const [path, entry] of Object.entries(spec.paths ?? {})) {
      for (const [verb, operation] of Object.entries(entry)) {
        if (BODY_VERBS.has(verb) && operation.requestBody === undefined) {
          missing.push(`${verb} ${path} has no requestBody in generateOpenApiSpec()`);
        }
      }
    }
    for (const path of BODY_REQUIRED_DELETE_PATHS) {
      if (spec.paths?.[path]?.delete?.requestBody === undefined) {
        missing.push(`delete ${path} has no requestBody in generateOpenApiSpec()`);
      }
    }
    expect(missing).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "keeps REST JSON parsing and required OpenAPI bodies aligned",
    () => {
      const routes = routeOperations();
      const documented = specOperations();
      const violations: string[] = [];

      for (const [operation, spec] of documented) {
        if (!hasJsonRequestBody(spec)) continue;
        if (spec.requestBody?.required !== true) {
          violations.push(`${operation} must declare its JSON requestBody as required`);
        }

        const route = routes.get(operation);
        if (route && route.jsonReaders.length !== 1) {
          violations.push(
            `${operation} (${route.file}) must read its documented JSON body exactly once; found ${route.jsonReaders.length}`,
          );
        }
      }

      for (const [operation, route] of routes) {
        const spec = documented.get(operation);
        for (const inspectionError of route.inspectionErrors) {
          violations.push(`${operation} (${route.file}:${inspectionError.line}) ${inspectionError.message}`);
        }
        if (route.jsonReaders.length > 0 && !hasJsonRequestBody(spec)) {
          violations.push(`${operation} (${route.file}) reads JSON without an OpenAPI application/json requestBody`);
        }
        if (route.jsonReaders.length > 0 && !route.importsMapper) {
          violations.push(`${operation} (${route.file}) must import mapRequestJsonError from the shared API boundary`);
        }
        for (const reader of route.jsonReaders) {
          if (!reader.mapped) {
            violations.push(
              `${operation} (${route.file}:${reader.line}) must await request.json().catch(mapRequestJsonError)`,
            );
          }
        }
      }

      expect(violations, violations.join("\n")).toEqual([]);
    },
  );
});
