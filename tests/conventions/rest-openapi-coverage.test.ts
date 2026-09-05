import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";
import { REPO_ROOT, walkFiles } from "./walk";

const ENFORCED = true;

const SPEC_EXEMPT_PATHS = new Set(["/v1/mcp", "/v1/openapi"]);
const HTTP_VERBS = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);
const HTTP_HANDLER_NAMES = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const SCHEMA_PARSE_METHOD_NAMES = new Set(["parse", "safeParse", "parseAsync", "safeParseAsync"]);
const NATIVE_PARSE_RECEIVER_NAMES = new Set(["JSON", "Date", "URL"]);
const ROUTE_MODULE_PATTERN = /\/route\.(?:js|jsx|ts|tsx)$/;
const BODY_VERBS = new Set(["post", "put", "patch"]);
const SAFE_REQUEST_METADATA_MEMBERS = new Set([
  "bodyUsed",
  "cache",
  "cookies",
  "credentials",
  "destination",
  "duplex",
  "geo",
  "headers",
  "integrity",
  "ip",
  "keepalive",
  "method",
  "mode",
  "nextUrl",
  "redirect",
  "referrer",
  "referrerPolicy",
  "signal",
  "url",
]);
const BODY_REQUIRED_DELETE_PATHS = new Set([
  "/v1/contacts/many",
  "/v1/deals/many",
  "/v1/organizations/many",
  "/v1/services/many",
  "/v1/tasks/many",
]);

type JsonReader = {
  line: number;
};

type InspectionError = {
  line: number;
  message: string;
};

type RouteOperation = {
  file: string;
  hasExactHandleErrorImport: boolean;
  hasExactMapperImport: boolean;
  jsonReaders: JsonReader[];
  inspectionErrors: InspectionError[];
};

type SpecOperation = {
  requestBody?: {
    required?: boolean;
    content?: Record<string, unknown>;
  };
  responses?: Record<
    string,
    {
      content?: Record<string, unknown>;
    }
  >;
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

function isDefaultExported(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    Boolean(ts.getModifiers(node)?.some(({ kind }) => kind === ts.SyntaxKind.DefaultKeyword))
  );
}

function hasExactValueImport(source: ts.SourceFile, moduleName: string, importedName: string): boolean {
  const matchingSpecifiers = source.statements.flatMap((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== moduleName ||
      !statement.importClause ||
      statement.importClause.isTypeOnly ||
      !statement.importClause.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      return [];
    }
    return statement.importClause.namedBindings.elements.filter(
      (specifier) => !specifier.isTypeOnly && !specifier.propertyName && specifier.name.text === importedName,
    );
  });
  return matchingSpecifiers.length === 1;
}

function bindingIdentifiers(binding: ts.BindingName): ts.Identifier[] {
  if (ts.isIdentifier(binding)) return [binding];
  return binding.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : bindingIdentifiers(element.name),
  );
}

type JsonParserBoundary = {
  line: number;
  requestReceiver: ts.Identifier;
  mapper: ts.Identifier;
};

type ErrorBoundary = {
  handler: ts.Identifier;
};

function exactErrorBoundary(statement: ts.TryStatement): ErrorBoundary | undefined {
  if (statement.finallyBlock || !statement.catchClause) return undefined;

  const caughtError = statement.catchClause.variableDeclaration?.name;
  const [catchStatement] = statement.catchClause.block.statements;
  if (
    !caughtError ||
    !ts.isIdentifier(caughtError) ||
    statement.catchClause.block.statements.length !== 1 ||
    !ts.isReturnStatement(catchStatement) ||
    !catchStatement.expression ||
    !ts.isCallExpression(catchStatement.expression)
  ) {
    return undefined;
  }

  const handlerCall = catchStatement.expression;
  if (
    handlerCall.questionDotToken ||
    handlerCall.typeArguments?.length ||
    handlerCall.arguments.length !== 1 ||
    !ts.isIdentifier(handlerCall.expression) ||
    handlerCall.expression.text !== "handleError"
  ) {
    return undefined;
  }

  const [argument] = handlerCall.arguments;
  if (!ts.isIdentifier(argument) || argument.text !== caughtError.text) return undefined;

  return { handler: handlerCall.expression };
}

