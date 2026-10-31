import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, sep } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { parseSource, readSourceText, REPO_ROOT, REPO_SCAN_TIMEOUT_MS, walkFiles } from "./walk";

// A route that reads a file through join(process.cwd(), ...) at run time gets that file in its serverless
// function only if output file tracing keeps it. Webpack builds do not trace these reads, so every such file
// needs an outputFileTracingIncludes glob under a key that matches the route; otherwise the deployed route
// fails with ENOENT while `next start` on a full checkout still works.

// The matcher Next itself applies to outputFileTracingIncludes keys and globs.
const picomatch = createRequire(import.meta.url)("next/dist/compiled/picomatch") as (
  glob: string,
  options: { contains?: boolean; dot?: boolean },
) => (path: string) => boolean;

const ROUTE_FILE = /[\\/](route|page|layout)\.tsx?$/;

function literalArgs(call: ts.CallExpression): string[] | null {
  const parts: string[] = [];
  for (const argument of call.arguments.slice(1)) {
    if (!ts.isStringLiteralLike(argument)) return null;
    parts.push(argument.text);
  }
  return parts;
}

function isProcessCwd(node: ts.Expression): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "process" &&
    node.expression.name.text === "cwd"
  );
}

function cwdReads(file: string): string[] {
  const reads: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === "join" || node.expression.text === "resolve") &&
      node.arguments[0] &&
      isProcessCwd(node.arguments[0])
    ) {
      const parts = literalArgs(node);
      if (parts) reads.push(join(...parts).split(sep).join("/"));
    }
    ts.forEachChild(node, visit);
  };
  visit(parseSource(file, readSourceText(file)));
  return reads;
}

function tracingIncludes(): Record<string, string[]> {
  const file = join(REPO_ROOT, "next.config.ts");
  const includes: Record<string, string[]> = {};
  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "outputFileTracingIncludes" &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const property of node.initializer.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isStringLiteralLike(property.name)) continue;
        const globs = ts.isArrayLiteralExpression(property.initializer)
          ? property.initializer.elements.filter(ts.isStringLiteralLike).map((element) => element.text)
          : [];
        includes[property.name.text] = globs;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parseSource(file, readSourceText(file)));
  return includes;
}

// Next normalizes app/og/[...slug]/route to /og/[...slug] and matches each include key against it with
// picomatch({ dot: true, contains: true }); see next/dist/build/collect-build-traces.js.
function routeOf(file: string): string {
  const segments = relative(join(REPO_ROOT, "app"), file).split(sep).slice(0, -1);
  return "/" + segments.filter((segment) => !/^\(.*\)$/.test(segment) && !segment.startsWith("@")).join("/");
}

function isTraced(route: string, path: string, includes: Record<string, string[]>): boolean {
  return Object.entries(includes).some(
    ([key, globs]) =>
      picomatch(key, { dot: true, contains: true })(route) &&
      globs.some((glob) => picomatch(glob.replace(/^\.\//, ""), { dot: true })(path)),
  );
}

describe("route file tracing", () => {
  it(
    "traces every file a route reads from process.cwd() at run time",
    () => {
      const includes = tracingIncludes();
      const reads = walkFiles(join(REPO_ROOT, "app"), (path) => ROUTE_FILE.test(path)).flatMap((file) =>
        cwdReads(file).map((path) => ({ path, route: routeOf(file) })),
      );

      expect(reads.map(({ route }) => route)).toContain("/og/[...slug]");
      for (const { path } of reads) expect(existsSync(join(REPO_ROOT, path)), path).toBe(true);
      expect(reads.filter(({ path, route }) => !isTraced(route, path, includes))).toEqual([]);
    },
    REPO_SCAN_TIMEOUT_MS,
  );
});
