import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

function git(args: readonly string[]) {
  return execFileSync("git", [...args], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

function baseCommit() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath) {
    const event: unknown = JSON.parse(readFileSync(eventPath, "utf8"));
    if (event && typeof event === "object") {
      const payload = event as { pull_request?: { base?: { sha?: unknown } }; before?: unknown };
      const candidate = payload.pull_request?.base?.sha ?? payload.before;
      if (typeof candidate === "string" && /^[a-f0-9]{40}$/i.test(candidate) && !/^0+$/.test(candidate)) {
        git(["cat-file", "-e", `${candidate}^{commit}`]);
        return candidate;
      }
    }
  }
  return git(["merge-base", "HEAD", "origin/main"]);
}

function changedTypeScriptFiles() {
  const tracked = git(["diff", "--name-only", "--diff-filter=ACMR", baseCommit()]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return [...new Set(`${tracked}\n${untracked}`.split("\n"))]
    .filter((file) => /\.(ts|tsx)$/.test(file) && existsSync(join(REPO_ROOT, file)))
    .sort();
}

function classesInSource(file: string, text: string) {
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const classes: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      classes.push(`${node.name?.text ?? "<anonymous>"}:${line}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return classes;
}

describe("one class per changed TypeScript file", () => {
  it("counts abstract classes, nested declarations and anonymous class expressions", () => {
    expect(classesInSource("fixture.ts", "abstract class Repo {}\nclass Interactor {}\nconst Factory = class {};"))
      .toEqual(["Repo:1", "Interactor:2", "<anonymous>:3"]);
  });

  it("ignores class-looking text and class methods", () => {
    expect(classesInSource("fixture.ts", 'const text = "class Other {}"; class One { method() {} }'))
      .toEqual(["One:1"]);
  });

  it("allows at most one class with no file exemptions", () => {
    const violations = changedTypeScriptFiles().flatMap((file) => {
      const classes = classesInSource(file, readFileSync(join(REPO_ROOT, file), "utf8"));
      return classes.length > 1 ? [`${file}: ${classes.join(", ")}`] : [];
    });
    expect(violations, violations.join("\n")).toEqual([]);
  }, 60000);
});
