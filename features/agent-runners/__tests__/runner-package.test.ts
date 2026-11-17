import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MCP_UNTRUSTED_CONTENT_INSTRUCTION } from "@/features/mcp-tools/server-instructions";

import { UNTRUSTED_CONTENT_INSTRUCTION } from "../../../packages/runner/src/untrusted";

const PACKAGE_ROOT = join(__dirname, "..", "..", "..", "packages", "runner");

function read(path: string): string {
  return readFileSync(join(PACKAGE_ROOT, path), "utf8");
}

describe("the customermates-runner package", () => {
  it("uses exactly the untrusted-content wording of the MCP server", () => {
    expect(UNTRUSTED_CONTENT_INSTRUCTION).toBe(MCP_UNTRUSTED_CONTENT_INSTRUCTION);
  });

  it("carries the repository licence, installs with npx and needs Node 24", () => {
    const manifest = JSON.parse(read("package.json")) as {
      name: string;
      license: string;
      bin: Record<string, string>;
      engines: { node: string };
      files: string[];
      dependencies?: unknown;
    };
    const rootManifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, "..", "..", "package.json"), "utf8")) as {
      license: string;
    };

    expect(manifest.name).toBe("customermates-runner");
    expect(manifest.license).toBe(rootManifest.license);
    expect(manifest.bin).toEqual({ "customermates-runner": "dist/cli.js" });
    expect(manifest.engines.node).toBe(">=24");
    expect(manifest.files).toContain("LICENSE.md");
    expect(manifest.dependencies).toBeUndefined();
  });

  it("says in its README that it carries the repository licence and shows the one-line install and the Docker command", () => {
    const readme = read("README.md");

    expect(readme).toContain("npx customermates-runner --token");
    expect(readme).toContain("docker run");
    expect(readme).toContain("Sustainable Use License");
    expect(readme).not.toMatch(/AGPL|Affero|MIT/u);
    expect(readme).not.toContain(String.fromCharCode(0x2014));
  });

  it("ships a Dockerfile that builds the package and runs it as a non-root user", () => {
    const dockerfile = read("Dockerfile");

    expect(dockerfile).toContain("FROM node:24");
    expect(dockerfile).toContain("USER node");
    expect(dockerfile).toContain('ENTRYPOINT ["node", "/app/dist/cli.js"]');
    expect(existsSync(join(PACKAGE_ROOT, "src", "cli.ts"))).toBe(true);
  });
});
