import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const ENFORCED = true;

const SCANNED_DIRECTORIES = ["app", "components", "features", "ee", "core", "workflows", "i18n"];
const FILE_ALLOWLIST = new Set(["core/di.ts"]);
const ALLOWED_DIRECTIVE = /^\s*(eslint-|@ts-|prettier-)/;
const TRIPLE_SLASH_REFERENCE = /^\/\/\/\s*<reference/;

function commentRangesOf(source: ts.SourceFile, text: string) {
  const seen = new Set<number>();
  const ranges: ts.CommentRange[] = [];
  const collect = (node: ts.Node) => {
    const children = node.getChildren(source);
    if (children.length > 0) {
      for (const child of children) collect(child);
      return;
    }
    const pos = node.getFullStart();
    const candidates = [
      ...(ts.getLeadingCommentRanges(text, pos) ?? []),
      ...(ts.getTrailingCommentRanges(text, pos) ?? []),
    ];
    for (const range of candidates) {
      if (seen.has(range.pos)) continue;
      seen.add(range.pos);
      ranges.push(range);
    }
  };
  collect(source);
  return ranges;
}

function isAllowedComment(raw: string) {
  if (TRIPLE_SLASH_REFERENCE.test(raw)) return true;
  const inner = raw.replace(/^\/\/+/, "").replace(/^\/\*+/, "");
  return ALLOWED_DIRECTIVE.test(inner);
}

function commentLines() {
  const violations: string[] = [];
  const paths = SCANNED_DIRECTORIES.flatMap((dir) =>
    walkFiles(join(REPO_ROOT, dir), (path) => /\.(ts|tsx)$/.test(path)),
  );
  for (const path of paths) {
    const file = relative(REPO_ROOT, path);
    if (FILE_ALLOWLIST.has(file)) continue;
    const text = readFileSync(path, "utf8");
    if (!text.includes("//") && !text.includes("/*")) continue;
    const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
    for (const range of commentRangesOf(source, text)) {
      const raw = text.slice(range.pos, range.end);
      if (isAllowedComment(raw)) continue;
      const startLine = ts.getLineAndCharacterOfPosition(source, range.pos).line;
      const endLine = ts.getLineAndCharacterOfPosition(source, range.end).line;
      for (let line = startLine; line <= endLine; line++) {
        const lineStart = source.getPositionOfLineAndCharacter(line, 0);
        const lineBreak = text.indexOf("\n", lineStart);
        const lineText = text.slice(lineStart, lineBreak === -1 ? text.length : lineBreak).trim();
        violations.push(`${file}:${line + 1}: ${lineText}`);
      }
    }
  }
  return violations;
}

describe("no code comments", () => {
  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("app code contains no comment lines", () => {
    const violations = commentLines();

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("detects comments in synthetic sources", () => {
    const text = 'const a = 1; // note\nconst b = "https://x.y//z";\nconst r = /https?:\\/\\//;\n{/* jsx */}\n';
    const source = ts.createSourceFile("probe.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const raws = commentRangesOf(source, text).map((range) => text.slice(range.pos, range.end));

    expect(raws).toEqual(["// note", "/* jsx */"]);
  });
});