function exactJsonParserBoundary(
  source: ts.SourceFile,
  statement: ts.Statement,
  requestParameter: ts.Identifier,
): JsonParserBoundary | undefined {
  if (!ts.isVariableStatement(statement)) return undefined;
  const declarationList = statement.declarationList;
  if (!(declarationList.flags & ts.NodeFlags.Const) || declarationList.declarations.length !== 1) return undefined;

  const [declaration] = declarationList.declarations;
  if (
    !ts.isIdentifier(declaration.name) ||
    !declaration.initializer ||
    !ts.isAwaitExpression(declaration.initializer)
  ) {
    return undefined;
  }

  const catchCall = declaration.initializer.expression;
  if (
    !ts.isCallExpression(catchCall) ||
    catchCall.questionDotToken ||
    catchCall.typeArguments?.length ||
    catchCall.arguments.length !== 1
  ) {
    return undefined;
  }

  const catchAccess = catchCall.expression;
  if (
    !ts.isPropertyAccessExpression(catchAccess) ||
    catchAccess.questionDotToken ||
    catchAccess.name.text !== "catch" ||
    !ts.isCallExpression(catchAccess.expression)
  ) {
    return undefined;
  }

  const mapper = catchCall.arguments[0];
  if (!ts.isIdentifier(mapper) || mapper.text !== "mapRequestJsonError") return undefined;

  const jsonCall = catchAccess.expression;
  if (
    jsonCall.questionDotToken ||
    jsonCall.typeArguments?.length ||
    jsonCall.arguments.length !== 0 ||
    !ts.isPropertyAccessExpression(jsonCall.expression)
  ) {
    return undefined;
  }

  const jsonAccess = jsonCall.expression;
  if (
    jsonAccess.questionDotToken ||
    jsonAccess.name.text !== "json" ||
    !ts.isIdentifier(jsonAccess.expression) ||
    jsonAccess.expression.text !== requestParameter.text
  ) {
    return undefined;
  }

  return {
    line: lineOf(source, statement),
    requestReceiver: jsonAccess.expression,
    mapper,
  };
}

function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function identifierLines(
  source: ts.SourceFile,
  body: ts.ConciseBody,
  name: string,
  allowed: ReadonlySet<ts.Identifier>,
): number[] {
  const lines: number[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && node.text === name && !allowed.has(node) && !isPropertyName(node)) {
      lines.push(lineOf(source, node));
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return lines;
}

function isPropertyName(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === identifier) ||
    (ts.isPropertyAssignment(parent) && parent.name === identifier) ||
    (ts.isBindingElement(parent) && parent.propertyName === identifier) ||
    (ts.isMethodDeclaration(parent) && parent.name === identifier) ||
    (ts.isMethodSignature(parent) && parent.name === identifier) ||
    (ts.isPropertyDeclaration(parent) && parent.name === identifier) ||
    (ts.isPropertySignature(parent) && parent.name === identifier)
  );
}

