import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const read = (path: string) => readFileSync(join(REPO_ROOT, path), "utf8");

const UNDECORATED_ALLOWLIST = new Set(["ee/operator/get/get-operator-console-visibility.interactor.ts"]);

function operatorInteractors() {
  return walkFiles(join(REPO_ROOT, "ee", "operator"), (path) => path.endsWith(".interactor.ts")).map((path) =>
    relative(REPO_ROOT, path),
  );
}

describe("operator access boundary", () => {
  it("authorizes every operator interactor through the operator decorator", () => {
    const undecorated = operatorInteractors().filter(
      (path) => !UNDECORATED_ALLOWLIST.has(path) && !read(path).includes("@OperatorInteractor"),
    );

    expect(undecorated).toEqual([]);
  });

  it("keeps the deliberately undecorated visibility interactor reduced to an eligibility boolean", () => {
    const visibility = read("ee/operator/get/get-operator-console-visibility.interactor.ts");

    expect(visibility).toContain("this.access.isEligible()");
    expect(visibility).toContain("Promise<boolean>");
    expect(visibility).not.toContain("prisma");
    expect(visibility).not.toMatch(/Unscoped\b/);
  });

  it("gates the console on cloud deployments inside authorizeFresh, not only in the route layout", () => {
    const service = read("ee/operator/operator-access.service.ts");
    const layout = read("app/[locale]/(protected)/operator/layout.tsx");

    expect(service).toContain('if (env.APP_MODE !== "cloud") throw new ForbiddenError');
    expect(service).toContain("await this.authService.getInteractiveSession()");
    expect(service).toContain("await this.repo.findAuthorizedActorUnscoped(session)");
    expect(service).toContain("async isEligible(): Promise<boolean>");
    expect(layout).toContain("getGetOperatorConsoleVisibilityInteractor().invoke()");
    expect(layout).toContain("notFound()");
  });

  it("isolates the operator actor per request and refuses unscoped work without one", () => {
    const context = read("core/decorators/operator-context.ts");
    const decorator = read("core/decorators/operator-interactor.decorator.ts");

    expect(context).toContain('AsyncLocalStorage } from "node:async_hooks"');
    expect(context).toContain("new AsyncLocalStorage<OperatorActor>()");
    expect(context).toContain('throw new Error("Operator context missing")');
    expect(decorator).toContain("authorizeFresh()");
    expect(decorator).toContain("runWithOperator(actor, () => originalInvoke.apply(this, args))");
  });

  it("routes every operator server action through an interactor rather than prisma", () => {
    const actions = walkFiles(join(REPO_ROOT, "app", "[locale]", "(protected)", "operator"), (path) =>
      path.endsWith("actions.ts"),
    ).map((path) => relative(REPO_ROOT, path));

    expect(actions.length).toBeGreaterThan(0);
    for (const path of actions) {
      const source = read(path);
      expect(source, path).not.toMatch(/\bprisma\b/);
      expect(source, path).toMatch(/Interactor\(\)/);
    }
  });

  it("guards every operator repository method whose name claims to be unscoped", () => {
    const repositories = walkFiles(join(REPO_ROOT, "ee", "operator"), (path) => path.endsWith(".repository.ts")).map(
      (path) => relative(REPO_ROOT, path),
    );

    expect(repositories.length).toBeGreaterThan(0);
    for (const path of repositories) {
      const source = readFileSync(join(REPO_ROOT, path), "utf8");
      const lines = source.split("\n");
      lines.forEach((line, index) => {
        const declared = /^\s*(?:private\s+)?(?:async\s+)?([A-Za-z0-9_]+Unscoped)\s*[(<]/.exec(line);
        if (!declared) return;
        const preceding = lines
          .slice(Math.max(0, index - 4), index)
          .join("\n");
        expect(preceding, `${path}:${index + 1} ${declared[1]}`).toContain("@BypassTenantGuard");
      });
    }
  });

  it("counts operator groups through the guarded Unscoped counts and never through prisma directly", () => {
    const listRepositories = [
      "ee/operator/prisma-operator-users.repository.ts",
      "ee/operator/prisma-operator-workspaces.repository.ts",
      "ee/operator/prisma-operator-audit.repository.ts",
    ];

    for (const path of listRepositories) {
      const source = read(path);
      const countByGroup = /\n  countByGroup\([\s\S]*?\n  \}\n/.exec(source)?.[0] ?? "";

      expect(source, path).toContain("getGroupableFields()");
      expect(source, path).toContain("return operatorCollator();");
      expect(countByGroup, path).toContain("countOperatorGroups(");
      expect(countByGroup, path).toMatch(/this\.[A-Za-z]+Unscoped\(/);
      expect(countByGroup, path).not.toMatch(/\bprisma\b/);
    }
  });

  it("names every cross-tenant operator repository method Unscoped and guards it", () => {
    const repositories = walkFiles(join(REPO_ROOT, "ee", "operator"), (path) => path.endsWith(".repository.ts")).map(
      (path) => relative(REPO_ROOT, path),
    );

    expect(repositories.length).toBeGreaterThan(0);
    for (const path of repositories) {
      const source = read(path);
      const guarded = source.match(/@BypassTenantGuard\s+(?:private\s+)?(?:async\s+)?([A-Za-z0-9_]+)\s*\(/g) ?? [];
      for (const match of guarded) {
        const name = /([A-Za-z0-9_]+)\s*\($/.exec(match.trim())?.[1] ?? "";
        expect(name, `${path} -> ${name}`).toMatch(/Unscoped$/);
      }
    }
  });
});
