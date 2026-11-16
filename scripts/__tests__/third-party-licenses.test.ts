import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { collect, licenseField, main, parseLockfile, render, validateSpdx } from "../licenses/third-party-licenses.mjs";

const roots: string[] = [];

function project(options: { lock: string; packages: Record<string, Record<string, unknown>>; texts?: Record<string, string> }) {
  const root = mkdtempSync(join(tmpdir(), "licenses-"));
  roots.push(root);
  writeFileSync(join(root, "yarn.lock"), options.lock);
  for (const [dir, manifest] of Object.entries(options.packages)) {
    mkdirSync(join(root, "node_modules", dir), { recursive: true });
    writeFileSync(join(root, "node_modules", dir, "package.json"), JSON.stringify(manifest));
  }
  for (const [path, text] of Object.entries(options.texts ?? {})) writeFileSync(join(root, "node_modules", path), text);
  return root;
}

const LOCK = [
  "# yarn lockfile v1",
  "",
  '"@scope/pkg@^1.0.0", "@scope/pkg@^1.2.0":',
  '  version "1.2.3"',
  '  resolved "https://registry.yarnpkg.com/@scope/pkg/-/pkg-1.2.3.tgz#abc"',
  "",
  "plain@^2.0.0:",
  '  version "2.0.1"',
  "",
  '"alias-name@npm:real-name@3.0.0":',
  '  version "3.0.0"',
  "",
  '"@/generated/prisma@link:./generated/prisma":',
  '  version "0.0.0"',
  "",
].join("\n");

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("parseLockfile", () => {
  it("lists every resolved package once, with scoped names, aliases and without link entries", () => {
    expect(parseLockfile(LOCK)).toEqual([
      { name: "@scope/pkg", version: "1.2.3" },
      { name: "plain", version: "2.0.1" },
      { name: "real-name", version: "3.0.0" },
    ]);
  });
});

describe("validateSpdx", () => {
  it.each([
    ["MIT", "MIT"],
    ["mit", "MIT"],
    ["(MIT OR Apache-2.0)", "(MIT OR Apache-2.0)"],
    ["Apache-2.0 AND MIT", "Apache-2.0 AND MIT"],
    ["GPL-2.0-only WITH Classpath-exception-2.0", "GPL-2.0-only WITH Classpath-exception-2.0"],
    ["Apache-2.0+", "Apache-2.0+"],
    ["LicenseRef-customermates-commercial", "LicenseRef-customermates-commercial"],
    ["SUL-1.0", "SUL-1.0"],
  ])("accepts %s", (expression, normalized) => {
    expect(validateSpdx(expression)).toEqual({ valid: true, normalized });
  });

  it.each(["", "   ", "MIT/X11", "BSD", "UNLICENSED", "Public Domain", "SEE LICENSE IN LICENSE", "MIT OR", "(MIT", "MIT WITH nothing", "LicenseRef-x+"])(
    "rejects %j",
    (expression) => {
      expect(validateSpdx(expression).valid).toBe(false);
    },
  );
});

describe("licenseField", () => {
  it("reads a string, an object and a list", () => {
    expect(licenseField({ license: "MIT" })).toBe("MIT");
    expect(licenseField({ license: { type: "ISC" } })).toBe("ISC");
    expect(licenseField({ licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] })).toBe("(MIT OR Apache-2.0)");
    expect(licenseField({})).toBeNull();
  });
});

describe("collect and main", () => {
  it("passes when every installed package has a valid SPDX license and names the ones not installed", () => {
    const root = project({
      lock: LOCK,
      packages: {
        "@scope/pkg": { name: "@scope/pkg", version: "1.2.3", license: "MIT", repository: "github:scope/pkg" },
        plain: { name: "plain", version: "v2.0.1", license: "(ISC OR MIT)" },
      },
      texts: { "@scope/pkg/LICENSE": "MIT text\r\n", "plain/license.md": "ISC text" },
    });

    const result = collect({ root, overrides: {} });

    expect(result.problems).toEqual([]);
    expect(result.notInstalled).toEqual(["real-name@3.0.0"]);
    expect(result.packages.map((entry: { name: string; license: string }) => [entry.name, entry.license])).toEqual([
      ["@scope/pkg", "MIT"],
      ["plain", "(ISC OR MIT)"],
    ]);
    const markdown = render(result, "linux-x64");
    expect(markdown).toContain("| @scope/pkg | 1.2.3 | MIT | https://github.com/scope/pkg |");
    expect(markdown).toContain("Used by: @scope/pkg@1.2.3");
    expect(markdown).toContain("- real-name@3.0.0");
  });

  it("fails on a dependency without a valid SPDX license and writes nothing", () => {
    const root = project({
      lock: LOCK,
      packages: {
        "@scope/pkg": { name: "@scope/pkg", version: "1.2.3", license: "MIT" },
        plain: { name: "plain", version: "2.0.1", license: "Public Domain" },
      },
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(main(["--root", root], root, {})).toBe(1);
    expect(errors.mock.calls.flat().join("\n")).toContain("plain@2.0.1");
    expect(() => readFileSync(join(root, "THIRD_PARTY_LICENSES.md"))).toThrow();
  });

  it("fails on a package with no license field and accepts it once an override records the license and the reason", () => {
    const lock = ['plain@^2.0.0:', '  version "2.0.1"', ""].join("\n");
    const root = project({ lock, packages: { plain: { name: "plain", version: "2.0.1" } } });

    expect(collect({ root, overrides: {} }).problems[0]).toContain("no license field");
    expect(collect({ root, overrides: { "plain@2.0.1": { license: "MIT", reason: "LICENSE file says MIT" } } }).problems).toEqual([]);
    expect(collect({ root, overrides: { "plain@2.0.1": { license: "MIT", reason: "" } } }).problems[0]).toContain("needs a reason");
    expect(collect({ root, overrides: { "gone@1.0.0": { license: "MIT", reason: "x" }, "plain@2.0.1": { license: "MIT", reason: "x" } } }).problems).toEqual([
      "overrides.json: gone@1.0.0 is not in yarn.lock any more; remove it",
    ]);
  });

  it("fails when nothing is installed", () => {
    const root = project({ lock: LOCK, packages: {} });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(main(["--check", "--root", root], root, {})).toBe(1);
  });

  it("writes the file to --out, and only validates with --check", () => {
    const root = project({
      lock: ['plain@^2.0.0:', '  version "2.0.1"', ""].join("\n"),
      packages: { plain: { name: "plain", version: "2.0.1", license: "ISC" } },
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const out = join(root, "out.md");

    expect(main(["--check", "--root", root, "--out", out], root, {})).toBe(0);
    expect(() => readFileSync(out)).toThrow();
    expect(main(["--root", root, "--out", out], root, {})).toBe(0);
    expect(readFileSync(out, "utf8")).toContain("| plain | 2.0.1 | ISC |");
  });
});