function unsafeRequestIdentifierLines(
  source: ts.SourceFile,
  body: ts.Block,
  name: string,
  allowed: ReadonlySet<ts.Identifier>,
): number[] {
  const lines: number[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && node.text === name && !allowed.has(node) && !isPropertyName(node)) {
      const parent = node.parent;
      const safePropertyAccess =
        ts.isPropertyAccessExpression(parent) &&
        parent.expression === node &&
        SAFE_REQUEST_METADATA_MEMBERS.has(parent.name.text);
      const safeElementAccess =
        ts.isElementAccessExpression(parent) &&
        parent.expression === node &&
        parent.argumentExpression &&
        (ts.isStringLiteral(parent.argumentExpression) ||
          ts.isNoSubstitutionTemplateLiteral(parent.argumentExpression)) &&
        SAFE_REQUEST_METADATA_MEMBERS.has(parent.argumentExpression.text);
      if (!safePropertyAccess && !safeElementAccess) lines.push(lineOf(source, node));
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return lines;
}

function analyzeJsonReaders(
  source: ts.SourceFile,
  body: ts.Block,
  parameters: ts.NodeArray<ts.ParameterDeclaration>,
): { readers: JsonReader[]; inspectionErrors: InspectionError[] } {
  const readers: JsonReader[] = [];
  const inspectionErrors: InspectionError[] = [];
  const firstParameter = parameters[0];
  const requestParameter = firstParameter?.name;
  const validRequestParameter =
    firstParameter &&
    ts.isIdentifier(requestParameter) &&
    !firstParameter.dotDotDotToken &&
    !firstParameter.questionToken &&
    !firstParameter.initializer;
  if (!firstParameter) return { readers, inspectionErrors };
  if (!validRequestParameter) {
    return {
      readers,
      inspectionErrors: [
        {
          line: lineOf(source, firstParameter),
          message: "must declare the request as a plain first parameter",
        },
      ],
    };
  }

  const allowedMapperIdentifiers = new Set<ts.Identifier>();
  const allowedRequestIdentifiers = new Set<ts.Identifier>();
  const allowedErrorHandlerIdentifiers = new Set<ts.Identifier>();
  if (parameters.length > 2) {
    inspectionErrors.push({
      line: lineOf(source, parameters[2]),
      message: "must declare at most the request and route context parameters",
    });
  }
  const contextParameter = parameters[1];
  const contextBinding = contextParameter?.name;
  const contextElement =
    contextBinding && ts.isObjectBindingPattern(contextBinding) ? contextBinding.elements[0] : undefined;
  if (
    contextParameter &&
    (contextParameter.dotDotDotToken ||
      contextParameter.questionToken ||
      contextParameter.initializer ||
      !contextBinding ||
      !ts.isObjectBindingPattern(contextBinding) ||
      contextBinding.elements.length !== 1 ||
      !contextElement ||
      contextElement.dotDotDotToken ||
      contextElement.propertyName ||
      contextElement.initializer ||
      !ts.isIdentifier(contextElement.name) ||
      contextElement.name.text !== "params")
  ) {
    inspectionErrors.push({
      line: lineOf(source, contextParameter),
      message: "must declare route context exactly as a non-defaulted { params } binding",
    });
  }
  const [onlyStatement] = body.statements;
  const outerTryCandidate =
    body.statements.length === 1 && ts.isTryStatement(onlyStatement) ? onlyStatement : undefined;
  const errorBoundary = outerTryCandidate ? exactErrorBoundary(outerTryCandidate) : undefined;
  const outerTry = errorBoundary ? outerTryCandidate : undefined;

  if (errorBoundary) allowedErrorHandlerIdentifiers.add(errorBoundary.handler);

  if (outerTry?.catchClause) {
    for (const [index, statement] of outerTry.tryBlock.statements.entries()) {
      const boundary = exactJsonParserBoundary(source, statement, requestParameter);
      if (!boundary) continue;

      const hasOnlyStraightLineDeclarationsBefore = outerTry.tryBlock.statements
        .slice(0, index)
        .every(ts.isVariableStatement);
      if (!hasOnlyStraightLineDeclarationsBefore) continue;

      readers.push({ line: boundary.line });
      allowedRequestIdentifiers.add(boundary.requestReceiver);
      allowedMapperIdentifiers.add(boundary.mapper);
    }
  }

  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && node.text === "arguments" && !isPropertyName(node)) {
      inspectionErrors.push({
        line: lineOf(source, node),
        message: "must not access the handler request through arguments",
      });
    }
    if (ts.isIdentifier(node) && node.text === "eval" && !isPropertyName(node)) {
      inspectionErrors.push({
        line: lineOf(source, node),
        message: "must not access the handler request through eval",
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(body);

  for (const line of unsafeRequestIdentifierLines(source, body, requestParameter.text, allowedRequestIdentifiers)) {
    inspectionErrors.push({
      line,
      message: `must not alias '${requestParameter.text}' or access its body outside the one canonical JSON parser`,
    });
  }
  for (const line of identifierLines(source, body, "mapRequestJsonError", allowedMapperIdentifiers)) {
    inspectionErrors.push({
      line,
      message: "must use the imported mapRequestJsonError without shadowing or aliases",
    });
  }
  for (const line of identifierLines(source, body, "handleError", allowedErrorHandlerIdentifiers)) {
    inspectionErrors.push({
      line,
      message: "must return the imported handleError(error) from the outer catch",
    });
  }
  for (const parameter of parameters.slice(1)) {
    for (const identifier of bindingIdentifiers(parameter.name)) {
      if (identifier.text === requestParameter.text) {
        inspectionErrors.push({
          line: lineOf(source, identifier),
          message: `must not shadow the handler request parameter '${requestParameter.text}'`,
        });
      }
      if (identifier.text === "mapRequestJsonError") {
        inspectionErrors.push({
          line: lineOf(source, identifier),
          message: "must not shadow mapRequestJsonError with another handler parameter",
        });
      }
      if (identifier.text === "handleError") {
        inspectionErrors.push({
          line: lineOf(source, identifier),
          message: "must not shadow handleError with another handler parameter",
        });
      }
    }
  }
  if (requestParameter.text === "mapRequestJsonError") {
    inspectionErrors.push({
      line: lineOf(source, requestParameter),
      message: "must not shadow mapRequestJsonError with the handler request parameter",
    });
  }
  if (requestParameter.text === "handleError") {
    inspectionErrors.push({
      line: lineOf(source, requestParameter),
      message: "must not shadow handleError with the handler request parameter",
    });
  }

  return { readers, inspectionErrors };
}

function inspectRouteSource(path: string, text: string): Map<string, RouteOperation> {
  const operations = new Map<string, RouteOperation>();
  const allowedHandlerDeclarations = new Set<ts.Identifier>();
  const specPath = toSpecPath(path);
  if (SPEC_EXEMPT_PATHS.has(specPath)) return operations;

  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const file = path.slice(REPO_ROOT.length + 1);
  const hasExactHandleErrorImport = hasExactValueImport(source, "@/core/api/interactor-handler", "handleError");
  const hasExactMapperImport = hasExactValueImport(source, "@/core/api/request-json-error", "mapRequestJsonError");
  const setOperation = (name: string, node: ts.Node, operation: RouteOperation) => {
    if (!HTTP_HANDLER_NAMES.has(name)) return;
    const key = `${name.toLowerCase()} ${specPath}`;
    const existing = operations.get(key);
    if (existing) {
      existing.inspectionErrors.push({
        line: lineOf(source, node),
        message: `must declare ${name} exactly once`,
      });
      return;
    }
    operations.set(key, operation);
  };
  const register = (statement: ts.FunctionDeclaration & { name: ts.Identifier; body: ts.Block }) => {
    const name = statement.name.text;
    allowedHandlerDeclarations.add(statement.name);
    const analysis = analyzeJsonReaders(source, statement.body, statement.parameters);
    setOperation(name, statement, {
      file,
      hasExactHandleErrorImport,
      hasExactMapperImport,
      jsonReaders: analysis.readers,
      inspectionErrors: analysis.inspectionErrors,
    });
  };
  const registerUnsupported = (name: string, node: ts.Node, message?: string) => {
    setOperation(name, node, {
      file,
      hasExactHandleErrorImport,
      hasExactMapperImport,
      jsonReaders: [],
      inspectionErrors: [
        {
          line: lineOf(source, node),
          message: message ?? `must export ${name} as a direct named function declaration`,
        },
      ],
    });
  };

  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && isExported(statement) && statement.name) {
      if (isDefaultExported(statement) || statement.asteriskToken || !statement.body) {
        registerUnsupported(statement.name.text, statement);
      } else {
        register(
          statement as ts.FunctionDeclaration & {
            name: ts.Identifier;
            body: ts.Block;
          },
        );
      }
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
        registerUnsupported(declaration.name.text, declaration);
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
      throw new Error(`${file}:${lineOf(source, statement)} uses export *`);
    }
  }

  const addSourceError = (name: string | undefined, node: ts.Node, message: string) => {
    const matchingOperation = name ? operations.get(`${name.toLowerCase()} ${specPath}`) : undefined;
    const targets = matchingOperation ? [matchingOperation] : [...operations.values()];
    if (targets.length === 0) throw new Error(`${file}:${lineOf(source, node)} ${message}`);
    for (const operation of targets) {
      operation.inspectionErrors.push({ line: lineOf(source, node), message });
    }
  };
  const auditSource = (node: ts.Node) => {
    if (
      ts.isIdentifier(node) &&
      HTTP_HANDLER_NAMES.has(node.text) &&
      !allowedHandlerDeclarations.has(node) &&
      !isPropertyName(node)
    ) {
      addSourceError(
        node.text,
        node,
        `must not reference or replace the exported ${node.text} handler outside its declaration`,
      );
    }
    if (ts.isIdentifier(node) && node.text === "eval" && !isPropertyName(node)) {
      addSourceError(undefined, node, "must not use eval in a REST route module");
    }
    const accessedMember = ts.isPropertyAccessExpression(node)
      ? node.name.text
      : ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression)
        ? node.argumentExpression.text
        : undefined;
    const accessedReceiver =
      ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) ? node.expression : undefined;
    const isNativeParse =
      accessedMember === "parse" &&
      accessedReceiver &&
      ts.isIdentifier(accessedReceiver) &&
      NATIVE_PARSE_RECEIVER_NAMES.has(accessedReceiver.text);
    if (accessedMember && SCHEMA_PARSE_METHOD_NAMES.has(accessedMember) && !isNativeParse) {
      addSourceError(undefined, node, "must keep schema parsing in interactors, not REST route modules");
    }
    ts.forEachChild(node, auditSource);
  };
  auditSource(source);

  return operations;
}

