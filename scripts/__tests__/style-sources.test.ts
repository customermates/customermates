import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import postcss from "postcss";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateStyleSources, partitionStyles } from "../generate-style-sources.mjs";

let root: string;
function write(file: string, content: string) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}
function manifest(name = "public") {
  return fs.readFileSync(path.join(root, `styles/.generated/${name}.css`), "utf8");
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "style-sources-"));
  for (const directory of ["app/[locale]/(static)", "components", "core", "ee", "content"]) {
    fs.mkdirSync(path.join(root, directory), { recursive: true });
  }
  write(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: { baseUrl: ".", paths: { "@/*": ["./*"] } },
    }),
  );
  write("app/layout.tsx", "export default function Layout() { return null; }");
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("production style sources", () => {
  it("follows public runtime imports, re-exports and lazy components without collecting private app pages", () => {
    write(
      "app/[locale]/(static)/page.tsx",
      'import { Card } from "@/components/barrel"; import type { Model } from "@/core/model"; void import("@/components/lazy"); export default Card;',
    );
    write("components/barrel.ts", 'export { Card } from "./card";');
    write("components/card.tsx", 'export const Card = () => <div className="prose prose-sm" />;');
    write("components/lazy.tsx", 'export default function Lazy() { return <div className="animate-spin" />; }');
    write("core/model.ts", "export type Model = string;");
    write("app/[locale]/(protected)/page.tsx", 'export default function Page() { return <div className="w-3xs" />; }');
    generateStyleSources(root, false);
    expect(manifest()).toContain("components/card.tsx");
    expect(manifest()).toContain("components/lazy.tsx");
    expect(manifest()).not.toContain("core/model.ts");
    expect(manifest()).not.toContain("(protected)");
    expect(manifest()).toContain("../../content");
  });

  it("fails on unresolved local imports and untraceable lazy component paths", () => {
    write("app/layout.tsx", 'import "./missing";');
    expect(() => generateStyleSources(root, false)).toThrow("cannot resolve ./missing");
    write("app/layout.tsx", 'const file = "./component"; void import(file);');
    expect(() => generateStyleSources(root, false)).toThrow("nonliteral dynamic import");
  });

  it("covers generated MDX input without requiring Fumadocs output at config-load time", () => {
    write("app/layout.tsx", 'import { docs } from "@/.source/server"; export default docs;');
    generateStyleSources(root, false);
    expect(manifest()).toContain("../../content");
  });

  it("rejects direct MDX component imports without mistaking fenced examples for imports", () => {
    write("content/example.mdx", '```tsx\nimport Card from "./card";\n```');
    generateStyleSources(root, false);
    write("content/example.mdx", 'import Card from "./card";\n<Card />');
    expect(() => generateStyleSources(root, false)).toThrow("Register MDX components");
  });

  it("keeps development scanning broad so newly added files work without a restart", () => {
    generateStyleSources(root, true);
    expect(manifest()).toBe('@source "../..";\n');
  });
});

describe("public CSS partitioning", () => {
  it("preserves rule order and layer membership across bounded files", () => {
    const css =
      "@layer theme,utilities; @layer utilities{.hidden{display:none}@media(min-width:80rem){.xl\\:flex{display:flex}}.prose{color:blue}}";
    const root = postcss.parse(css);
    const parts = partitionStyles(root, 100);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => Buffer.byteLength(part) <= 101)).toBe(true);
    const rules = (input: string) => {
      const result: string[] = [];
      postcss.parse(input).walkRules((rule) => {
        const parents: string[] = [];
        let parent: postcss.Node["parent"] = rule.parent;
        while (parent && parent.type !== "root") {
          if (parent instanceof postcss.AtRule) parents.unshift(`${parent.name}:${parent.params}`);
          parent = parent.parent;
        }
        result.push(`${parents.join("/")} ${rule.toString()}`);
      });
      return result;
    };
    expect(rules(parts.join("\n"))).toEqual(rules(css));
  });
});
