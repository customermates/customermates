import { dirname, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

import { PROTECTED_ROUTES, PUBLIC_ROUTES } from "@/i18n/routing";

const LOCALE_ROOT = `${REPO_ROOT}${sep}app${sep}[locale]`;
const ROUTE_FILE = /^(page|route)\.(tsx|ts|jsx|js|mdx|md)$/u;

type RouteFile = { file: string; pattern: string; group: string | null; unsupported: string[] };

function routeFiles(): RouteFile[] {
  return walkFiles(LOCALE_ROOT, (path) => ROUTE_FILE.test(path.split(sep).at(-1) ?? ""))
    .filter((path) => !path.split(sep).includes("__tests__"))
    .map((path) => {
      const segments = relative(LOCALE_ROOT, dirname(path)).split(sep).filter(Boolean);
      const group = segments.find((segment) => segment.startsWith("(") && segment.endsWith(")")) ?? null;
      const unsupported = segments.filter(
        (segment) => segment.startsWith("@") || segment.startsWith("(.") || segment.startsWith("[..."),
      );
      const pattern = `/${segments
        .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")))
        .map((segment) => segment.replace(/^\[(\w+)\]$/u, ":$1"))
        .join("/")}`;
      return { file: relative(REPO_ROOT, path), pattern, group, unsupported };
    })
    .filter((route) => !/\.\w+$/u.test(route.pattern));
}

describe("route classification", () => {
  const routes = routeFiles();
  const patterns = new Set(routes.map((route) => route.pattern));
  const publicRoutes = new Set<string>(PUBLIC_ROUTES);
  const protectedRoutes = new Set<string>(PROTECTED_ROUTES);

  it("finds the route tree it classifies", () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  it("uses only segment shapes the proxy's route matcher can express", () => {
    expect(routes.filter((route) => route.unsupported.length > 0).map((route) => route.file)).toEqual([]);
  });

  it("declares every route as public or protected, and nothing that does not exist", () => {
    const declared = new Set([...publicRoutes, ...protectedRoutes]);

    expect([...patterns].filter((pattern) => !declared.has(pattern)).sort()).toEqual([]);
    expect([...declared].filter((pattern) => !patterns.has(pattern)).sort()).toEqual([]);
  });

  it("never declares a route both public and protected", () => {
    expect([...protectedRoutes].filter((pattern) => publicRoutes.has(pattern))).toEqual([]);
    expect(protectedRoutes.size).toBe(PROTECTED_ROUTES.length);
  });

  it("keeps every page in the protected group behind sign-in", () => {
    const protectedGroup = routes.filter((route) => route.group === "(protected)").map((route) => route.pattern);

    expect(protectedGroup.filter((pattern) => !protectedRoutes.has(pattern))).toEqual([]);
  });
});