function inspectRouteModule(path: string, text: string): Map<string, RouteOperation> {
  if (!path.endsWith("/route.ts")) {
    throw new Error(`${path.slice(REPO_ROOT.length + 1)} must use the canonical route.ts extension`);
  }
  return inspectRouteSource(path, text);
}

function routeOperations(): Map<string, RouteOperation> {
  const operations = new Map<string, RouteOperation>();
  const routeFiles = walkFiles(join(REPO_ROOT, "app", "api", "v1"), (path) => ROUTE_MODULE_PATTERN.test(path));

  for (const path of routeFiles) {
    const text = readFileSync(path, "utf8");
    for (const [operation, route] of inspectRouteModule(path, text)) {
      if (operations.has(operation)) throw new Error(`duplicate REST route operation: ${operation}`);
      operations.set(operation, route);
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

function undocumentedRouteViolations(
  routes: ReadonlyMap<string, RouteOperation>,
  documented: ReadonlyMap<string, SpecOperation>,
): string[] {
  return [...routes]
    .filter(([operation]) => !documented.has(operation))
    .map(([operation, { file }]) => `${operation} (${file}) has no operation in generateOpenApiSpec()`);
}

function orphanedSpecViolations(
  routes: ReadonlyMap<string, RouteOperation>,
  documented: ReadonlyMap<string, SpecOperation>,
): string[] {
  return [...documented]
    .filter(([operation]) => !routes.has(operation))
    .map(([operation]) => `${operation} is in generateOpenApiSpec() but has no route handler under app/api/v1`);
}

function jsonContractViolations(
  routes: ReadonlyMap<string, RouteOperation>,
  documented: ReadonlyMap<string, SpecOperation>,
): string[] {
  const violations: string[] = [];

  for (const [operation, spec] of documented) {
    if (!hasJsonRequestBody(spec)) continue;
    if (spec.requestBody?.required !== true) {
      violations.push(`${operation} must declare its JSON requestBody as required`);
    }
    if (spec.responses?.["400"]?.content?.["application/json"] === undefined) {
      violations.push(`${operation} must document its JSON parse failure as an application/json 400 response`);
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
    if (route.jsonReaders.length > 0 && !route.hasExactMapperImport) {
      violations.push(`${operation} (${route.file}) must import mapRequestJsonError from the shared API boundary`);
    }
    if (route.jsonReaders.length > 0 && !route.hasExactHandleErrorImport) {
      violations.push(`${operation} (${route.file}) must import handleError from the shared API boundary`);
    }
  }

  return violations;
}

const SYNTHETIC_ROUTE_FILE = join(REPO_ROOT, "app", "api", "v1", "__route_analyzer_probe__", "route.ts");
const SYNTHETIC_SPEC_PATH = "/v1/__route_analyzer_probe__";
const HANDLE_ERROR_IMPORT = `import { handleError } from "@/core/api/interactor-handler";`;
const MAPPER_IMPORT = `import { mapRequestJsonError } from "@/core/api/request-json-error";`;
const ROUTE_IMPORTS = `${HANDLE_ERROR_IMPORT}\n${MAPPER_IMPORT}`;

type SyntheticSpecKind = "json" | "json-no-400" | "optional-json" | "none";
type SyntheticSpecs = Readonly<
  Partial<Record<"get" | "post" | "put" | "patch" | "delete" | "head" | "options", SyntheticSpecKind>>
>;

function syntheticSpecOperations(specs: SyntheticSpecs): Map<string, SpecOperation> {
  return new Map(
    Object.entries(specs).map(([verb, kind]) => [
      `${verb} ${SYNTHETIC_SPEC_PATH}`,
      kind === "none"
        ? {}
        : {
            requestBody: {
              required: kind !== "optional-json",
              content: { "application/json": {} },
            },
            ...(kind === "json-no-400"
              ? {}
              : {
                  responses: {
                    "400": { content: { "application/json": {} } },
                  },
                }),
          },
    ]),
  );
}

function syntheticViolations(source: string, specs: SyntheticSpecs): string[] {
  const routes = inspectRouteSource(SYNTHETIC_ROUTE_FILE, source);
  const documented = syntheticSpecOperations(specs);
  return [
    ...undocumentedRouteViolations(routes, documented),
    ...orphanedSpecViolations(routes, documented),
    ...jsonContractViolations(routes, documented),
  ];
}

function canonicalHandler(
  verb: "POST" | "PUT" | "PATCH" | "DELETE",
  options: { before?: string; after?: string; parameters?: string } = {},
): string {
  const { before = "", after = "return data;", parameters = "request: Request" } = options;
  return `
export async function ${verb}(${parameters}) {
  try {
    ${before}
    const data = await request.json().catch(mapRequestJsonError);
    ${after}
  } catch (error) {
    return handleError(error);
  }
}
`;
}

describe("REST route analyzer self-tests", () => {
  it.each([
    {
      name: "the canonical JSON boundary",
      source: ROUTE_IMPORTS + canonicalHandler("POST"),
      specs: { post: "json" } as const,
    },
    {
      name: "an exact boundary import grouped with another legitimate export",
      source:
        `import { CommonApiResponses, handleError } from "@/core/api/interactor-handler";` +
        MAPPER_IMPORT +
        canonicalHandler("POST"),
      specs: { post: "json" } as const,
    },
    {
      name: "parameter resolution before the canonical boundary",
      source:
        ROUTE_IMPORTS +
        canonicalHandler("PUT", {
          parameters: "request: Request, { params }: { params: Promise<{ id: string }> }",
          before: "const { id } = await params;",
          after: "return { data, id };",
        }),
      specs: { put: "json" } as const,
    },
    {
      name: "safe request metadata in a bodyless GET handler",
      source: `export function GET(request: Request) { return Response.json({ url: request.url, trace: request.headers.get("x-trace-id") }); }`,
      specs: { get: "none" } as const,
    },
    {
      name: "unrelated properties that share the request parameter's spelling",
      source: `export function GET(request: Request) { const client = { request: () => "accepted", arguments: "safe" }; const value: { request: string; arguments: string } = { request: client.request(), arguments: client.arguments }; return Response.json(value); }`,
      specs: { get: "none" } as const,
    },
    {
      name: "multiple canonical handlers in one route file",
      source: ROUTE_IMPORTS + canonicalHandler("POST") + canonicalHandler("PUT") + canonicalHandler("DELETE"),
      specs: { post: "json", put: "json", delete: "json" } as const,
    },
    {
      name: "a canonical PATCH handler",
      source: ROUTE_IMPORTS + canonicalHandler("PATCH"),
      specs: { patch: "json" } as const,
    },
    {
      name: "bodyless HEAD and OPTIONS handlers",
      source: `export function HEAD() { return new Response(null); } export function OPTIONS() { return new Response(null); }`,
      specs: { head: "none", options: "none" } as const,
    },
    {
      name: "an unrelated response.json() call after the request boundary",
      source:
        ROUTE_IMPORTS +
        canonicalHandler("POST", {
          after: `const response = new Response("{}"); const result = await response.json(); return { data, result };`,
        }),
      specs: { post: "json" } as const,
    },
    {
      name: "native JSON, Date, and URL parsers rather than domain schemas",
      source: `export function GET() { return Response.json({ payload: JSON.parse("{}"), timestamp: Date.parse("2026-09-05"), url: URL["parse"]("https://example.com") }); }`,
      specs: { get: "none" } as const,
    },
    {
      name: "interactor validation failures formatted at the transport boundary",
      source:
        ROUTE_IMPORTS +
        canonicalHandler("POST", {
          after: `const result = await getExampleInteractor().invoke(data); if (!result.ok) return Response.json(z.prettifyError(result.error), { status: 400 }); return Response.json(result.data);`,
        }),
      specs: { post: "json" } as const,
    },
  ])("accepts $name", ({ source, specs }) => {
    expect(syntheticViolations(source, specs)).toEqual([]);
  });

  it.each(["parse", "safeParse", "parseAsync", "safeParseAsync"])(
    "keeps schema %s methods out of REST input and output adapters",
    (method) => {
      const sources = [
        {
          source: ROUTE_IMPORTS + canonicalHandler("POST", { after: `return InputSchema.${method}(data);` }),
          specs: { post: "json" } as const,
        },
        {
          source: `export async function GET() { return OutputSchema.array()["${method}"]([]); }`,
          specs: { get: "none" } as const,
        },
        {
          source:
            ROUTE_IMPORTS +
            canonicalHandler("POST", {
              after: `const validate = InputSchema.${method}; return validate(data);`,
            }),
          specs: { post: "json" } as const,
        },
      ];

      for (const { source, specs } of sources) {
        expect(syntheticViolations(source, specs).join("\n")).toContain(
          "must keep schema parsing in interactors, not REST route modules",
        );
      }
    },
  );

  it.each([
    {
      name: "a parser without await",
      source:
        ROUTE_IMPORTS +
        `export async function POST(request: Request) { try { const data = request.json().catch(mapRequestJsonError); return data; } catch (error) { return handleError(error); } }`,
      specs: { post: "json" } as const,
      expected: "must read its documented JSON body exactly once; found 0",
    },
    {
      name: "a parser without the mapper",
      source:
        ROUTE_IMPORTS +
        `export async function POST(request: Request) { try { const data = await request.json(); return data; } catch (error) { return handleError(error); } }`,
      specs: { post: "json" } as const,
      expected: "must read its documented JSON body exactly once; found 0",
    },
    {
      name: "an aliased mapper import",
      source:
        HANDLE_ERROR_IMPORT +
        `import { mapRequestJsonError as mapper } from "@/core/api/request-json-error";` +
        canonicalHandler("POST").replace(".catch(mapRequestJsonError)", ".catch(mapper)"),
      specs: { post: "json" } as const,
      expected: "must read its documented JSON body exactly once; found 0",
    },
    {
      name: "a type-only mapper import",
      source:
        HANDLE_ERROR_IMPORT +
        `import type { mapRequestJsonError } from "@/core/api/request-json-error";` +
        canonicalHandler("POST"),
      specs: { post: "json" } as const,
      expected: "must import mapRequestJsonError from the shared API boundary",
    },
    {
      name: "a mapper import from the wrong module",
      source: HANDLE_ERROR_IMPORT + `import { mapRequestJsonError } from "./wrong-module";` + canonicalHandler("POST"),
      specs: { post: "json" } as const,
      expected: "must import mapRequestJsonError from the shared API boundary",
    },
    {
      name: "a handler-local mapper shadow",
      source:
        ROUTE_IMPORTS +
        canonicalHandler("POST", {
          before: "const mapRequestJsonError = (error: unknown) => error;",
        }),
      specs: { post: "json" } as const,
      expected: "must use the imported mapRequestJsonError without shadowing or aliases",
    },
    {
      name: "a mapper shadow in another handler parameter",
      source:
        ROUTE_IMPORTS +
        canonicalHandler("POST", {
          parameters: "request: Request, mapRequestJsonError: unknown",
        }),
      specs: { post: "json" } as const,
      expected: "must not shadow mapRequestJsonError with another handler parameter",
    },
    {
      name: "a hidden reader in a third default parameter",
      source:
        ROUTE_IMPORTS +
        canonicalHandler("POST", {
          parameters: "request: Request, context: unknown, hidden = request.json()",
          after: "await hidden; return { context, data };",
        }),
      specs: { post: "json" } as const,
      expected: "must declare at most the request and route context parameters",
    },
    {
      name: "a request alias alongside the canonical parser",
      source: ROUTE_IMPORTS + canonicalHandler("POST", { before: "const alias = request;" }),
      specs: { post: "json" } as const,
      expected: "or access its body outside the one canonical JSON parser",
    },
    {
      name: "an extra nested request read",
      source:
        ROUTE_IMPORTS +
        canonicalHandler("POST", {
          after: "async function extra() { return request.json(); } return { data, extra };",
        }),
      specs: { post: "json" } as const,
      expected: "or access its body outside the one canonical JSON parser",
    },
    {
      name: "two canonical parsers",
      source:
        ROUTE_IMPORTS +
        canonicalHandler("POST", {
          after: "const again = await request.json().catch(mapRequestJsonError); return { data, again };",
        }),
      specs: { post: "json" } as const,
      expected: "must read its documented JSON body exactly once; found 2",
    },
    {
      name: "a parser inside a branch",
      source:
        ROUTE_IMPORTS +
        `export async function POST(request: Request) { try { if (ready) { const data = await request.json().catch(mapRequestJsonError); return data; } } catch (error) { return handleError(error); } }`,
      specs: { post: "json" } as const,
      expected: "must read its documented JSON body exactly once; found 0",
    },
    {
      name: "a parser inside a loop",
      source:
        ROUTE_IMPORTS +
        `export async function POST(request: Request) { try { while (ready) { const data = await request.json().catch(mapRequestJsonError); return data; } } catch (error) { return handleError(error); } }`,
      specs: { post: "json" } as const,
      expected: "must read its documented JSON body exactly once; found 0",
    },
  ])("rejects $name", ({ source, specs, expected }) => {
    expect(syntheticViolations(source, specs).join("\n")).toContain(expected);
  });

  it.each([
    {
      name: "request.text()",
      source:
        ROUTE_IMPORTS +
        `export async function POST(request: Request) { try { const data = await request.text(); return data; } catch (error) { return handleError(error); } }`,
      specs: { post: "json" } as const,
      expected: "or access its body outside the one canonical JSON parser",
    },
    {
      name: "request.body",
      source:
        ROUTE_IMPORTS +
        `export async function POST(request: Request) { try { const data = request.body; return data; } catch (error) { return handleError(error); } }`,
      specs: { post: "json" } as const,
      expected: "or access its body outside the one canonical JSON parser",
    },
    {
      name: "computed JSON access",
      source:
        ROUTE_IMPORTS +
        `export async function POST(request: Request) { try { const data = await request["json"]().catch(mapRequestJsonError); return data; } catch (error) { return handleError(error); } }`,
      specs: { post: "json" } as const,
      expected: "or access its body outside the one canonical JSON parser",
    },
    {
      name: "a JSON call with an argument",
      source:
        ROUTE_IMPORTS +
        `export async function POST(request: Request) { try { const data = await request.json(undefined).catch(mapRequestJsonError); return data; } catch (error) { return handleError(error); } }`,
      specs: { post: "json" } as const,
      expected: "must read its documented JSON body exactly once; found 0",
    },
    {
      name: "an extracted JSON method",
      source:
        ROUTE_IMPORTS +
        `export async function POST(request: Request) { try { const parse = request.json.bind(request); const data = await parse().catch(mapRequestJsonError); return data; } catch (error) { return handleError(error); } }`,
      specs: { post: "json" } as const,
      expected: "or access its body outside the one canonical JSON parser",
    },
    {
      name: "a request alias through valueOf()",
      source:
        ROUTE_IMPORTS +
        canonicalHandler("POST", {
          after: "const hidden = request.valueOf(); await hidden.json(); return data;",
        }),
      specs: { post: "json" } as const,
      expected: "or access its body outside the one canonical JSON parser",
    },
    {
      name: "a request alias through computed valueOf()",
      source:
        ROUTE_IMPORTS +
        canonicalHandler("POST", {
          after: `const hidden = request["valueOf"](); await hidden.json(); return data;`,
        }),
      specs: { post: "json" } as const,
      expected: "or access its body outside the one canonical JSON parser",
    },
    {
      name: "arguments-based request access",
      source:
        ROUTE_IMPORTS +
        `export async function POST(request: Request) { try { const data = await arguments[0].json().catch(mapRequestJsonError); return data; } catch (error) { return handleError(error); } }`,
      specs: { post: "json" } as const,
      expected: "must not access the handler request through arguments",
    },
    {
      name: "eval-based request access",
      source:
        ROUTE_IMPORTS +
        `export async function POST(request: Request) { try { return eval("request.json()"); } catch (error) { return handleError(error); } }`,
      specs: { post: "json" } as const,
      expected: "must not access the handler request through eval",
    },
    {
      name: "parenthesized eval hiding an extra reader",
      source:
        ROUTE_IMPORTS +
        canonicalHandler("POST", {
          after: `const hidden = (eval)("request"); await hidden.json(); return data;`,
        }),
      specs: { post: "json" } as const,
      expected: "must not access the handler request through eval",
    },
    {
      name: "a swallowed parser error",
      source:
        ROUTE_IMPORTS +
        `export async function POST(request: Request) { try { const data = await request.json().catch(mapRequestJsonError); return data; } catch { return new Response(null, { status: 200 }); } }`,
      specs: { post: "json" } as const,
      expected: "must read its documented JSON body exactly once; found 0",
    },
    {
      name: "a parser outside the outer try",
      source:
        ROUTE_IMPORTS +
        `export async function POST(request: Request) { const data = await request.json().catch(mapRequestJsonError); try { return data; } catch (error) { return handleError(error); } }`,
      specs: { post: "json" } as const,
      expected: "must read its documented JSON body exactly once; found 0",
    },
    {
      name: "a return-overriding finally block",
      source:
        ROUTE_IMPORTS +
        `export async function POST(request: Request) { try { const data = await request.json().catch(mapRequestJsonError); return data; } catch (error) { return handleError(error); } finally { return new Response(null, { status: 200 }); } }`,
      specs: { post: "json" } as const,
      expected: "must read its documented JSON body exactly once; found 0",
    },
    {
      name: "a handler imported from the wrong error boundary",
      source: MAPPER_IMPORT + `import { handleError } from "./wrong-module";` + canonicalHandler("POST"),
      specs: { post: "json" } as const,
      expected: "must import handleError from the shared API boundary",
    },
    {
      name: "a request parameter that shadows handleError",
      source:
        ROUTE_IMPORTS +
        `export async function POST(handleError: Request) { try { const data = await handleError.json().catch(mapRequestJsonError); return data; } catch (error) { return handleError(error); } }`,
      specs: { post: "json" } as const,
      expected: "must not shadow handleError with the handler request parameter",
    },
    {
      name: "an alias-only reader without a requestBody",
      source:
        ROUTE_IMPORTS + `export async function GET(request: Request) { const alias = request; return alias.json(); }`,
      specs: { get: "none" } as const,
      expected: "or access its body outside the one canonical JSON parser",
    },
    {
      name: "a default-exported handler",
      source: ROUTE_IMPORTS + canonicalHandler("POST").replace("export async", "export default async"),
      specs: { post: "json" } as const,
      expected: "must export POST as a direct named function declaration",
    },
    {
      name: "an exported arrow handler",
      source:
        ROUTE_IMPORTS +
        `export const POST = async (request: Request) => { try { const data = await request.json().catch(mapRequestJsonError); return data; } catch (error) { return handleError(error); } };`,
      specs: { post: "json" } as const,
      expected: "must export POST as a direct named function declaration",
    },
    {
      name: "an exported function-expression handler",
      source:
        ROUTE_IMPORTS +
        `export const POST = async function (request: Request) { try { const data = await request.json().catch(mapRequestJsonError); return data; } catch (error) { return handleError(error); } };`,
      specs: { post: "json" } as const,
      expected: "must export POST as a direct named function declaration",
    },
    {
      name: "a named handler re-export",
      source: `const handler = () => null; export { handler as POST };`,
      specs: { post: "json" } as const,
      expected: "must export POST as a direct named function declaration",
    },
    {
      name: "a generator handler",
      source: `export function* POST(request: Request) { yield request; }`,
      specs: { post: "json" } as const,
      expected: "must export POST as a direct named function declaration",
    },
    {
      name: "duplicate handler exports",
      source: `export function POST() {} export function POST() {}`,
      specs: { post: "none" } as const,
      expected: "must declare POST exactly once",
    },
    {
      name: "a reassigned exported handler",
      source:
        ROUTE_IMPORTS +
        canonicalHandler("POST") +
        `POST = async function (request: Request) { return request.json(); };`,
      specs: { post: "json" } as const,
      expected: "must not reference or replace the exported POST handler outside its declaration",
    },
    {
      name: "top-level eval that can replace an exported handler",
      source: ROUTE_IMPORTS + canonicalHandler("POST") + `eval("POST = unsafe");`,
      specs: { post: "json" } as const,
      expected: "must not use eval in a REST route module",
    },
    {
      name: "a JSON parser without a documented request body",
      source: ROUTE_IMPORTS + canonicalHandler("POST"),
      specs: { post: "none" } as const,
      expected: "reads JSON without an OpenAPI application/json requestBody",
    },
    {
      name: "an optional documented JSON body",
      source: ROUTE_IMPORTS + canonicalHandler("POST"),
      specs: { post: "optional-json" } as const,
      expected: "must declare its JSON requestBody as required",
    },
    {
      name: "a documented JSON body without its parse-failure response",
      source: ROUTE_IMPORTS + canonicalHandler("POST"),
      specs: { post: "json-no-400" } as const,
      expected: "must document its JSON parse failure as an application/json 400 response",
    },
  ])("rejects $name", ({ source, specs, expected }) => {
    expect(syntheticViolations(source, specs).join("\n")).toContain(expected);
  });

  it("reports an undocumented route operation", () => {
    expect(syntheticViolations(ROUTE_IMPORTS + canonicalHandler("POST"), {}).join("\n")).toContain(
      "post /v1/__route_analyzer_probe__ (app/api/v1/__route_analyzer_probe__/route.ts) has no operation",
    );
  });

  it("reports an orphaned OpenAPI operation", () => {
    expect(syntheticViolations("", { post: "json" }).join("\n")).toContain(
      "post /v1/__route_analyzer_probe__ is in generateOpenApiSpec() but has no route handler",
    );
  });

  it("rejects export-star route modules", () => {
    expect(() => inspectRouteSource(SYNTHETIC_ROUTE_FILE, `export * from "./handler";`)).toThrow("uses export *");
  });

  it.each(["js", "jsx", "tsx"])("rejects route.%s modules that would bypass the route.ts analyzer", (extension) => {
    expect(() =>
      inspectRouteModule(SYNTHETIC_ROUTE_FILE.replace(/\.ts$/, `.${extension}`), "export function GET() {}"),
    ).toThrow("must use the canonical route.ts extension");
  });
});

describe("v1 REST OpenAPI coverage", () => {
  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("documents every route handler in the OpenAPI spec", () => {
    const undocumented = undocumentedRouteViolations(routeOperations(), specOperations());
    expect(undocumented).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("has a route handler for every spec operation", () => {
    const orphaned = orphanedSpecViolations(routeOperations(), specOperations());
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
      const violations = jsonContractViolations(routeOperations(), specOperations());

      expect(violations, violations.join("\n")).toEqual([]);
    },
  );
});
